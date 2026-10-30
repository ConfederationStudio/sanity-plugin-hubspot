import {describe, expect, it, vi} from 'vitest'

import {MODEL_VERSION, type HubSpotFormDefinition} from '../core/model'
import {SAMPLE_FORMS} from '../core/sample'
import {checkConfig} from './config'
import {
  copyDocument,
  fieldValue,
  keepCopy,
  syncCopies,
  type CopyClient,
  type CopyState,
} from './copies'

/**
 * The Studio's client, as far as copies go. `copy` answers a read of one copy, `referencing`
 * the documents that point at copies; a role that can't publish has every write refused.
 */
function fakeClient(answers: {copy?: CopyState; referencing?: unknown[]}, refused = false) {
  const written: string[] = []
  const archived: string[] = []
  const fetch = vi.fn()
  fetch.mockImplementation(async (query: string) =>
    query.includes('references') ? (answers.referencing ?? []) : (answers.copy ?? null),
  )
  const write = async (id: string, to: string[]) => {
    if (refused) throw new Error('Insufficient permissions; permission "create" required')
    to.push(id)
  }
  const client: CopyClient = {
    fetch,
    createOrReplace: (document) => write(document._id, written),
    patch: (id) => ({set: () => ({commit: () => write(id, archived)})}),
  }
  return {client, written, archived}
}

const changed = '2026-10-27T10:00:00.000Z'

/** Test forms, numbered, with a copy's state to match. */
const testForm = (n: number): HubSpotFormDefinition => ({
  ...SAMPLE_FORMS[0],
  formId: `00000000-0000-4000-8000-00000000000${n}`,
  name: `Form ${n}`,
  updatedAt: changed,
})
const copyOf = (n: number, state: Partial<CopyState> = {}): CopyState => ({
  _id: `hubspot-form-${testForm(n).formId}`,
  formId: testForm(n).formId,
  archived: false,
  updatedAt: changed,
  version: MODEL_VERSION,
  ...state,
})

describe('copyDocument', () => {
  const form = SAMPLE_FORMS[0]
  const copy = copyDocument(form, '2026-10-27T10:00:00.000Z')

  it('keeps the model, under an id with no dot', () => {
    expect(copy._id).toBe(`hubspot-form-${form.formId}`)
    expect(copy._id).not.toContain('.')
    expect(copy).toMatchObject({_type: 'hubspot.formDefinition', name: form.name, archived: false})
  })

  it('types every array item, so the Studio can show it', () => {
    const group = copy.groups[2]
    expect(group).toMatchObject({_type: 'hubspot.formGroup'})
    const field = group?.fields[0]
    expect(field).toMatchObject({_type: 'hubspot.formField', name: 'topic'})
    expect(field?.options[0]).toMatchObject({_type: 'hubspot.formOption'})
    expect(field?.followUps[0]).toMatchObject({
      _type: 'hubspot.formFollowUp',
      field: {_type: 'hubspot.formField', name: 'company'},
    })
    expect(copy.consent.type === 'explicit' && copy.consent.checkboxes[0]).toMatchObject({
      _type: 'hubspot.formSubscription',
    })
  })

  it('points the field at the copy with a weak reference', () => {
    expect(fieldValue(form)).toEqual({
      _type: 'hubspot.form',
      formId: form.formId,
      name: form.name,
      definition: {_type: 'reference', _ref: copy._id, _weak: true},
    })
  })
})

describe('checkConfig', () => {
  it('takes the site’s route as an address or a path', () => {
    expect(checkConfig({api: 'https://www.example.com/api/hubspot/'}).api).toBe(
      'https://www.example.com/api/hubspot',
    )
    expect(checkConfig({api: '/api/hubspot'}).api).toBe('/api/hubspot')
    expect(() => checkConfig({api: 'www.example.com'})).toThrow()
  })
})

describe('keepCopy', () => {
  const form = testForm(1)

  it('leaves a current copy alone, so a role that can’t write can still pick the form', async () => {
    const {client, written} = fakeClient({copy: copyOf(1)}, true)
    expect(await keepCopy(client, form)).toBe('current')
    expect(written).toEqual([])
  })

  it('writes the copy when HubSpot has changed the form since', async () => {
    const {client, written} = fakeClient({copy: copyOf(1, {updatedAt: '2026-01-01T00:00:00.000Z'})})
    expect(await keepCopy(client, form)).toBe('written')
    expect(written).toEqual([copyOf(1)._id])
  })

  it('says whether the site still has a copy when the role can’t write one', async () => {
    expect(await keepCopy(fakeClient({copy: copyOf(1, {version: 0})}, true).client, form)).toBe(
      'stale',
    )
    expect(await keepCopy(fakeClient({}, true).client, form)).toBe('missing')
  })
})

describe('syncCopies', () => {
  const gone = {form: async () => ({form: null})}
  const draftPicking = (n: number) => ({_id: 'drafts.page', form: fieldValue(testForm(n))})

  it('copies a form a draft picked without one, and leaves forms nobody uses', async () => {
    const {client, written, archived} = fakeClient({referencing: [draftPicking(3)]})
    const forms = [1, 2, 3, 4].map(testForm)
    const copies = [copyOf(1), copyOf(2, {updatedAt: '2026-01-01T00:00:00.000Z'}), copyOf(5)]
    expect(await syncCopies(client, gone, forms, copies, false)).toEqual({
      written: 2,
      archived: 1,
      failed: 0,
    })
    expect(written.toSorted()).toEqual([copyOf(2)._id, copyOf(3)._id])
    expect(archived).toEqual([copyOf(5)._id])
  })

  it('counts the copies a role can’t write', async () => {
    const {client} = fakeClient({referencing: [draftPicking(3)]}, true)
    const forms = [1, 2, 3].map(testForm)
    expect(
      await syncCopies(client, gone, forms, [copyOf(1), copyOf(2, {version: 0})], false),
    ).toEqual({
      written: 0,
      archived: 0,
      failed: 2,
    })
  })
})

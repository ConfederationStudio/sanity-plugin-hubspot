import {describe, expect, it} from 'vitest'

import {MODEL_VERSION, type HubSpotAccount, type HubSpotFormDefinition} from '../../core/model'
import type {HubSpotConnection} from '../../core/route'
import {SAMPLE_FORMS} from '../../core/sample'
import type {SyncResult} from '../copies'
import {accountLinks, formLinks} from './links'
import {countRows, filterRows, firstFilter, formRows, type CopyFacts} from './rows'
import {runSummary} from './runs'
import {isSetUp, setupSteps} from './setup'
import {pagesQuery, pageTypes, trackingOverview, type SchemaLike} from './tracking'

const changed = '2026-10-27T10:00:00.000Z'

const testForm = (
  n: number,
  facts: Partial<HubSpotFormDefinition> = {},
): HubSpotFormDefinition => ({
  ...SAMPLE_FORMS[0],
  formId: `11111111-0000-4000-8000-00000000000${n}`,
  name: `Form ${n}`,
  updatedAt: changed,
  ...facts,
})

const copyOf = (n: number, facts: Partial<CopyFacts> = {}): CopyFacts => ({
  _id: `hubspot-form-${testForm(n).formId}`,
  formId: testForm(n).formId,
  name: `Form ${n}`,
  archived: false,
  drawable: true,
  undrawable: [],
  progressive: false,
  updatedAt: changed,
  version: MODEL_VERSION,
  syncedAt: '2026-10-28T09:00:00.000Z',
  usedOn: [],
  ...facts,
})

const page = (id: string) => ({_id: id, _type: 'page', title: id})
const account: HubSpotAccount = {
  portalId: '14829301',
  region: 'eu1',
  uiDomain: 'app-eu1.hubspot.com',
}

describe('formRows', () => {
  const forms = [
    testForm(1),
    testForm(2, {drawable: false, undrawable: ['file']}),
    testForm(3),
    testForm(4),
  ]
  const copies = [
    copyOf(1, {usedOn: [page('home'), page('drafts.home'), page('pricing')]}),
    copyOf(2, {usedOn: [page('careers')]}),
    copyOf(3, {updatedAt: '2026-01-01T00:00:00.000Z'}),
    copyOf(9, {name: 'Webinar 2025', archived: true, usedOn: [page('events')]}),
  ]
  const rows = formRows(forms, copies)
  const row = (n: number) => rows.find((one) => one.formId === testForm(n).formId)

  it('counts a draft and its published document once', () => {
    expect(row(1)?.usedOn.map((document) => document._id)).toEqual(['home', 'pricing'])
  })

  it('says whether the site has the form as HubSpot has it now', () => {
    expect(row(1)?.copy).toBe('current')
    expect(row(3)?.copy).toBe('outdated')
    expect(row(4)?.copy).toBe('none')
  })

  it('keeps the copy of a form HubSpot no longer lists, as archived', () => {
    expect(row(9)).toMatchObject({name: 'Webinar 2025', archived: true, attention: true})
    expect(row(9)?.form).toBeUndefined()
  })

  it('flags a form in use that the site can’t draw, and leaves unused ones alone', () => {
    expect(row(2)?.attention).toBe(true)
    expect(row(1)?.attention).toBe(false)
    expect(formRows([testForm(5, {drawable: false})], [])[0]?.attention).toBe(false)
  })

  it('puts what needs attention first, then the most used, then by name', () => {
    expect(rows.map((one) => one.name)).toEqual([
      'Form 2',
      'Webinar 2025',
      'Form 1',
      'Form 3',
      'Form 4',
    ])
  })

  it('counts the rows each filter keeps', () => {
    const counts = countRows(rows)
    expect(counts).toEqual({'in-use': 3, 'attention': 2, 'unused': 2, 'all': 5, 'drawn': 1})
    expect(firstFilter(counts)).toBe('in-use')
    expect(firstFilter(countRows(formRows(forms, [])))).toBe('all')
  })

  it('filters, then searches names for every word, or ids for what was typed', () => {
    expect(filterRows(rows, 'unused', '').map((one) => one.name)).toEqual(['Form 3', 'Form 4'])
    expect(filterRows(rows, 'all', 'webinar 2025').map((one) => one.name)).toEqual(['Webinar 2025'])
    expect(filterRows(rows, 'all', '0000000004').map((one) => one.name)).toEqual(['Form 4'])
    // A digit that only an id holds finds nothing: ids are searched from four characters.
    expect(filterRows(rows, 'in-use', 'form 4')).toEqual([])
    expect(filterRows(rows, 'all', '8')).toEqual([])
  })
})

describe('links into HubSpot', () => {
  const formId = testForm(1).formId

  it('go to the account’s own data centre', () => {
    expect(accountLinks(account)).toEqual({
      forms: 'https://app-eu1.hubspot.com/forms/14829301',
      contacts: 'https://app-eu1.hubspot.com/contacts/14829301',
      reports: 'https://app-eu1.hubspot.com/reports-dashboard/14829301',
      chat: 'https://app-eu1.hubspot.com/chatflows/14829301',
    })
    expect(formLinks(account, formId)).toEqual({
      edit: `https://app-eu1.hubspot.com/forms/14829301/editor/${formId}/edit/form`,
      submissions: `https://app-eu1.hubspot.com/submissions/14829301/form/${formId}/submissions`,
    })
  })

  it('never leave HubSpot, whatever domain the account names', () => {
    const odd = {...account, uiDomain: 'app.hubspot.com.example.org'}
    expect(accountLinks(odd)?.forms).toBe('https://app.hubspot.com/forms/14829301')
    expect(formLinks({...account, uiDomain: 'evil.example/'}, formId)?.edit).toMatch(
      /^https:\/\/app\.hubspot\.com\//,
    )
  })

  it('are left out without an account, or for an id that isn’t one', () => {
    expect(accountLinks(undefined)).toBeUndefined()
    expect(accountLinks({...account, portalId: '12/../x'})).toBeUndefined()
    expect(formLinks(account, 'not-a-form')).toBeUndefined()
  })
})

describe('setupSteps', () => {
  const api = 'https://www.example.com/api/hubspot'
  const states = (input: Parameters<typeof setupSteps>[0]) =>
    setupSteps(input).map((step) => step.state)
  const connected: HubSpotConnection = {
    status: 'connected',
    source: 'environment',
    account,
    canSaveKey: false,
  }

  it('is all done once HubSpot is connected', () => {
    const steps = setupSteps({connection: connected, api})
    expect(isSetUp(steps)).toBe(true)
    expect(steps.find((step) => step.id === 'hubspot')?.detail).toContain('14829301')
  })

  it('waits on everything while the route hasn’t answered', () => {
    expect(states({api})).toEqual(['waiting', 'waiting', 'waiting', 'waiting', 'waiting'])
  })

  it('stops at the step a failure belongs to, and says what to do', () => {
    expect(states({failure: 'no-token', api})).toEqual([
      'failed',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
    ])
    expect(states({failure: 'unreachable', api})).toEqual([
      'done',
      'failed',
      'waiting',
      'waiting',
      'waiting',
    ])
    const origin = setupSteps({failure: 'forbidden-origin', api})
    expect(origin.map((step) => step.state)).toEqual([
      'done',
      'done',
      'failed',
      'waiting',
      'waiting',
    ])
    expect(origin[2]?.detail).toContain('studioOrigins')
    expect(states({failure: 'rate-limited', api})).toEqual([
      'done',
      'done',
      'done',
      'done',
      'failed',
    ])
  })

  it('makes the key the next step when there is none, and a failure when it can’t be opened', () => {
    const none = setupSteps({connection: {status: 'not-connected', canSaveKey: true}, api})
    expect(none.map((step) => step.state)).toEqual(['done', 'done', 'done', 'next', 'waiting'])
    expect(none[3]?.detail).toContain('Paste')
    expect(
      setupSteps({connection: {status: 'not-connected', canSaveKey: false}, api})[3]?.detail,
    ).toContain('HUBSPOT_TOKEN')
    expect(
      states({connection: {status: 'not-connected', canSaveKey: true, unreadable: true}, api})[3],
    ).toBe('failed')
  })

  it('tells a key HubSpot refuses from one without the forms scope', () => {
    const refused = setupSteps({
      connection: {status: 'key-rejected', source: 'studio', canSaveKey: true},
      api,
    })
    expect(refused.map((step) => step.state)).toEqual(['done', 'done', 'done', 'done', 'failed'])
    expect(refused[4]?.detail).toContain('Service Key')
    expect(
      setupSteps({
        connection: {status: 'key-lacks-scope', source: 'environment', canSaveKey: false},
        api,
      })[4]?.detail,
    ).toContain('forms scope')
  })

  it('names stand-in mode as a key still to set', () => {
    const steps = setupSteps({connection: {status: 'stand-in'}, api})
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'done', 'next', 'waiting'])
    expect(isSetUp(steps)).toBe(false)
  })
})

describe('runSummary', () => {
  const result = (counts: Partial<SyncResult>): SyncResult => ({
    written: 0,
    archived: 0,
    failed: 0,
    changes: [],
    ...counts,
  })

  it('says what a refresh did', () => {
    expect(runSummary(result({}))).toBe('Every copy was already up to date.')
    expect(runSummary(result({written: 1}))).toBe('1 copy updated.')
    expect(runSummary(result({written: 2, archived: 1, failed: 3}))).toBe(
      '2 copies updated, 1 copy marked archived, 3 copies couldn’t be written.',
    )
  })
})

describe('the tracking overview', () => {
  const schema: SchemaLike = {
    getTypeNames: () => ['page', 'post', 'author', 'seo', 'hubspot.page'],
    get: (name) =>
      ({
        'page': {
          title: 'Page',
          type: {name: 'document'},
          fields: [
            {name: 'title', type: {name: 'string'}},
            {name: 'hubspot', type: {name: 'hubspot.page'}},
          ],
        },
        'post': {title: 'Post', type: {name: 'document'}, fields: []},
        'author': {title: 'Author', type: {name: 'document'}, fields: []},
        'seo': {title: 'SEO', type: {name: 'object'}, fields: []},
        'hubspot.page': {title: 'HubSpot', type: {name: 'object'}, fields: []},
      })[name],
  }
  const types = pageTypes(schema, {post: 'blog-post', campaign: 'landing-page', author: 'nope'})

  it('lists the document types that are mapped or carry the field', () => {
    expect(types).toEqual([
      {type: 'campaign', title: 'campaign', mapped: 'landing-page'},
      {type: 'page', title: 'Page', field: 'hubspot'},
      {type: 'post', title: 'Post', mapped: 'blog-post'},
    ])
  })

  it('asks only for the documents whose field says something', () => {
    expect(pagesQuery(types)).toBe(
      '*[(_type == "page" && (defined(hubspot.contentType) || hubspot.hideChat == true))][0...500]{_id, _type, "title": coalesce(title, name, heading, _id), "contentType": select(_type == "page" => hubspot.contentType), "hideChat": select(_type == "page" => hubspot.hideChat)}',
    )
    expect(pagesQuery(types.filter((type) => !type.field))).toBeUndefined()
  })

  it('takes only plain names into the query', () => {
    expect(pagesQuery([{type: 'page', title: 'Page', field: 'a"] | *[true'}])).toBeUndefined()
    expect(pagesQuery([{type: 'pa"ge', title: 'Page', field: 'hubspot'}])).toBeUndefined()
  })

  it('sorts pages into overrides and hidden chat, the published document speaking for its draft', () => {
    const overview = trackingOverview([
      {_id: 'drafts.home', _type: 'page', title: 'Home', contentType: 'blog-post', hideChat: true},
      {_id: 'home', _type: 'page', title: 'Home', contentType: 'landing-page', hideChat: false},
      {_id: 'drafts.legal', _type: 'page', title: 'Legal', contentType: '', hideChat: true},
      {_id: 'about', _type: 'page', title: 'About', contentType: 'made-up', hideChat: null},
    ])
    expect(overview.overrides).toEqual([
      {_id: 'home', _type: 'page', title: 'Home', contentType: 'landing-page'},
    ])
    expect(overview.chatHidden).toEqual([{_id: 'legal', _type: 'page', title: 'Legal'}])
  })
})

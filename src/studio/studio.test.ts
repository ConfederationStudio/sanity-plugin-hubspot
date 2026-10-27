import {describe, expect, it} from 'vitest'

import {SAMPLE_FORMS} from '../core/sample'
import {checkConfig} from './config'
import {copyDocument, fieldValue} from './copies'

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

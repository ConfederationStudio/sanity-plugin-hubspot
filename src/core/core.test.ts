import {describe, expect, it} from 'vitest'

import {answerOf, meetsCondition} from './conditions'
import {fitsFields} from './drawable'
import {embedScriptUrl, regionFromUiDomain, submitUrl, trackingScriptUrl} from './hosts'
import type {RawForm} from './hubspot'
import {formCopyId} from './ids'
import {layoutForm} from './layout'
import {CONSENT_INPUT, HONEYPOT_INPUT, subscriptionInput} from './names'
import {parseForm, summarize} from './parse'
import {SAMPLE_FORMS} from './sample'
import {readHubSpotReply, readHutk, readSubmission} from './submission'
import {plainText} from './text'

const FORM_ID = '3f0f3c1e-8d2a-4b8e-9c55-1a2b3c4d5e6f'

const raw = (overrides: Partial<RawForm> = {}): RawForm => ({
  id: FORM_ID.toUpperCase(),
  name: 'Demo request',
  fieldGroups: [
    {groupType: 'default_group', richTextType: 'text', richText: '<h3>Tell us about you</h3>'},
    {
      groupType: 'default_group',
      fields: [
        {fieldType: 'email', name: 'email', label: 'Work email', required: true},
        {fieldType: 'single_line_text', name: 'name', objectTypeId: '0-2', label: 'Company'},
      ],
    },
    {
      groupType: 'default_group',
      fields: [
        {
          fieldType: 'single_checkbox',
          name: 'wants_call',
          label: 'Call me',
          dependentFields: [
            {
              dependentCondition: {operator: 'eq', value: 'true'},
              dependentField: {fieldType: 'phone', name: 'phone', label: 'Phone', required: true},
            },
          ],
        },
        {fieldType: 'single_line_text', name: 'source', hidden: true, defaultValue: 'site'},
      ],
    },
    {groupType: 'progressive', fields: [{fieldType: 'single_line_text', name: 'jobtitle'}]},
  ],
  ...overrides,
})

describe('parseForm', () => {
  it('turns HubSpot’s definition into the model', () => {
    const form = parseForm(raw(), {portalId: '123', region: 'eu1'})
    expect(form).not.toBeNull()
    expect(form?.formId).toBe(FORM_ID)
    expect(form?.portalId).toBe('123')
    expect(form?.groups).toHaveLength(3)
    expect(form?.groups[0]?.text).toBe('<h3>Tell us about you</h3>')
    expect(form?.progressive).toBe(true)
    expect(form?.drawable).toBe(true)
    expect(form?.embed).toBe('legacy')
    expect(form?.submitText).toBe('Submit')
  })

  it('labels an unlabelled field from its placeholder', () => {
    const form = parseForm(
      raw({
        fieldGroups: [
          {
            groupType: 'default_group',
            fields: [{fieldType: 'email', name: 'email', placeholder: 'Email'}],
          },
        ],
      }),
    )
    expect(form?.groups[0]?.fields[0]).toMatchObject({label: 'Email', hasLabel: false})
  })

  it('refuses what isn’t a form', () => {
    expect(parseForm({id: 'nope', name: 'x', fieldGroups: []})).toBeNull()
    expect(parseForm(null)).toBeNull()
  })

  it('says why a form can’t be drawn', () => {
    const form = parseForm(
      raw({
        configuration: {recaptchaEnabled: true},
        fieldGroups: [
          {groupType: 'default_group', fields: [{fieldType: 'file', name: 'cv', label: 'CV'}]},
          {
            groupType: 'default_group',
            fields: [
              {
                fieldType: 'datepicker',
                name: 'start',
                dependentFields: [
                  {
                    dependentCondition: {operator: 'within_time', value: '7'},
                    dependentField: {fieldType: 'number', name: 'days'},
                  },
                ],
              },
            ],
          },
        ],
        legalConsentOptions: {
          type: 'legitimate_interest',
          lawfulBasis: 'lead',
          subscriptionTypeIds: [1, 2],
        },
      }),
    )
    expect(form?.drawable).toBe(false)
    expect(form?.undrawable).toEqual(['recaptcha', 'file', 'condition', 'consent-subscriptions'])
  })

  it('keeps only http redirects', () => {
    const go = (value: string) =>
      parseForm(raw({configuration: {postSubmitAction: {type: 'redirect_url', value}}}))
        ?.afterSubmit
    expect(go('https://example.com/thanks')).toEqual({
      type: 'redirect',
      url: 'https://example.com/thanks',
    })
    expect(go('javascript:alert(1)')).toEqual({type: 'none'})
  })

  it('counts visible fields in the summary', () => {
    const form = parseForm(raw())
    expect(form && summarize(form).fieldCount).toBe(4)
  })
})

describe('conditions', () => {
  it('reads answers the way HubSpot does', () => {
    expect(answerOf('checkbox', [])).toEqual(['false'])
    expect(answerOf('checkbox', ['on'])).toEqual(['true'])
    expect(answerOf('checkboxes', ['a', ' ', 'b'])).toEqual(['a', 'b'])
    expect(answerOf('text', [' hi ', 'there'])).toEqual(['hi'])
  })

  it('judges text, numbers, dates and sets', () => {
    expect(meetsCondition({operator: 'eq', value: 'Yes'}, ['yes'])).toBe(true)
    expect(meetsCondition({operator: 'contains', value: 'acme'}, ['ACME Ltd'])).toBe(true)
    expect(meetsCondition({operator: 'gt', value: '10'}, ['11'])).toBe(true)
    expect(
      meetsCondition({operator: 'between', rangeStart: '2026-01-01', rangeEnd: '2026-12-31'}, [
        '2026-06-01',
      ]),
    ).toBe(true)
    expect(meetsCondition({operator: 'not_between', rangeStart: '1', rangeEnd: '5'}, ['x'])).toBe(
      false,
    )
    expect(meetsCondition({operator: 'set_all', values: ['a', 'b']}, ['b', 'a', 'c'])).toBe(true)
    expect(meetsCondition({operator: 'set_eq', values: ['a', 'b']}, ['b', 'a', 'c'])).toBe(false)
    expect(meetsCondition({operator: 'is_not_empty'}, [])).toBe(false)
    expect(meetsCondition({operator: 'within_time', value: '7'}, ['2026-01-01'])).toBe(false)
  })
})

describe('fitsFields', () => {
  const [contact, newsletter] = SAMPLE_FORMS

  it('takes a site’s own email field for a form that asks for nothing else', () => {
    expect(fitsFields(newsletter.groups, ['email'])).toEqual({fits: true, missing: [], unsent: []})
  })

  it('names what the form requires and what it lacks', () => {
    expect(fitsFields(contact.groups, ['email', 'phone'])).toEqual({
      fits: false,
      missing: ['phone'],
      unsent: ['firstname', 'lastname'],
    })
  })

  it('counts a required follow-up only when its parent is sent', () => {
    expect(fitsFields(contact.groups, ['firstname', 'lastname', 'email']).unsent).toEqual([])
    expect(fitsFields(contact.groups, ['firstname', 'lastname', 'email', 'topic']).unsent).toEqual([
      'company',
    ])
  })
})

describe('layoutForm', () => {
  const form = parseForm(raw())!

  it('draws text, rows and hidden inputs in order', () => {
    expect(layoutForm(form).map((part) => part.kind)).toEqual(['text', 'row', 'row', 'hidden'])
  })

  it('names a field of another object after its object', () => {
    const row = layoutForm(form)[1]
    expect(row?.kind === 'row' && row.fields.map((field) => field.name)).toEqual([
      'email',
      '0-2/name',
    ])
  })

  it('shows a follow-up under its row once its condition holds', () => {
    const parts = layoutForm(form, {wants_call: ['true']})
    expect(parts.map((part) => part.kind)).toEqual(['text', 'row', 'row', 'row', 'hidden'])
    const followUp = parts[3]
    expect(followUp?.kind === 'row' && followUp.fields[0]?.name).toBe('phone')
  })
})

const data = (entries: Record<string, string | string[]>) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(entries))
    for (const one of [value].flat()) body.append(name, one)
  return body
}

describe('readSubmission', () => {
  const form = parseForm(raw())!

  it('sends what showed, in HubSpot’s shape', () => {
    const result = readSubmission(
      form,
      data({'email': 'a@b.co', '0-2/name': 'Acme', 'hubspot:page': 'https://site.test/demo'}),
    )
    expect(result).toEqual({
      status: 'ready',
      submission: {
        fields: [
          {objectTypeId: '0-1', name: 'email', value: 'a@b.co'},
          {objectTypeId: '0-2', name: 'name', value: 'Acme'},
          {objectTypeId: '0-1', name: 'source', value: 'site'},
        ],
        context: {pageUri: 'https://site.test/demo'},
      },
    })
  })

  it('checks only the follow-ups that showed', () => {
    expect(readSubmission(form, data({email: 'a@b.co'})).status).toBe('ready')
    expect(readSubmission(form, data({email: 'a@b.co', wants_call: 'true'}))).toEqual({
      status: 'invalid',
      errors: {phone: 'required'},
    })
  })

  it('catches a bad email and a filled honeypot', () => {
    expect(readSubmission(form, data({email: 'nope'}))).toEqual({
      status: 'invalid',
      errors: {email: 'invalid'},
    })
    expect(readSubmission(form, data({email: 'a@b.co', [HONEYPOT_INPUT]: 'x'}))).toEqual({
      status: 'spam',
    })
  })

  it('asks for consent and records it', () => {
    const contact = SAMPLE_FORMS[0]
    const base = {firstname: 'Ada', lastname: 'L', email: 'ada@example.com'}
    expect(readSubmission(contact, data(base))).toEqual({
      status: 'invalid',
      errors: {[CONSENT_INPUT]: 'required'},
    })
    const result = readSubmission(
      contact,
      data({...base, [CONSENT_INPUT]: 'true', [subscriptionInput(1)]: 'true'}),
    )
    expect(result.status === 'ready' && result.submission.legalConsentOptions).toEqual({
      consent: {
        consentToProcess: true,
        text: 'I agree to my details being stored.',
        communications: [{value: true, subscriptionTypeId: 1, text: 'I’d like news by email.'}],
      },
    })
  })

  it('records a legitimate interest', () => {
    const result = readSubmission(SAMPLE_FORMS[1], data({email: 'ada@example.com'}))
    expect(result.status === 'ready' && result.submission.legalConsentOptions).toMatchObject({
      legitimateInterest: {value: true, subscriptionTypeId: 1, legalBasis: 'LEAD'},
    })
  })
})

describe('readHubSpotReply', () => {
  const form = parseForm(raw())!

  it('maps HubSpot’s errors to inputs', () => {
    const body = {
      status: 'error',
      errors: [
        {
          message: "Error in 'fields.email'. Email address a@b is invalid",
          errorType: 'INVALID_EMAIL',
        },
        {
          message: "Error in 'fields.name'. Required field 'name' is missing",
          errorType: 'REQUIRED_FIELD',
        },
      ],
    }
    expect(readHubSpotReply(form, 400, body)).toEqual({
      status: 'invalid',
      errors: {'email': 'invalid', '0-2/name': 'required'},
    })
  })

  it('prefers HubSpot’s own thank-you', () => {
    expect(readHubSpotReply(form, 200, {inlineMessage: '<p>Ta</p>'})).toEqual({
      status: 'sent',
      message: '<p>Ta</p>',
    })
    expect(readHubSpotReply(form, 500, {})).toEqual({status: 'failed'})
  })
})

describe('hosts and ids', () => {
  it('builds HubSpot’s addresses per data centre', () => {
    expect(regionFromUiDomain('app-eu1.hubspot.com')).toBe('eu1')
    expect(regionFromUiDomain('app.hubspot.com')).toBe('na1')
    expect(trackingScriptUrl('123', 'eu1')).toBe('https://js-eu1.hs-scripts.com/123.js')
    expect(trackingScriptUrl('123')).toBe('https://js.hs-scripts.com/123.js')
    expect(embedScriptUrl('v4', '123', 'na1')).toBe('https://js.hsforms.net/forms/embed/123.js')
    expect(embedScriptUrl('legacy', '123', 'eu1')).toBe(
      'https://js-eu1.hsforms.net/forms/embed/v2.js',
    )
    expect(submitUrl('123', FORM_ID, true)).toBe(
      `https://api.hsforms.com/submissions/v3/integration/secure/submit/123/${FORM_ID}`,
    )
    expect(() => trackingScriptUrl('12/../x')).toThrow()
  })

  it('keeps copy ids public and cookies tidy', () => {
    expect(formCopyId(FORM_ID.toUpperCase())).toBe(`hubspot-form-${FORM_ID}`)
    expect(formCopyId(FORM_ID)).not.toContain('.')
    expect(readHutk('a=1; hubspotutk=0123456789abcdef0123456789abcdef; b=2')).toBe(
      '0123456789abcdef0123456789abcdef',
    )
    expect(readHutk('hubspotutk=<script>')).toBeUndefined()
  })

  it('reads HubSpot’s HTML as text', () => {
    expect(plainText('<p>Tom &amp; Jerry<br>&#8217;s&nbsp;show</p>')).toBe('Tom & Jerry ’s show')
  })
})

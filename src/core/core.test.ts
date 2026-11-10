import {describe, expect, it} from 'vitest'

import {markForVisualEditing} from '../__fixtures__/copies'
import {answerOf, meetsCondition} from './conditions'
import {readFormCopy} from './copy'
import {fitsFields} from './drawable'
import {embedScriptUrl, regionFromUiDomain, submitUrl, trackingScriptUrl} from './hosts'
import {cleanHtml} from './html'
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

describe('readFormCopy', () => {
  const parsed = parseForm(raw(), {portalId: '123', region: 'eu1'})
  const forms = [...(parsed ? [parsed] : []), ...SAMPLE_FORMS]
  const json = structuredClone

  it('reads a copy back as the form it was written from', () => {
    expect(forms).toHaveLength(3)
    for (const form of forms) expect(readFormCopy(json(form))).toEqual(form)
  })

  it('drops the marks draft mode adds to every string', () => {
    for (const form of forms) expect(readFormCopy(markForVisualEditing(form))).toEqual(form)
  })

  it('keeps a joiner that belongs to the text', () => {
    const [form] = SAMPLE_FORMS
    if (!form) throw new Error('No sample form')
    const label = 'Your role \u{1F469}\u{200D}\u{1F4BB}'
    const copy = json(form)
    const field = copy.groups[0]?.fields[0]
    if (field) field.label = label
    expect(readFormCopy(copy)?.groups[0]?.fields[0]?.label).toBe(label)
  })

  it('leaves a copy it can’t read in full to HubSpot’s embed', () => {
    const [form] = SAMPLE_FORMS
    if (!form) throw new Error('No sample form')
    for (const broken of [
      {...json(form), consent: {type: 'whatever'}},
      {...json(form), groups: [{_key: 'g0', fields: [{name: 'email', type: 'rating'}]}]},
      {formId: form.formId, portalId: '123', embed: 'v4'},
    ]) {
      const read = readFormCopy(broken)
      expect(read).toMatchObject({formId: form.formId, drawable: false})
    }
    expect(readFormCopy({formId: form.formId, portalId: '123', embed: 'v4'})).toMatchObject({
      portalId: '123',
      embed: 'v4',
      groups: [],
    })
  })

  it('reads nothing without a form id', () => {
    expect(readFormCopy(null)).toBeNull()
    expect(readFormCopy({name: 'Demo request'})).toBeNull()
    expect(readFormCopy({formId: 'not-a-guid'})).toBeNull()
  })
})

describe('HubSpot’s HTML', () => {
  const NASTY = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
  const leaks = (value: unknown) =>
    /onerror|<script|<img|javascript:|style=/i.test(JSON.stringify(value))

  it('is cleaned as the route reads a form from HubSpot', () => {
    const form = parseForm(
      raw({
        fieldGroups: [
          {
            groupType: 'default_group',
            richTextType: 'text',
            richText: `<h3 style="color:red">About you</h3>${NASTY}`,
            fields: [
              {
                fieldType: 'dropdown',
                name: 'topic',
                label: 'Topic',
                description: `<a href="javascript:alert(3)" onclick="alert(4)">Why we ask</a>`,
                options: [{value: 'a', label: 'A', description: `Pick ${NASTY}me`}],
              },
            ],
          },
          // Text that is nothing once cleaned leaves no row behind.
          {groupType: 'default_group', richTextType: 'text', richText: '<script>alert(5)</script>'},
        ],
        configuration: {postSubmitAction: {type: 'thank_you', value: `<p>Thanks</p>${NASTY}`}},
        legalConsentOptions: {
          type: 'explicit_consent_to_process',
          communicationConsentText: `<p>News</p>${NASTY}`,
          communicationsCheckboxes: [{subscriptionTypeId: 7, label: `<p>Email me</p>${NASTY}`}],
          consentToProcessText: `<p>Storing</p>${NASTY}`,
          consentToProcessCheckboxLabel: `<p>I agree</p>${NASTY}`,
          consentToProcessFooterText: `<p>Footer</p>${NASTY}`,
          privacyText: `<p>Read our <a href="https://example.com/privacy" target="_blank">policy</a></p>${NASTY}`,
        },
      }),
    )
    expect(leaks(form)).toBe(false)
    expect(form?.groups).toHaveLength(1)
    expect(form?.groups[0]?.text).toBe('<h3>About you</h3>')
    expect(form?.groups[0]?.fields[0]).toMatchObject({
      description: '<a>Why we ask</a>',
      options: [{description: 'Pick me'}],
    })
    expect(form?.afterSubmit).toEqual({type: 'message', html: '<p>Thanks</p>'})
    expect(form?.consent).toMatchObject({
      communicationText: '<p>News</p>',
      checkboxes: [{label: '<p>Email me</p>'}],
      processText: '<p>Storing</p>',
      processLabel: '<p>I agree</p>',
      footerText: '<p>Footer</p>',
      privacyText:
        '<p>Read our <a href="https://example.com/privacy" target="_blank" rel="noopener noreferrer">policy</a></p>',
    })
  })

  it('is cleaned again as the site reads a copy, which any editor could have rewritten', () => {
    const [form] = SAMPLE_FORMS
    if (!form) throw new Error('No sample form')
    const copy = structuredClone(form)
    const [group] = copy.groups
    const field = group?.fields[0]
    if (!group || !field || copy.consent.type !== 'explicit')
      throw new Error('Not the contact form')
    group.text = `<p>Hello</p>${NASTY}`
    field.description = `<a href="javascript:alert(3)">Why we ask</a>${NASTY}`
    field.options = [{_key: 'o0', value: 'a', label: 'A', description: NASTY}]
    copy.consent.privacyText = `<p style="position:fixed">Privacy</p>${NASTY}`
    copy.consent.checkboxes = [{_key: 's1', subscriptionTypeId: 1, label: NASTY, required: false}]
    copy.afterSubmit = {type: 'message', html: `<p>Thanks</p>${NASTY}`}

    const read = readFormCopy(copy)
    expect(leaks(read)).toBe(false)
    expect(read?.groups[0]?.text).toBe('<p>Hello</p>')
    expect(read?.groups[0]?.fields[0]?.description).toBe('<a>Why we ask</a>')
    expect(read?.groups[0]?.fields[0]?.options[0]).toEqual({_key: 'o0', value: 'a', label: 'A'})
    expect(read?.consent).toMatchObject({privacyText: '<p>Privacy</p>', checkboxes: [{label: ''}]})
    expect(read?.afterSubmit).toEqual({type: 'message', html: '<p>Thanks</p>'})
  })

  it('never redirects a copy’s visitor to anything but a web address', () => {
    const [form] = SAMPLE_FORMS
    const after = (url: string) =>
      readFormCopy({...form, afterSubmit: {type: 'redirect', url}})?.afterSubmit
    expect(after('javascript:alert(1)')).toEqual({type: 'none'})
    expect(after('https://example.com/thanks')).toEqual({
      type: 'redirect',
      url: 'https://example.com/thanks',
    })
  })

  it('is cleaned in the thank-you, HubSpot’s own or the copy’s', () => {
    const form = parseForm(raw())
    if (!form) throw new Error('The form didn’t parse')
    expect(readHubSpotReply(form, 200, {inlineMessage: `<p>Ta</p>${NASTY}`})).toEqual({
      status: 'sent',
      message: '<p>Ta</p>',
    })
    // A model built by hand, not read through `readFormCopy`, is cleaned here all the same.
    const written = {...form, afterSubmit: {type: 'message' as const, html: `<p>Ta</p>${NASTY}`}}
    expect(readHubSpotReply(written, 200, null)).toEqual({status: 'sent', message: '<p>Ta</p>'})
  })
})

describe('cleanHtml', () => {
  // Each input with what a page may draw of it.
  const cases: [name: string, input: string, output: string][] = [
    [
      'keeps what HubSpot’s editor writes',
      '<p>Hello <strong>world</strong>, read our <a href="https://example.com/privacy?a=1&amp;b=2" target="_blank">privacy policy</a>.</p><ul><li>One</li><li>Two<br/>lines</li></ul>',
      '<p>Hello <strong>world</strong>, read our <a href="https://example.com/privacy?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">privacy policy</a>.</p><ul><li>One</li><li>Two<br>lines</li></ul>',
    ],
    ['drops a script with what it holds', '<p>Hi</p><script>alert(1)</script>', '<p>Hi</p>'],
    ['drops a style sheet', '<style>p{position:fixed}</style><p>Hi</p>', '<p>Hi</p>'],
    [
      'drops handlers, styles, classes and images',
      '<p style="position:fixed" class="x" onclick="steal()">Hi <img src=x onerror=alert(1)>there</p>',
      '<p>Hi there</p>',
    ],
    ['drops a frame', 'a<iframe src="https://evil.test"></iframe>b', 'ab'],
    ['drops drawings and what hides in them', '<svg><script>alert(1)</script></svg>ok', 'ok'],
    [
      'drops what a text area would hide from a browser',
      '<textarea></textarea><img src=x onerror=alert(1)>',
      '',
    ],
    ['drops comments', 'a<!-- <script>x</script> -->b<!-->c', 'abc'],
    ['keeps a link without a script address', '<a href="javascript:alert(1)">x</a>', '<a>x</a>'],
    ['reads a scheme in any case', '<a href="JaVaScRiPt:alert(1)">x</a>', '<a>x</a>'],
    [
      'reads a scheme through tabs, line breaks and leading spaces',
      '<a href=" \u0001java\tscr\nipt:alert(1)">x</a>',
      '<a>x</a>',
    ],
    [
      'reads a scheme written in entities',
      '<a href="&#106;avascript&#x3A;alert(1)">x</a>',
      '<a>x</a>',
    ],
    [
      'writes an address as it was checked, so a browser can’t decode it further',
      '<a href="&#106avascript:alert(1)">x</a><a href="javascript&colon;alert(1)">y</a>',
      '<a href="&amp;#106avascript:alert(1)">x</a><a href="javascript&amp;colon;alert(1)">y</a>',
    ],
    ['drops data and other schemes', '<a href="data:text/html,<b>x</b>">x</a>', '<a>x</a>'],
    [
      'keeps addresses on the site, mail and phone',
      '<a href="/contact">a</a><a href="#top">b</a><a href="mailto:a@example.com">c</a><a href="tel:+351210000000">d</a>',
      '<a href="/contact">a</a><a href="#top">b</a><a href="mailto:a@example.com">c</a><a href="tel:+351210000000">d</a>',
    ],
    [
      'takes the first of two addresses, as a browser does',
      '<a href="/a" href="javascript:alert(1)">x</a>',
      '<a href="/a">x</a>',
    ],
    ['closes what was left open', '<p>One<p>Two <b>bold', '<p>One</p><p>Two <b>bold</b></p>'],
    ['closes tags in order', '<b><i>x</b></i>y', '<b><i>x</i></b>y'],
    ['ignores a closing tag with nothing to close', '</div></p></a>text</span>', 'text'],
    [
      'never puts a link in a link',
      '<a href="/a">one<a href="/b">two</a>',
      '<a href="/a">one</a><a href="/b">two</a>',
    ],
    ['keeps a list item in a list only', '<li>loose</li>', 'loose'],
    ['ends an item where the next begins', '<ul><li>a<li>b</ul>', '<ul><li>a</li><li>b</li></ul>'],
    [
      'ends running text where a block begins',
      '<span><b>a<p>x</p></b></span>',
      '<span><b>a</b></span><p>x</p>',
    ],
    ['draws a div as a paragraph', '<div><div>x</div></div>', '<p>x</p>'],
    [
      'keeps the text of a tag it doesn’t know',
      '<font color="red"><marquee>x</marquee></font>',
      'x',
    ],
    ['writes a tag that never ends as text', 'Hi <a href="x', 'Hi &lt;a href="x'],
    ['writes brackets and ampersands as text', '1 < 2 & 3 > 2', '1 &lt; 2 &amp; 3 &gt; 2'],
    ['keeps entities', '&amp; &nbsp; &#169; &#xA9; &copy;', '&amp; &nbsp; &#169; &#xA9; &copy;'],
  ]

  it.each(cases)('%s', (_name, input, output) => {
    expect(cleanHtml(input)).toBe(output)
  })

  it('changes nothing when run again', () => {
    for (const [, input] of cases) {
      const once = cleanHtml(input)
      expect(cleanHtml(once)).toBe(once)
    }
  })

  it('stays quick on input built to slow it', () => {
    const started = Date.now()
    cleanHtml('<a x="'.repeat(50_000))
    cleanHtml('<span>'.repeat(50_000) + '</b>'.repeat(50_000))
    cleanHtml(`${'<a '.repeat(50_000)}x=">`)
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

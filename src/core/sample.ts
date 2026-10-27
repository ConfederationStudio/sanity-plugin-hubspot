import type {RawForm} from './hubspot'
import type {HubSpotFormDefinition} from './model'
import {parseForm} from './parse'

/**
 * Forms for stand-in mode, when there is no HubSpot account to read yet: the Studio can pick
 * them and the site can draw them. They are written as HubSpot would send them, so they go
 * through the parser like any other. A send to one goes nowhere and reports success.
 */
const SAMPLE_PREFIX = '00000000-0000-4000-8000-'

export const isSampleFormId = (formId: string): boolean =>
  formId.toLowerCase().startsWith(SAMPLE_PREFIX)

const contact: RawForm = {
  id: `${SAMPLE_PREFIX}000000000001`,
  name: 'Sample: Contact us',
  updatedAt: '2026-01-01T00:00:00Z',
  configuration: {
    language: 'en',
    recaptchaEnabled: false,
    postSubmitAction: {type: 'thank_you', value: '<p>Thanks, we’ll be in touch.</p>'},
    embedType: 'V4',
  },
  displayOptions: {submitButtonText: 'Send'},
  fieldGroups: [
    {
      groupType: 'default_group',
      richTextType: 'text',
      fields: [
        {fieldType: 'single_line_text', name: 'firstname', label: 'First name', required: true},
        {fieldType: 'single_line_text', name: 'lastname', label: 'Last name', required: true},
      ],
    },
    {
      groupType: 'default_group',
      richTextType: 'text',
      fields: [{fieldType: 'email', name: 'email', label: 'Email', required: true}],
    },
    {
      groupType: 'default_group',
      richTextType: 'text',
      fields: [
        {
          fieldType: 'dropdown',
          name: 'topic',
          label: 'What is it about?',
          options: [
            {value: 'sales', label: 'Talking to sales', displayOrder: 0},
            {value: 'support', label: 'Getting help', displayOrder: 1},
            {value: 'other', label: 'Something else', displayOrder: 2},
          ],
          dependentFields: [
            {
              dependentCondition: {operator: 'set_any', values: ['sales']},
              dependentField: {
                fieldType: 'single_line_text',
                name: 'company',
                label: 'Company',
                required: true,
              },
            },
          ],
        },
      ],
    },
    {
      groupType: 'default_group',
      richTextType: 'text',
      fields: [{fieldType: 'multi_line_text', name: 'message', label: 'Message'}],
    },
  ],
  legalConsentOptions: {
    type: 'explicit_consent_to_process',
    communicationConsentText:
      '<p>We would like to send you news about our work. Tick the box if you’d like that.</p>',
    communicationsCheckboxes: [
      {subscriptionTypeId: 1, label: '<p>I’d like news by email.</p>', required: false},
    ],
    consentToProcessText: '<p>To answer, we need to store what you send us.</p>',
    consentToProcessCheckboxLabel: '<p>I agree to my details being stored.</p>',
    privacyText: '<p>You can unsubscribe at any time.</p>',
  },
}

const newsletter: RawForm = {
  id: `${SAMPLE_PREFIX}000000000002`,
  name: 'Sample: Newsletter',
  updatedAt: '2026-01-01T00:00:00Z',
  configuration: {language: 'en', recaptchaEnabled: false, embedType: 'V4'},
  displayOptions: {submitButtonText: 'Subscribe'},
  fieldGroups: [
    {
      groupType: 'default_group',
      richTextType: 'text',
      fields: [{fieldType: 'email', name: 'email', placeholder: 'you@example.com', required: true}],
    },
  ],
  legalConsentOptions: {
    type: 'legitimate_interest',
    lawfulBasis: 'lead',
    subscriptionTypeIds: [1],
    privacyText: '<p>We send one email a month. You can unsubscribe at any time.</p>',
  },
}

export const SAMPLE_FORMS: readonly HubSpotFormDefinition[] = [contact, newsletter].flatMap(
  (raw) => parseForm(raw) ?? [],
)

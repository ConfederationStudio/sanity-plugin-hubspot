/**
 * HubSpot's own shapes, as its Forms API v3 sends them (`GET /marketing/v3/forms/{formId}`).
 * Only what the plugin reads is typed. The parser (`parse.ts`) turns these into the plugin's
 * model, and nothing else in the plugin reads them, so a HubSpot API change touches two files.
 */

export type RawFieldType =
  | 'email'
  | 'phone'
  | 'mobile_phone'
  | 'single_line_text'
  | 'multi_line_text'
  | 'number'
  | 'single_checkbox'
  | 'multiple_checkboxes'
  | 'dropdown'
  | 'radio'
  | 'datepicker'
  | 'file'
  | 'payment_link_radio'
  | (string & {})

export interface RawOption {
  value: string
  label: string
  displayOrder?: number
  description?: string
}

export interface RawCondition {
  operator: string
  value?: string
  values?: string[]
  rangeStart?: string
  rangeEnd?: string
}

export interface RawField {
  fieldType: RawFieldType
  name: string
  /** Missing when the form's editor left the field unlabelled. */
  label?: string
  required?: boolean
  hidden?: boolean
  objectTypeId?: string
  placeholder?: string
  description?: string
  defaultValue?: string
  defaultValues?: string[]
  options?: RawOption[]
  dependentFields?: {dependentCondition: RawCondition; dependentField: RawField}[]
}

export interface RawFieldGroup {
  groupType: 'default_group' | 'progressive' | 'queued' | (string & {})
  richTextType?: 'text' | 'image'
  richText?: string
  /** Left out, not empty, on a group that holds only text. */
  fields?: RawField[]
}

export interface RawCommunicationsCheckbox {
  subscriptionTypeId: number
  label: string
  required?: boolean
}

export type RawLegalConsent =
  | {type: 'none'}
  | {
      type: 'legitimate_interest'
      lawfulBasis: 'lead' | 'client' | 'other'
      privacyText?: string
      subscriptionTypeIds?: number[]
    }
  | {
      type: 'explicit_consent_to_process'
      privacyText?: string
      communicationsCheckboxes?: RawCommunicationsCheckbox[]
      communicationConsentText?: string
      consentToProcessText?: string
      consentToProcessCheckboxLabel?: string
      consentToProcessFooterText?: string
    }
  | {
      type: 'implicit_consent_to_process'
      privacyText?: string
      communicationsCheckboxes?: RawCommunicationsCheckbox[]
      communicationConsentText?: string
      consentToProcessText?: string
    }

export interface RawForm {
  id: string
  name: string
  formType?: string
  archived?: boolean
  createdAt?: string
  updatedAt?: string
  fieldGroups: RawFieldGroup[]
  configuration?: {
    language?: string
    recaptchaEnabled?: boolean
    postSubmitAction?: {type?: 'thank_you' | 'redirect_url' | (string & {}); value?: string}
    embedType?: string
  }
  displayOptions?: {submitButtonText?: string}
  legalConsentOptions?: RawLegalConsent
}

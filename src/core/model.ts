/**
 * The plugin's own model of a HubSpot form. The Studio saves it in each form copy, the site
 * reads it with its page query, and the renderer and the server both work from it. It is
 * smaller than HubSpot's definition and keeps none of HubSpot's settings (notification
 * recipients, styling), so a copy holds nothing an editor shouldn't see.
 *
 * Arrays of objects carry a `_key`, so a copy opened in the Studio reads cleanly.
 */

/** Bumped when the shape changes, so a copy written by an older plugin can be told apart. */
export const MODEL_VERSION = 1

/** What the site draws for a field. `file`, `payment` and `unknown` are HubSpot's to draw. */
export type HubSpotFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkboxes'
  | 'checkbox'
  | 'file'
  | 'payment'
  | 'unknown'

export interface HubSpotOption {
  _key: string
  value: string
  label: string
  description?: string
}

/** When a follow-up field shows, judged against its parent's answer. */
export interface HubSpotCondition {
  operator: string
  value?: string
  values?: string[]
  rangeStart?: string
  rangeEnd?: string
}

export interface HubSpotField {
  _key: string
  /** The CRM property the answer goes to, and the name the input posts under. */
  name: string
  type: HubSpotFieldType
  /** HubSpot's own field type, as it sent it. */
  hubspotType: string
  objectTypeId: string
  /** Plain text. For a field HubSpot left unlabelled: its placeholder, else its name. */
  label: string
  /** HubSpot gave the field a label. When false, draw `label` for screen readers only. */
  hasLabel: boolean
  required: boolean
  hidden: boolean
  placeholder?: string
  description?: string
  defaultValues: string[]
  options: HubSpotOption[]
  followUps: HubSpotFollowUp[]
}

export interface HubSpotFollowUp {
  _key: string
  when: HubSpotCondition
  field: HubSpotField
}

/** One of HubSpot's field groups: an optional run of rich text, then up to three fields in a row. */
export interface HubSpotGroup {
  _key: string
  /** HubSpot's HTML, as its editor wrote it. */
  text?: string
  fields: HubSpotField[]
}

export interface HubSpotSubscriptionCheckbox {
  _key: string
  subscriptionTypeId: number
  /** HubSpot's HTML. */
  label: string
  required: boolean
}

export type HubSpotConsent =
  | {type: 'none'}
  | {
      type: 'legitimateInterest'
      basis: 'lead' | 'client' | 'other'
      subscriptionTypeIds: number[]
      privacyText?: string
    }
  | {
      type: 'explicit'
      checkboxes: HubSpotSubscriptionCheckbox[]
      communicationText?: string
      processText?: string
      /** The words beside the consent-to-process box, when HubSpot gives the box its own. */
      processLabel?: string
      footerText?: string
      privacyText?: string
    }
  | {
      type: 'implicit'
      checkboxes: HubSpotSubscriptionCheckbox[]
      communicationText?: string
      processText?: string
      privacyText?: string
    }

export type HubSpotAfterSubmit =
  | {type: 'message'; html: string}
  | {type: 'redirect'; url: string}
  | {type: 'none'}

/** Why the site can't draw a form and shows HubSpot's embed instead. */
export type HubSpotUndrawableReason =
  | 'recaptcha'
  | 'file'
  | 'payment'
  | 'unknown-field'
  | 'condition'
  | 'consent-basis'
  | 'consent-subscriptions'

export interface HubSpotFormDefinition {
  version: typeof MODEL_VERSION
  /** HubSpot's form id, a GUID. */
  formId: string
  name: string
  /** The HubSpot account the form belongs to, which every send and embed must name. */
  portalId?: string
  /** The account's data centre, such as `na1` or `eu1`. */
  region?: string
  updatedAt?: string
  language?: string
  /** Which of HubSpot's embeds draws the form when the site can't. */
  embed: 'v4' | 'legacy'
  submitText: string
  afterSubmit: HubSpotAfterSubmit
  groups: HubSpotGroup[]
  /** HubSpot has progressive fields for returning contacts. Only its embed shows them. */
  progressive: boolean
  consent: HubSpotConsent
  drawable: boolean
  undrawable: HubSpotUndrawableReason[]
}

/** A form as the Studio's picker lists it. */
export interface HubSpotFormSummary {
  formId: string
  name: string
  updatedAt?: string
  fieldCount: number
  drawable: boolean
  undrawable: HubSpotUndrawableReason[]
}

/** The HubSpot account a key belongs to. */
export interface HubSpotAccount {
  portalId: string
  region: string
  /** Where the account's HubSpot app lives, such as `app-eu1.hubspot.com`. */
  uiDomain?: string
  accountType?: string
}

/** Why the visitor must look at an input again. */
export type HubSpotFieldError = 'required' | 'invalid' | 'blocked'

/** How a send ended, in what the visitor can do about it. */
export type HubSpotSubmitResult =
  | {status: 'sent'; message?: string; redirect?: string}
  | {status: 'invalid'; errors: Record<string, HubSpotFieldError>}
  | {status: 'failed'}

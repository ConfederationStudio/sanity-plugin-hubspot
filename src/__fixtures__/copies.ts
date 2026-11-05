/**
 * Form copies as sites really get them: marked by visual editing in draft mode, and typed by
 * Sanity TypeGen.
 */

/**
 * Two of the marks `@vercel/stega` appends in draft mode: its current one (four zero-width
 * spaces, then the source as zero-width characters) and its older one.
 */
const MARKS = [
  '\u{200B}\u{200B}\u{200B}\u{200B}\u{200C}\u{200D}\u{FEFF}\u{200B}\u{200C}\u{200C}\u{200D}\u{FEFF}',
  '\u{2062}\u{2063}\u{2060}\u{2061}\u{1D173}\u{1D17A}',
]

/** Every string in a value, marked as draft mode marks it. */
export function markForVisualEditing<T>(value: T, at = 0): T {
  const marked = (inner: unknown, index: number): unknown => {
    if (typeof inner === 'string') return `${inner}${MARKS[index % MARKS.length]}`
    if (Array.isArray(inner)) return inner.map((item, offset) => marked(item, index + offset))
    if (typeof inner === 'object' && inner !== null)
      return Object.fromEntries(
        Object.entries(inner).map(([key, item], offset) => [key, marked(item, index + offset)]),
      )
    return inner
  }
  // The same JSON a query returns, with every string marked.
  const copy: T = JSON.parse(JSON.stringify(marked(value, at)))
  return copy
}

/** What Sanity TypeGen writes for `definition->` on a `hubspot.form` field. */
export type TypeGenFormCopy = {
  _id: string
  _type: 'hubspot.formDefinition'
  _createdAt: string
  _updatedAt: string
  _rev: string
  name?: string
  formId?: string
  archived?: boolean
  drawable?: boolean
  undrawable?: Array<string>
  progressive?: boolean
  updatedAt?: string
  syncedAt?: string
  submitText?: string
  afterSubmit?: {_type: 'hubspot.formAfterSubmit'; type?: string; html?: string; url?: string}
  groups?: Array<{_key: string} & TypeGenGroup>
  consent?: {
    _type: 'hubspot.formConsent'
    type?: string
    basis?: string
    subscriptionTypeIds?: Array<number>
    checkboxes?: Array<
      {_key: string} & {
        _type: 'hubspot.formSubscription'
        subscriptionTypeId?: number
        label?: string
        required?: boolean
      }
    >
    communicationText?: string
    processText?: string
    processLabel?: string
    footerText?: string
    privacyText?: string
  }
  portalId?: string
  region?: string
  language?: string
  embed?: string
  version?: number
} | null

type TypeGenGroup = {
  _type: 'hubspot.formGroup'
  text?: string
  fields?: Array<{_key: string} & TypeGenField>
}

type TypeGenField = {
  _type: 'hubspot.formField'
  label?: string
  name?: string
  type?: string
  hubspotType?: string
  objectTypeId?: string
  hasLabel?: boolean
  required?: boolean
  hidden?: boolean
  placeholder?: string
  description?: string
  defaultValues?: Array<string>
  options?: Array<
    {_key: string} & {
      _type: 'hubspot.formOption'
      value?: string
      label?: string
      description?: string
    }
  >
  followUps?: Array<
    {_key: string} & {
      _type: 'hubspot.formFollowUp'
      when?: {
        _type: 'hubspot.formCondition'
        operator?: string
        value?: string
        values?: Array<string>
        rangeStart?: string
        rangeEnd?: string
      }
      field?: TypeGenField
    }
  >
}

/** A form as a TypeGen-typed query hands it over: the copy's JSON, typed as TypeGen types it. */
export function asTypeGenCopy(form: object): TypeGenFormCopy {
  return JSON.parse(JSON.stringify({...form, _id: 'hubspot-form', _type: 'hubspot.formDefinition'}))
}

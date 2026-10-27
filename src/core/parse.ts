import {allFields, undrawableReasons} from './drawable'
import type {
  RawCommunicationsCheckbox,
  RawCondition,
  RawField,
  RawForm,
  RawLegalConsent,
  RawOption,
} from './hubspot'
import {isFormId} from './ids'
import {
  MODEL_VERSION,
  type HubSpotAccount,
  type HubSpotAfterSubmit,
  type HubSpotCondition,
  type HubSpotConsent,
  type HubSpotField,
  type HubSpotFieldType,
  type HubSpotFormDefinition,
  type HubSpotFormSummary,
  type HubSpotGroup,
  type HubSpotOption,
  type HubSpotSubscriptionCheckbox,
} from './model'
import {isHttpUrl, plainText} from './text'

const FIELD_TYPES: Record<string, HubSpotFieldType> = {
  email: 'email',
  phone: 'tel',
  mobile_phone: 'tel',
  single_line_text: 'text',
  multi_line_text: 'textarea',
  number: 'number',
  single_checkbox: 'checkbox',
  multiple_checkboxes: 'checkboxes',
  dropdown: 'select',
  radio: 'radio',
  datepicker: 'date',
  file: 'file',
  payment_link_radio: 'payment',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

/** Enough of HubSpot's answer to work from; anything less is left out, not drawn wrong. */
export function isRawForm(value: unknown): value is RawForm {
  return (
    isObject(value) &&
    isFormId(value.id) &&
    typeof value.name === 'string' &&
    Array.isArray(value.fieldGroups)
  )
}

function options(raw: RawOption[] | undefined) {
  return [...(raw ?? [])]
    .filter((option) => isObject(option) && typeof option.value === 'string')
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map((option, index) => {
      const out: HubSpotOption = {
        _key: `o${index}`,
        value: option.value,
        label: plainText(option.label) || option.value,
      }
      if (text(option.description)) out.description = option.description
      return out
    })
}

function condition(raw: RawCondition): HubSpotCondition {
  return {
    operator: raw.operator,
    ...(typeof raw.value === 'string' && {value: raw.value}),
    ...(Array.isArray(raw.values) && {values: raw.values.map(String)}),
    ...(typeof raw.rangeStart === 'string' && {rangeStart: raw.rangeStart}),
    ...(typeof raw.rangeEnd === 'string' && {rangeEnd: raw.rangeEnd}),
  }
}

function field(raw: RawField): HubSpotField {
  const label = plainText(raw.label)
  const defaults = Array.isArray(raw.defaultValues)
    ? raw.defaultValues.map(String)
    : text(raw.defaultValue)
      ? [String(raw.defaultValue)]
      : []
  return {
    _key: raw.name,
    name: raw.name,
    type: FIELD_TYPES[raw.fieldType] ?? 'unknown',
    hubspotType: String(raw.fieldType),
    objectTypeId: text(raw.objectTypeId) ?? '0-1',
    label: label || text(raw.placeholder) || raw.name,
    hasLabel: label !== '',
    required: raw.required === true,
    hidden: raw.hidden === true,
    ...(text(raw.placeholder) && {placeholder: raw.placeholder}),
    ...(text(raw.description) && {description: raw.description}),
    defaultValues: defaults,
    options: options(raw.options),
    followUps: (raw.dependentFields ?? [])
      .filter(
        (dependent) =>
          isObject(dependent?.dependentField) && isObject(dependent.dependentCondition),
      )
      .map((dependent, index) => ({
        _key: `u${index}`,
        when: condition(dependent.dependentCondition),
        field: field(dependent.dependentField),
      })),
  }
}

const isField = (value: unknown): value is RawField =>
  isObject(value) && typeof value.name === 'string' && typeof value.fieldType === 'string'

const isCheckbox = (value: unknown): value is RawCommunicationsCheckbox =>
  isObject(value) && typeof value.subscriptionTypeId === 'number'

function checkboxes(raw: unknown): HubSpotSubscriptionCheckbox[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isCheckbox).map((box) => ({
    _key: `s${box.subscriptionTypeId}`,
    subscriptionTypeId: box.subscriptionTypeId,
    label: typeof box.label === 'string' ? box.label : '',
    required: box.required === true,
  }))
}

function consent(raw: RawLegalConsent | undefined): HubSpotConsent {
  if (!isObject(raw)) return {type: 'none'}
  switch (raw.type) {
    case 'legitimate_interest':
      return {
        type: 'legitimateInterest',
        basis:
          raw.lawfulBasis === 'client' || raw.lawfulBasis === 'lead' ? raw.lawfulBasis : 'other',
        subscriptionTypeIds: (raw.subscriptionTypeIds ?? []).filter(Number.isFinite),
        ...(text(raw.privacyText) && {privacyText: raw.privacyText}),
      }
    case 'explicit_consent_to_process':
      return {
        type: 'explicit',
        checkboxes: checkboxes(raw.communicationsCheckboxes),
        ...(text(raw.communicationConsentText) && {
          communicationText: raw.communicationConsentText,
        }),
        ...(text(raw.consentToProcessText) && {processText: raw.consentToProcessText}),
        ...(text(raw.consentToProcessCheckboxLabel) && {
          processLabel: raw.consentToProcessCheckboxLabel,
        }),
        ...(text(raw.consentToProcessFooterText) && {footerText: raw.consentToProcessFooterText}),
        ...(text(raw.privacyText) && {privacyText: raw.privacyText}),
      }
    case 'implicit_consent_to_process':
      return {
        type: 'implicit',
        checkboxes: checkboxes(raw.communicationsCheckboxes),
        ...(text(raw.communicationConsentText) && {
          communicationText: raw.communicationConsentText,
        }),
        ...(text(raw.consentToProcessText) && {processText: raw.consentToProcessText}),
        ...(text(raw.privacyText) && {privacyText: raw.privacyText}),
      }
    default:
      return {type: 'none'}
  }
}

function afterSubmit(raw: RawForm['configuration']): HubSpotAfterSubmit {
  const action = raw?.postSubmitAction
  const value = text(action?.value)
  if (!value) return {type: 'none'}
  if (action?.type === 'redirect_url')
    return isHttpUrl(value) ? {type: 'redirect', url: value} : {type: 'none'}
  return {type: 'message', html: value}
}

/**
 * HubSpot's form definition as the plugin's model, or null when HubSpot's answer isn't a
 * form. The account, when known, is written in, so the site can send and embed without
 * being told it again.
 */
export function parseForm(
  raw: unknown,
  account?: Pick<HubSpotAccount, 'portalId' | 'region'>,
): HubSpotFormDefinition | null {
  if (!isRawForm(raw)) return null
  const groups: HubSpotGroup[] = []
  let progressive = false
  for (const [index, group] of raw.fieldGroups.entries()) {
    if (!isObject(group)) continue
    if (group.groupType !== 'default_group') {
      progressive = true
      continue
    }
    const fields = Array.isArray(group.fields) ? group.fields.filter(isField).map(field) : []
    const richText = group.richTextType === 'image' ? undefined : text(group.richText)
    if (fields.length === 0 && !richText) continue
    groups.push({_key: `g${index}`, ...(richText && {text: richText}), fields})
  }
  const form = {groups, consent: consent(raw.legalConsentOptions)}
  const undrawable = undrawableReasons({
    ...form,
    recaptcha: raw.configuration?.recaptchaEnabled === true,
  })
  return {
    version: MODEL_VERSION,
    formId: raw.id.toLowerCase(),
    name: raw.name,
    ...(account?.portalId && {portalId: account.portalId}),
    ...(account?.region && {region: account.region}),
    ...(text(raw.updatedAt) && {updatedAt: raw.updatedAt}),
    ...(text(raw.configuration?.language) && {language: raw.configuration?.language}),
    embed: raw.configuration?.embedType === 'V4' ? 'v4' : 'legacy',
    submitText: plainText(raw.displayOptions?.submitButtonText) || 'Submit',
    afterSubmit: afterSubmit(raw.configuration),
    ...form,
    progressive,
    drawable: undrawable.length === 0,
    undrawable,
  }
}

/** A form as the picker lists it. */
export function summarize(form: HubSpotFormDefinition): HubSpotFormSummary {
  return {
    formId: form.formId,
    name: form.name,
    ...(form.updatedAt && {updatedAt: form.updatedAt}),
    fieldCount: allFields(form.groups).filter((field) => !field.hidden).length,
    drawable: form.drawable,
    undrawable: form.undrawable,
  }
}

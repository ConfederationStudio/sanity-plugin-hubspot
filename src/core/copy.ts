import {undrawableReasons} from './drawable'
import {isRegion} from './hosts'
import {isFormId, isPortalId} from './ids'
import {
  MODEL_VERSION,
  type HubSpotAfterSubmit,
  type HubSpotCondition,
  type HubSpotConsent,
  type HubSpotField,
  type HubSpotFieldType,
  type HubSpotFollowUp,
  type HubSpotFormDefinition,
  type HubSpotGroup,
  type HubSpotOption,
  type HubSpotSubscriptionCheckbox,
  type HubSpotUndrawableReason,
} from './model'

/**
 * A type made as loose as Sanity TypeGen makes a document's: every field optional or null, and
 * fixed values such as `'v4'` and `1` widened to plain strings and numbers.
 */
export type Loosely<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends null | undefined
        ? T
        : T extends readonly (infer Item)[]
          ? readonly Loosely<Item>[]
          : {[Key in keyof T]?: Loosely<T[Key]> | null}

/**
 * A form's copy as a page's query reads it: `definition->` on a `hubspot.form` field. Typed
 * loosely, so the type Sanity TypeGen writes for the query fits it.
 */
export type HubSpotFormCopy = Loosely<HubSpotFormDefinition>

/**
 * The hidden characters Sanity's visual editing adds to strings in draft mode, to tie each one
 * to its source: runs of four or more, as `@vercel/stega` writes and cleans them. A lone joiner,
 * as in an emoji, is left alone.
 */
const STEGA = /[\u{200B}-\u{200D}\u{2060}-\u{2063}\u{FEFF}\u{1D173}-\u{1D17A}]{4,}/gu

type Raw = Readonly<Record<string, unknown>>

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const record = (value: unknown): Raw => (isRaw(value) ? value : {})
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.replace(STEGA, '') : undefined
const texts = (value: unknown): string[] => list(value).flatMap((item) => text(item) ?? [])
const numbers = (value: unknown): number[] =>
  list(value).filter((item): item is number => typeof item === 'number' && Number.isFinite(item))

/** The named fields that hold text, leaving out those that don't. */
function optionalTexts<Name extends string>(
  raw: Raw,
  names: readonly Name[],
): Partial<Record<Name, string>> {
  const out: Partial<Record<Name, string>> = {}
  for (const name of names) {
    const value = text(raw[name])
    if (value !== undefined) out[name] = value
  }
  return out
}

const FIELD_TYPES = {
  text: true,
  email: true,
  tel: true,
  number: true,
  date: true,
  textarea: true,
  select: true,
  radio: true,
  checkboxes: true,
  checkbox: true,
  file: true,
  payment: true,
  unknown: true,
} satisfies Record<HubSpotFieldType, true>

const REASONS = {
  'recaptcha': true,
  'file': true,
  'payment': true,
  'unknown-field': true,
  'condition': true,
  'consent-basis': true,
  'consent-subscriptions': true,
} satisfies Record<HubSpotUndrawableReason, true>

const isFieldType = (value: string): value is HubSpotFieldType => Object.hasOwn(FIELD_TYPES, value)
const isReason = (value: string): value is HubSpotUndrawableReason => Object.hasOwn(REASONS, value)

/** Something the site needs to draw the form is missing, so HubSpot's embed must draw it. */
class Unreadable extends Error {}

function readOption(value: unknown, index: number): HubSpotOption {
  const raw = record(value)
  const option = text(raw.value) ?? ''
  return {
    _key: text(raw._key) ?? `o${index}`,
    value: option,
    label: text(raw.label) ?? option,
    ...optionalTexts(raw, ['description']),
  }
}

function readCondition(value: unknown): HubSpotCondition {
  const raw = record(value)
  return {
    operator: text(raw.operator) ?? '',
    ...optionalTexts(raw, ['value', 'rangeStart', 'rangeEnd']),
    ...(Array.isArray(raw.values) && {values: texts(raw.values)}),
  }
}

function readFollowUp(value: unknown, index: number): HubSpotFollowUp {
  const raw = record(value)
  const key = text(raw._key) ?? `u${index}`
  return {_key: key, when: readCondition(raw.when), field: readField(raw.field, key)}
}

function readField(value: unknown, fallbackKey: string): HubSpotField {
  const raw = record(value)
  const name = text(raw.name)
  const type = text(raw.type)
  if (!name || !type || !isFieldType(type)) throw new Unreadable()
  return {
    _key: text(raw._key) ?? fallbackKey,
    name,
    type,
    hubspotType: text(raw.hubspotType) ?? '',
    objectTypeId: text(raw.objectTypeId) ?? '0-1',
    label: text(raw.label) ?? name,
    hasLabel: raw.hasLabel === true,
    required: raw.required === true,
    hidden: raw.hidden === true,
    ...optionalTexts(raw, ['placeholder', 'description']),
    defaultValues: texts(raw.defaultValues),
    options: list(raw.options).map(readOption),
    followUps: list(raw.followUps).map(readFollowUp),
  }
}

function readGroup(value: unknown, index: number): HubSpotGroup {
  const raw = record(value)
  return {
    _key: text(raw._key) ?? `g${index}`,
    ...optionalTexts(raw, ['text']),
    fields: list(raw.fields).map((field, at) => readField(field, `f${at}`)),
  }
}

function readCheckbox(value: unknown): HubSpotSubscriptionCheckbox {
  const raw = record(value)
  const id = raw.subscriptionTypeId
  if (typeof id !== 'number' || !Number.isFinite(id)) throw new Unreadable()
  return {
    _key: text(raw._key) ?? `s${id}`,
    subscriptionTypeId: id,
    label: text(raw.label) ?? '',
    required: raw.required === true,
  }
}

function readConsent(value: unknown): HubSpotConsent {
  const raw = record(value)
  const type = text(raw.type)
  if (type === 'none') return {type}
  if (type === 'legitimateInterest') {
    const basis = text(raw.basis)
    return {
      type,
      basis: basis === 'lead' || basis === 'client' ? basis : 'other',
      subscriptionTypeIds: numbers(raw.subscriptionTypeIds),
      ...optionalTexts(raw, ['privacyText']),
    }
  }
  if (type === 'explicit')
    return {
      type,
      checkboxes: list(raw.checkboxes).map(readCheckbox),
      ...optionalTexts(raw, [
        'communicationText',
        'processText',
        'processLabel',
        'footerText',
        'privacyText',
      ]),
    }
  if (type === 'implicit')
    return {
      type,
      checkboxes: list(raw.checkboxes).map(readCheckbox),
      ...optionalTexts(raw, ['communicationText', 'processText', 'privacyText']),
    }
  throw new Unreadable()
}

function readAfterSubmit(value: unknown): HubSpotAfterSubmit {
  const raw = record(value)
  const type = text(raw.type)
  const html = text(raw.html)
  const url = text(raw.url)
  if (type === 'message' && html !== undefined) return {type, html}
  if (type === 'redirect' && url !== undefined) return {type, url}
  return {type: 'none'}
}

/**
 * A form's copy as the plugin's model, from whatever a page's query read: typed by Sanity
 * TypeGen or not at all. It drops the hidden characters visual editing adds to strings in draft
 * mode, which would otherwise reach HubSpot in field names and answers. A copy missing what the
 * site needs to draw it comes back undrawable, for HubSpot's embed; one with no form id, null.
 *
 * `<HubSpotForm>`, `<HubSpotEmbed>`, `sendHubSpotForm` and `submitForm` call it themselves. Call
 * it before `layoutForm` or `fitsFields`, which take the model.
 */
export function readFormCopy(copy: unknown): HubSpotFormDefinition | null {
  const raw = record(copy)
  const formId = text(raw.formId)
  if (!isFormId(formId)) return null
  const portalId = text(raw.portalId)
  const region = text(raw.region)
  const copied = texts(raw.undrawable).filter(isReason)
  const form: Omit<HubSpotFormDefinition, 'groups' | 'consent' | 'drawable' | 'undrawable'> = {
    version: MODEL_VERSION,
    formId,
    name: text(raw.name) ?? '',
    ...(isPortalId(portalId) && {portalId}),
    ...(isRegion(region) && {region}),
    ...optionalTexts(raw, ['updatedAt', 'language']),
    embed: text(raw.embed) === 'v4' ? 'v4' : 'legacy',
    submitText: text(raw.submitText) || 'Submit',
    afterSubmit: readAfterSubmit(raw.afterSubmit),
    progressive: raw.progressive === true,
  }
  try {
    const groups = list(raw.groups).map(readGroup)
    const consent = readConsent(raw.consent)
    const found = undrawableReasons({groups, consent, recaptcha: false})
    return {
      ...form,
      groups,
      consent,
      drawable: raw.drawable === true && found.length === 0,
      undrawable: [...new Set([...copied, ...found])],
    }
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error
    return {...form, groups: [], consent: {type: 'none'}, drawable: false, undrawable: copied}
  }
}

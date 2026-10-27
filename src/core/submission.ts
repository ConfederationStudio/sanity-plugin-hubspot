import {answerOf} from './conditions'
import {allFields} from './drawable'
import {activeFields, type HubSpotAnswers} from './layout'
import type {
  HubSpotField,
  HubSpotFieldError,
  HubSpotFormDefinition,
  HubSpotSubmitResult,
} from './model'
import {
  CONSENT_INPUT,
  HONEYPOT_INPUT,
  inputName,
  PAGE_NAME_INPUT,
  PAGE_URI_INPUT,
  subscriptionInput,
} from './names'
import {isHttpUrl, plainText} from './text'

/** What a send can be read from: `FormData` on either side, or `URLSearchParams`. */
export interface FormDataLike {
  getAll(name: string): readonly unknown[]
}

/** The visit a send came from. HubSpot ties the contact to its tracking cookie through `hutk`. */
export interface HubSpotContext {
  pageUri?: string
  pageName?: string
  hutk?: string
  ipAddress?: string
}

/** The body of a send, as HubSpot's submit endpoint takes it. */
export interface HubSpotSubmission {
  fields: {objectTypeId: string; name: string; value: string}[]
  context: HubSpotContext
  legalConsentOptions?:
    | {
        consent: {
          consentToProcess: boolean
          text: string
          communications: {value: boolean; subscriptionTypeId: number; text: string}[]
        }
      }
    | {
        legitimateInterest: {
          value: true
          subscriptionTypeId: number
          legalBasis: 'LEAD' | 'CUSTOMER'
          text: string
        }
      }
}

export type HubSpotReadResult =
  | {status: 'ready'; submission: HubSpotSubmission}
  | {status: 'invalid'; errors: Record<string, HubSpotFieldError>}
  /** The honeypot was filled. Tell the visitor it went, and send nothing. */
  | {status: 'spam'}

const strings = (data: FormDataLike, name: string): string[] =>
  data.getAll(name).filter((value): value is string => typeof value === 'string')

const first = (data: FormDataLike, name: string): string | undefined =>
  strings(data, name)[0]?.trim() || undefined

const ticked = (data: FormDataLike, name: string): boolean =>
  answerOf('checkbox', strings(data, name))[0] === 'true'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Why an answer won't do, or nothing. HubSpot judges phone numbers and blocked domains itself. */
function check(field: HubSpotField, answer: readonly string[]): HubSpotFieldError | undefined {
  const empty = field.type === 'checkbox' ? answer[0] !== 'true' : answer.length === 0
  if (empty) return field.required ? 'required' : undefined
  const value = answer[0] ?? ''
  switch (field.type) {
    case 'email':
      return EMAIL.test(value) ? undefined : 'invalid'
    case 'number':
      return Number.isFinite(Number(value)) ? undefined : 'invalid'
    case 'date':
      return DATE.test(value) && !Number.isNaN(Date.parse(value)) ? undefined : 'invalid'
    case 'select':
    case 'radio':
    case 'checkboxes': {
      const allowed = new Set(field.options.map((option) => option.value))
      return answer.every((chosen) => allowed.has(chosen)) ? undefined : 'invalid'
    }
    default:
      return undefined
  }
}

/**
 * Every field's answer as posted. A field that posted nothing has none, not its default, except
 * a hidden one: the site may fill it (a campaign from the address, say) or leave HubSpot's value.
 */
export function postedAnswers(form: HubSpotFormDefinition, data: FormDataLike): HubSpotAnswers {
  const answers: Record<string, string[]> = {}
  for (const field of allFields(form.groups)) {
    const name = inputName(field)
    const posted = strings(data, name)
    answers[name] = field.hidden && posted.length === 0 ? field.defaultValues : posted
  }
  return answers
}

function consentOptions(
  form: HubSpotFormDefinition,
  data: FormDataLike,
  errors: Record<string, HubSpotFieldError>,
): HubSpotSubmission['legalConsentOptions'] {
  const {consent} = form
  if (consent.type === 'none') return undefined
  if (consent.type === 'legitimateInterest') {
    const [subscriptionTypeId] = consent.subscriptionTypeIds
    if (subscriptionTypeId === undefined || consent.basis === 'other') return undefined
    return {
      legitimateInterest: {
        value: true,
        subscriptionTypeId,
        legalBasis: consent.basis === 'client' ? 'CUSTOMER' : 'LEAD',
        text: plainText(consent.privacyText),
      },
    }
  }
  const communications = consent.checkboxes.map((box) => {
    const name = subscriptionInput(box.subscriptionTypeId)
    const value = ticked(data, name)
    if (box.required && !value) errors[name] = 'required'
    return {value, subscriptionTypeId: box.subscriptionTypeId, text: plainText(box.label)}
  })
  // Explicit consent asks for a box of its own when HubSpot words one; otherwise sending is
  // the consent, as it always is for implicit consent.
  const asksForBox = consent.type === 'explicit' && consent.processLabel !== undefined
  const consentToProcess = asksForBox ? ticked(data, CONSENT_INPUT) : true
  if (!consentToProcess) errors[CONSENT_INPUT] = 'required'
  const text =
    consent.type === 'explicit'
      ? (consent.processLabel ?? consent.processText)
      : consent.processText
  return {consent: {consentToProcess, text: plainText(text), communications}}
}

/**
 * Reads a send against the form it was drawn from: only the fields that showed, checked the way
 * HubSpot checks them, in the shape its submit endpoint takes. Context passed in wins over the
 * page the form posted.
 */
export function readSubmission(
  form: HubSpotFormDefinition,
  data: FormDataLike,
  context: HubSpotContext = {},
): HubSpotReadResult {
  if (strings(data, HONEYPOT_INPUT).some((value) => value.trim() !== '')) return {status: 'spam'}

  const answers = postedAnswers(form, data)
  const errors: Record<string, HubSpotFieldError> = {}
  const fields: HubSpotSubmission['fields'] = []
  for (const field of activeFields(form, answers)) {
    const name = inputName(field)
    const answer = answerOf(field.type, answers[name] ?? [])
    const error = field.hidden ? undefined : check(field, answer)
    if (error) errors[name] = error
    // An unticked box is left out rather than sent as false, so it never clears what a
    // returning contact said before.
    const value =
      field.type === 'checkbox' ? (answer[0] === 'true' ? 'true' : '') : answer.join(';')
    if (value !== '') fields.push({objectTypeId: field.objectTypeId, name: field.name, value})
  }
  const legalConsentOptions = consentOptions(form, data, errors)
  if (Object.keys(errors).length > 0) return {status: 'invalid', errors}

  const pageUri = context.pageUri ?? first(data, PAGE_URI_INPUT)
  const pageName = context.pageName ?? first(data, PAGE_NAME_INPUT)
  return {
    status: 'ready',
    submission: {
      fields,
      context: {
        ...(pageUri && isHttpUrl(pageUri) && {pageUri}),
        ...(pageName && {pageName: pageName.slice(0, 500)}),
        ...(context.hutk && {hutk: context.hutk}),
        ...(context.ipAddress && {ipAddress: context.ipAddress}),
      },
      ...(legalConsentOptions && {legalConsentOptions}),
    },
  }
}

const ERROR_TYPES: Record<string, HubSpotFieldError> = {
  REQUIRED_FIELD: 'required',
  INVALID_EMAIL: 'invalid',
  BLOCKED_EMAIL: 'blocked',
  INVALID_NUMBER: 'invalid',
  NUMBER_OUT_OF_RANGE: 'invalid',
  VALUE_NOT_IN_FIELD_DEFINITION: 'invalid',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The `hutk` cookie's value, when it looks like one: HubSpot sets 32 hex characters. */
export function readHutk(cookieHeader: string | null | undefined): string | undefined {
  const match = /(?:^|;\s*)hubspotutk=([0-9a-f]{32})(?:;|$)/i.exec(cookieHeader ?? '')
  return match?.[1]
}

/**
 * HubSpot's answer to a send, in what the visitor can do about it. Field errors come back keyed
 * by input name. HubSpot's own thank-you text and redirect win over the copy's, being newer.
 */
export function readHubSpotReply(
  form: HubSpotFormDefinition,
  status: number,
  body: unknown,
): HubSpotSubmitResult {
  if (status >= 200 && status < 300) {
    const message =
      isObject(body) && typeof body.inlineMessage === 'string' ? body.inlineMessage : undefined
    const redirect =
      isObject(body) && typeof body.redirectUri === 'string' ? body.redirectUri : undefined
    const after = form.afterSubmit
    if (redirect && isHttpUrl(redirect)) return {status: 'sent', redirect}
    if (message) return {status: 'sent', message}
    if (after.type === 'redirect') return {status: 'sent', redirect: after.url}
    if (after.type === 'message') return {status: 'sent', message: after.html}
    return {status: 'sent'}
  }
  if (status === 400 && isObject(body) && Array.isArray(body.errors)) {
    const byProperty = new Map(
      allFields(form.groups).map((field) => [field.name, inputName(field)]),
    )
    const errors: Record<string, HubSpotFieldError> = {}
    for (const error of body.errors) {
      if (!isObject(error) || typeof error.message !== 'string') continue
      const kind = typeof error.errorType === 'string' ? ERROR_TYPES[error.errorType] : undefined
      const property = /fields\.([a-z0-9_]+)/i.exec(error.message)?.[1]
      const name = property ? byProperty.get(property) : undefined
      if (kind && name) errors[name] = kind
    }
    if (Object.keys(errors).length > 0) return {status: 'invalid', errors}
  }
  return {status: 'failed'}
}

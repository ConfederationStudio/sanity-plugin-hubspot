import {answerOf, meetsCondition, SUPPORTED_OPERATORS} from './conditions'
import type {HubSpotConsent, HubSpotField, HubSpotGroup, HubSpotUndrawableReason} from './model'

/** Every field of a form, follow-ups included, parents before their follow-ups. */
export function allFields(groups: readonly HubSpotGroup[]): HubSpotField[] {
  const out: HubSpotField[] = []
  const walk = (field: HubSpotField) => {
    out.push(field)
    for (const followUp of field.followUps) walk(followUp.field)
  }
  for (const group of groups) for (const field of group.fields) walk(field)
  return out
}

/**
 * Why the site can't draw a form and send it itself, or nothing when it can.
 *
 * - reCAPTCHA: HubSpot refuses an API submission to a form that has it on.
 * - A visible file upload, payment field or field type the plugin doesn't know.
 * - A follow-up on a condition the site can't judge (HubSpot's date windows).
 * - A legitimate interest the submit API can't record: it takes exactly one subscription,
 *   with a lawful basis of lead or client.
 *
 * Progressive fields don't stop it: they're left out, and the Studio says so.
 */
export function undrawableReasons(form: {
  groups: readonly HubSpotGroup[]
  consent: HubSpotConsent
  recaptcha: boolean
}): HubSpotUndrawableReason[] {
  const reasons = new Set<HubSpotUndrawableReason>()
  if (form.recaptcha) reasons.add('recaptcha')
  for (const field of allFields(form.groups)) {
    if (!field.hidden) {
      if (field.type === 'file') reasons.add('file')
      else if (field.type === 'payment') reasons.add('payment')
      else if (field.type === 'unknown') reasons.add('unknown-field')
    }
    if (field.followUps.some((followUp) => !SUPPORTED_OPERATORS.has(followUp.when.operator)))
      reasons.add('condition')
  }
  if (form.consent.type === 'legitimateInterest') {
    if (form.consent.basis === 'other') reasons.add('consent-basis')
    else if (form.consent.subscriptionTypeIds.length !== 1) reasons.add('consent-subscriptions')
  }
  return [...reasons]
}

/** How a HubSpot form fits a site's own form that sends `names` (property names) only. */
export interface HubSpotFit {
  fits: boolean
  /** Sent by the site's form, but not on the HubSpot form. */
  missing: string[]
  /** Required by the HubSpot form, but not sent by the site's form. */
  unsent: string[]
}

/**
 * Whether a HubSpot form takes what a site's own form sends, such as a newsletter's one email
 * field: it must have every field the site sends, and require no other. A required follow-up
 * counts only where it can show: when the site sends its parent, or when its condition holds on
 * the answer an unsent parent has (none, its default when hidden, `false` for a single checkbox).
 */
export function fitsFields(groups: readonly HubSpotGroup[], names: readonly string[]): HubSpotFit {
  const onForm = new Set(allFields(groups).map((field) => field.name))
  const sent = new Set(names)
  const missing = names.filter((name) => !onForm.has(name))
  const unsent: string[] = []
  const walk = (field: HubSpotField) => {
    if (field.required && !field.hidden && !sent.has(field.name)) unsent.push(field.name)
    const unsentAnswer = answerOf(field.type, field.hidden ? field.defaultValues : [])
    for (const followUp of field.followUps)
      if (sent.has(field.name) || meetsCondition(followUp.when, unsentAnswer)) walk(followUp.field)
  }
  for (const group of groups) for (const field of group.fields) walk(field)
  return {fits: missing.length === 0 && unsent.length === 0, missing, unsent}
}

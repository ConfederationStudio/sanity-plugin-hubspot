import {SUPPORTED_OPERATORS} from './conditions'
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

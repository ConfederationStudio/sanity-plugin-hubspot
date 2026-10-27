import {allFields} from '../core/drawable'
import {submitUrl} from '../core/hosts'
import type {HubSpotFormDefinition, HubSpotSubmitResult} from '../core/model'
import {inputName} from '../core/names'
import {isSampleFormId} from '../core/sample'
import {readHubSpotReply, readHutk, readSubmission, type FormDataLike} from '../core/submission'

/**
 * Sends a form from the browser to HubSpot's public endpoint, which allows cross-origin calls,
 * so a site with no server can take forms. HubSpot reads the visitor's address from the call.
 */
export async function sendHubSpotForm(
  form: HubSpotFormDefinition,
  data: FormDataLike,
): Promise<HubSpotSubmitResult> {
  const read = readSubmission(form, data, {hutk: readHutk(document.cookie)})
  if (read.status === 'invalid') return {status: 'invalid', errors: read.errors}
  if (read.status === 'spam' || isSampleFormId(form.formId))
    return readHubSpotReply(form, 200, null)
  if (!form.portalId) return {status: 'failed'}
  try {
    const response = await fetch(submitUrl(form.portalId, form.formId), {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(read.submission),
    })
    const body: unknown = await response.json().catch(() => null)
    return readHubSpotReply(form, response.status, body)
  } catch {
    return {status: 'failed'}
  }
}

/**
 * Fills hidden fields from the page's address, the way HubSpot's embed does: a hidden
 * `utm_source` field takes `?utm_source=` when the address has it.
 */
export function fillFromAddress(
  form: HubSpotFormDefinition,
  data: FormData,
  search: URLSearchParams,
): void {
  for (const field of allFields(form.groups)) {
    if (!field.hidden) continue
    const value = search.get(field.name)
    if (value !== null) data.set(inputName(field), value.slice(0, 1_000))
  }
}

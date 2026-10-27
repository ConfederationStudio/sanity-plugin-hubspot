import {submitUrl} from '../core/hosts'
import type {HubSpotFormDefinition, HubSpotSubmitResult} from '../core/model'
import {parseForm} from '../core/parse'
import {isSampleFormId} from '../core/sample'
import {
  readHubSpotReply,
  readSubmission,
  type FormDataLike,
  type HubSpotContext,
} from '../core/submission'
import {submissionContext, type HeadersLike} from './context'
import {globalFetch} from './http'
import {cachedAccount, hubspotApi} from './hubspot-api'

const TIMEOUT = 10_000

export interface SubmitFormOptions {
  /**
   * A HubSpot Service Key. With one, the send goes through HubSpot's authenticated endpoint,
   * which keeps its spam checks; it falls back to the public one if HubSpot refuses the key.
   */
  token?: string
  /** The request's headers, for HubSpot's tracking cookie, the visitor's address and the page. */
  headers?: HeadersLike
  /** Wins over what the headers say. */
  context?: HubSpotContext
  /** Stands in for the global `fetch`, in tests. */
  fetch?: typeof fetch
}

/**
 * Sends a form to HubSpot from the site's server, from a server action or a route. Pass the form
 * as the site's own query read it, never one posted by the browser. Returns what the visitor can
 * do next: the thank-you, the errors to show, or that it failed.
 */
export async function submitForm(
  form: HubSpotFormDefinition,
  data: FormDataLike,
  options: SubmitFormOptions = {},
): Promise<HubSpotSubmitResult> {
  const context = {...(options.headers && submissionContext(options.headers)), ...options.context}
  const read = readSubmission(form, data, context)
  if (read.status === 'invalid') return {status: 'invalid', errors: read.errors}
  // A bot gets the thank-you too, so it learns nothing; a sample form has nowhere to go.
  if (read.status === 'spam' || isSampleFormId(form.formId))
    return readHubSpotReply(form, 200, null)
  const {portalId} = form
  if (!portalId) return {status: 'failed'}

  const fetcher = options.fetch ?? globalFetch
  const send = (secure: boolean) =>
    fetcher(submitUrl(portalId, form.formId, secure), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secure && {authorization: `Bearer ${options.token}`}),
      },
      body: JSON.stringify(read.submission),
      signal: AbortSignal.timeout(TIMEOUT),
    })

  try {
    let response = await send(Boolean(options.token))
    if (options.token && (response.status === 401 || response.status === 403))
      response = await send(false)
    const body: unknown = await response.json().catch(() => null)
    return readHubSpotReply(form, response.status, body)
  } catch {
    return {status: 'failed'}
  }
}

/**
 * One form read live from HubSpot, for a page that can't wait for an editor to refresh the
 * copy. Null when HubSpot no longer has it.
 */
export async function getHubSpotForm(
  formId: string,
  options: {token: string; fetch?: typeof fetch},
): Promise<HubSpotFormDefinition | null> {
  const api = hubspotApi(options.token, options.fetch ?? globalFetch)
  const [raw, account] = await Promise.all([api.form(formId), cachedAccount(api, options.token)])
  return raw ? parseForm(raw, account) : null
}

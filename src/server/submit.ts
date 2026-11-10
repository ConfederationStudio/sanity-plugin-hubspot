import {readFormCopy, type HubSpotFormCopy} from '../core/copy'
import {submitUrl} from '../core/hosts'
import {isPinnedTo} from '../core/ids'
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
import {fingerprint, globalFetch} from './http'
import {cachedAccount, hubspotApi} from './hubspot-api'

const TIMEOUT = 10_000

export interface SubmitFormOptions {
  /**
   * The site's HubSpot account id. A form copy is a document any editor of the project can
   * rewrite; a copy that names another account is refused, so what visitors enter can't be sent
   * somewhere else. Set it whenever you can: without it, a `token` is asked which account it
   * belongs to, and nothing is sent while HubSpot can't say.
   */
  portalId?: string
  /**
   * A HubSpot Service Key. With one, the send goes through HubSpot's authenticated endpoint,
   * which keeps its spam checks; it falls back to the public one if HubSpot refuses the key.
   * Without a `portalId`, the form must belong to the key's own account.
   */
  token?: string
  /** The request's headers, for HubSpot's tracking cookie, the visitor's address and the page. */
  headers?: HeadersLike
  /** Wins over what the headers say. */
  context?: HubSpotContext
  /** Stands in for the global `fetch`, in tests. */
  fetch?: typeof fetch
}

/** The account each key belongs to, which never changes, so HubSpot is asked once per key. */
const keyAccounts = new Map<string, string>()

async function accountOfKey(token: string, fetcher: typeof fetch): Promise<string> {
  const id = await fingerprint(token)
  const known = keyAccounts.get(id)
  if (known) return known
  // A refusal or an outage throws, and is asked about again on the next send.
  const {portalId} = await hubspotApi(token, fetcher).account()
  if (keyAccounts.size >= 50) keyAccounts.clear()
  keyAccounts.set(id, portalId)
  return portalId
}

/** Forgets which account each key belongs to. For tests. */
export function clearKeyAccounts(): void {
  keyAccounts.clear()
}

/**
 * Sends a form to HubSpot from the site's server, from a server action or a route. Pass the form
 * as the site's own query read it, never one posted by the browser. Returns what the visitor can
 * do next: the thank-you, the errors to show, or that it failed.
 *
 * The form must belong to the site's HubSpot account: the `portalId` given, or else the account
 * of the `token`. A copy that names another account fails and is sent nowhere.
 */
export async function submitForm(
  copy: HubSpotFormCopy,
  data: FormDataLike,
  options: SubmitFormOptions = {},
): Promise<HubSpotSubmitResult> {
  const form = readFormCopy(copy)
  if (!form) return {status: 'failed'}
  // A sample form is sent nowhere, so it has no account to check.
  const sample = isSampleFormId(form.formId)
  if (!sample && !isPinnedTo(form, options.portalId)) return {status: 'failed'}
  const context = {...(options.headers && submissionContext(options.headers)), ...options.context}
  const read = readSubmission(form, data, context)
  if (read.status === 'invalid') return {status: 'invalid', errors: read.errors}
  // A bot gets the thank-you too, so it learns nothing; a sample form has nowhere to go.
  if (read.status === 'spam' || sample) return readHubSpotReply(form, 200, null)
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
    // With no account pinned, the key vouches for it. Should HubSpot not answer, nothing is sent.
    if (
      options.token &&
      options.portalId === undefined &&
      (await accountOfKey(options.token, fetcher)) !== portalId
    )
      return {status: 'failed'}
    // The account is the site's by now, so the public endpoint is safe to fall back on.
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

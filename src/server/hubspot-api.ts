import {isRegion, regionFromUiDomain} from '../core/hosts'
import type {RawForm} from '../core/hubspot'
import type {HubSpotAccount} from '../core/model'
import {isRawForm} from '../core/parse'
import {fingerprint, globalFetch} from './http'

/**
 * Every call the plugin makes to HubSpot's API, in one place. Forms API v3 goes unsupported in
 * September 2027, so its successor will be a change to this file alone.
 */

const API = 'https://api.hubapi.com'
/** HubSpot's largest page. The route follows the cursor, so this only sets how many calls. */
const PAGE_SIZE = 50
/** 5,000 forms. Past that the list stops rather than loop on a cursor that never ends. */
const MAX_PAGES = 100
const TIMEOUT = 10_000

export type HubSpotFailure = 'key-rejected' | 'rate-limited' | 'hubspot-failed'

/** A HubSpot call that failed. The message carries the status only, never the key. */
export class HubSpotApiError extends Error {
  readonly failure: HubSpotFailure
  readonly status: number
  constructor(failure: HubSpotFailure, status: number) {
    super(`HubSpot answered ${status}`)
    this.name = 'HubSpotApiError'
    this.failure = failure
    this.status = status
  }
}

export interface HubSpotApi {
  account(): Promise<HubSpotAccount>
  /** Whether the key may read forms: one form's worth of the list. */
  checkForms(): Promise<void>
  forms(): Promise<RawForm[]>
  /** Null when HubSpot has no such form, or has archived it. */
  form(formId: string): Promise<RawForm | null>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function fail(status: number): never {
  const failure =
    status === 401 || status === 403
      ? 'key-rejected'
      : status === 429
        ? 'rate-limited'
        : 'hubspot-failed'
  throw new HubSpotApiError(failure, status)
}

export function hubspotApi(key: string, fetcher: typeof fetch = globalFetch): HubSpotApi {
  async function get(path: string): Promise<{status: number; body: unknown}> {
    const response = await fetcher(`${API}${path}`, {
      headers: {authorization: `Bearer ${key}`, accept: 'application/json'},
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const body: unknown = await response.json().catch(() => null)
    return {status: response.status, body}
  }

  return {
    async account() {
      const {status, body} = await get('/account-info/v3/details')
      if (status !== 200 || !isObject(body)) return fail(status)
      const portalId =
        typeof body.portalId === 'number' || typeof body.portalId === 'string'
          ? String(body.portalId)
          : ''
      if (!/^\d{1,12}$/.test(portalId)) return fail(status)
      const uiDomain = typeof body.uiDomain === 'string' ? body.uiDomain : undefined
      return {
        portalId,
        region: isRegion(body.dataHostingLocation)
          ? body.dataHostingLocation
          : regionFromUiDomain(uiDomain),
        ...(uiDomain && {uiDomain}),
        ...(typeof body.accountType === 'string' && {accountType: body.accountType}),
      }
    },

    async checkForms() {
      const {status} = await get('/marketing/v3/forms?limit=1')
      if (status !== 200) fail(status)
    },

    async forms() {
      const forms: RawForm[] = []
      let after: string | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({
          limit: String(PAGE_SIZE),
          archived: 'false',
          formTypes: 'hubspot',
        })
        if (after) query.set('after', after)
        // oxlint-disable-next-line no-await-in-loop -- each page's cursor comes from the one before
        const {status, body} = await get(`/marketing/v3/forms?${query}`)
        if (status !== 200 || !isObject(body)) return fail(status)
        if (Array.isArray(body.results)) forms.push(...body.results.filter(isRawForm))
        const next =
          isObject(body.paging) && isObject(body.paging.next) ? body.paging.next.after : undefined
        if (typeof next !== 'string' || next === '' || next === after) break
        after = next
      }
      return forms
    },

    async form(formId) {
      const {status, body} = await get(`/marketing/v3/forms/${encodeURIComponent(formId)}`)
      if (status === 200 && isRawForm(body)) return body.archived === true ? null : body
      // HubSpot answers a form id from another account with a 500 that says so.
      const foreign =
        status === 500 &&
        isObject(body) &&
        typeof body.message === 'string' &&
        /cannot access/i.test(body.message)
      if (status === 404 || foreign) return null
      return fail(status)
    },
  }
}

const ACCOUNT_TTL = 10 * 60_000
const accounts = new Map<string, {account: HubSpotAccount; expires: number}>()

/** The account a key belongs to, kept for ten minutes: every list of forms needs it. */
export async function cachedAccount(api: HubSpotApi, key: string): Promise<HubSpotAccount> {
  const id = await fingerprint(key)
  const cached = accounts.get(id)
  if (cached && cached.expires > Date.now()) return cached.account
  const account = await api.account()
  if (accounts.size >= 50) accounts.clear()
  accounts.set(id, {account, expires: Date.now() + ACCOUNT_TTL})
  return account
}

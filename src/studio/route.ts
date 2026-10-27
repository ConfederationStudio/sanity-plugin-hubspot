import {useMemo} from 'react'
import {useClient} from 'sanity'

import type {
  HubSpotConnection,
  HubSpotFormReply,
  HubSpotFormsReply,
  HubSpotRouteErrorCode,
  HubSpotSaveKeyReply,
} from '../core/route'
import {API_VERSION} from './config'

/** Why the Studio didn't get an answer: the route's own codes, and two of the Studio's. */
export type RouteFailure = HubSpotRouteErrorCode | 'no-token' | 'unreachable'

export class RouteError extends Error {
  readonly code: RouteFailure
  constructor(code: RouteFailure) {
    super(code)
    this.name = 'RouteError'
    this.code = code
  }
}

export interface RouteClient {
  connection(): Promise<HubSpotConnection>
  forms(): Promise<HubSpotFormsReply>
  form(formId: string): Promise<HubSpotFormReply>
  saveKey(key: string): Promise<HubSpotSaveKeyReply>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Calls the site's route as the editor, with the token Sanity gave the Studio on sign-in. A
 * Studio signed in through Sanity's cookie alone has no token to pass, and the editor must sign
 * in again.
 */
export function routeClient(api: string, token: string | undefined): RouteClient {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!token) throw new RouteError('no-token')
    let response: Response
    try {
      response = await fetch(`${api}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(init.body !== undefined && {'content-type': 'application/json'}),
        },
      })
    } catch {
      throw new RouteError('unreachable')
    }
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const code = isObject(body) && typeof body.error === 'string' ? body.error : 'hubspot-failed'
      // oxlint-disable-next-line no-unsafe-type-assertion -- the route answers with its own codes
      throw new RouteError(code as RouteFailure)
    }
    // oxlint-disable-next-line no-unsafe-type-assertion -- the route's replies are typed in core/route
    return body as T
  }

  return {
    connection: () => call('/connection'),
    forms: () => call('/forms'),
    form: (formId) => call(`/forms/${encodeURIComponent(formId)}`),
    saveKey: (key) => call('/connection', {method: 'POST', body: JSON.stringify({key})}),
  }
}

/** The route as the signed-in editor. */
export function useRoute(api: string): RouteClient {
  const client = useClient({apiVersion: API_VERSION})
  const {token} = client.config()
  return useMemo(() => routeClient(api, token), [api, token])
}

/** What to tell an editor about a failure, and what to do about it. */
export function failureText(failure: unknown, api: string): string {
  const code: RouteFailure = failure instanceof RouteError ? failure.code : 'hubspot-failed'
  switch (code) {
    case 'no-token':
      return 'This Studio session has no token to show the site. Sign out of the Studio and sign in again.'
    case 'unreachable':
      return `The Studio can't reach the site's HubSpot route at ${api}. Check that the site is up and that the route allows this Studio's address.`
    case 'signed-out':
      return 'The site couldn’t confirm who you are. Sign out of the Studio and sign in again.'
    case 'not-member':
      return 'Your account isn’t a member of this project.'
    case 'forbidden-origin':
      return 'The site’s route doesn’t accept this Studio’s address. Add it to studioOrigins in the route.'
    case 'forbidden-role':
      return 'Only an administrator can change the HubSpot key.'
    case 'no-secret-key':
      return 'The site has no HUBSPOT_SECRET_KEY, so it can’t keep a pasted key. Set it, or set HUBSPOT_TOKEN instead.'
    case 'key-from-environment':
      return 'The key comes from the site’s environment (HUBSPOT_TOKEN), so it can’t be changed here.'
    case 'not-connected':
      return 'HubSpot isn’t connected yet. Open the HubSpot tab to connect it.'
    case 'key-rejected':
      return 'HubSpot doesn’t take this as a key. It needs a Service Key, from Development › Keys › Service keys in HubSpot: a personal access key or developer API key won’t work.'
    case 'key-lacks-scope':
      return 'HubSpot takes the key, but it lacks the forms scope. Add the scope to the Service Key in HubSpot, or create one that has it.'
    case 'rate-limited':
      return 'HubSpot asked for a pause. Try again in a minute.'
    case 'sanity-failed':
      return 'The site couldn’t reach Sanity to check who you are. Try again.'
    case 'bad-request':
      return 'The site’s route didn’t understand the request.'
    case 'not-found':
      return 'The site’s route doesn’t know that request. Check the plugin’s api option.'
    default:
      return 'HubSpot didn’t answer. Try again.'
  }
}

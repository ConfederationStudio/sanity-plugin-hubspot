import type {HubSpotAccount, HubSpotFormDefinition} from './model'

/**
 * What the site's route and the Studio say to each other. Both import these, so they can't
 * drift apart.
 */

/** Where the route's HubSpot key comes from: the site's environment, or pasted in the Studio. */
export type HubSpotKeySource = 'environment' | 'studio'

export type HubSpotConnection =
  | {status: 'connected'; source: HubSpotKeySource; account: HubSpotAccount; canSaveKey: boolean}
  /** No key, or a saved one the site's secret key can no longer open (`unreadable`). */
  | {status: 'not-connected'; canSaveKey: boolean; unreadable?: boolean}
  | {status: 'key-rejected'; source: HubSpotKeySource; canSaveKey: boolean}
  /** The route answers with sample forms and calls no one. */
  | {status: 'stand-in'}

export interface HubSpotFormsReply {
  forms: HubSpotFormDefinition[]
}

/** `form` is null when HubSpot has no such form any more: archived or deleted. */
export interface HubSpotFormReply {
  form: HubSpotFormDefinition | null
}

export interface HubSpotSaveKeyRequest {
  key: string
}

export interface HubSpotSaveKeyReply {
  sealedKey: string
  account: HubSpotAccount
}

export type HubSpotRouteErrorCode =
  | 'signed-out'
  | 'not-member'
  | 'forbidden-origin'
  | 'forbidden-role'
  | 'no-secret-key'
  | 'key-from-environment'
  | 'not-connected'
  | 'key-rejected'
  | 'rate-limited'
  | 'hubspot-failed'
  | 'sanity-failed'
  | 'bad-request'
  | 'not-found'

export interface HubSpotRouteError {
  error: HubSpotRouteErrorCode
}

/** The hidden settings document. Its id holds a dot, so it is never served without a token. */
export interface HubSpotSettingsDocument {
  _id: string
  _type: string
  /** The HubSpot key pasted in the Studio, sealed by the route. Only the route can open it. */
  sealedKey?: string
  account?: HubSpotAccount
}

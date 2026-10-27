import {isFormId, isPortalId} from './ids'

export const DEFAULT_REGION = 'na1'

const REGION = /^[a-z]{2,3}\d{1,2}$/

export const isRegion = (value: unknown): value is string =>
  typeof value === 'string' && REGION.test(value)

/** The account's data centre from where its HubSpot app lives: `app-eu1.hubspot.com` is `eu1`. */
export function regionFromUiDomain(uiDomain: string | undefined): string {
  const match = /^app-([a-z0-9]+)\./.exec(uiDomain ?? '')
  return match && isRegion(match[1]) ? match[1] : DEFAULT_REGION
}

/** HubSpot serves its scripts from `js.` for `na1` and `js-<region>.` for every other centre. */
const scriptHost = (domain: string, region: string | undefined) =>
  region && region !== DEFAULT_REGION && isRegion(region)
    ? `js-${region}.${domain}`
    : `js.${domain}`

function portal(portalId: string): string {
  if (!isPortalId(portalId)) throw new TypeError('A HubSpot portal id is digits only')
  return portalId
}

/** The tracking script, which also loads the chat widget and the cookie banner. */
export const trackingScriptUrl = (portalId: string, region?: string): string =>
  `https://${scriptHost('hs-scripts.com', region)}/${portal(portalId)}.js`

/** The loader for HubSpot's own embed: the current one names the account, the legacy one doesn't. */
export const embedScriptUrl = (
  embed: 'v4' | 'legacy',
  portalId: string,
  region?: string,
): string =>
  embed === 'v4'
    ? `https://${scriptHost('hsforms.net', region)}/forms/embed/${portal(portalId)}.js`
    : `https://${scriptHost('hsforms.net', region)}/forms/embed/v2.js`

/**
 * Where a send goes. The public endpoint takes no key and answers browsers (it allows CORS); the
 * secure one takes a key and keeps HubSpot's checks for spam and unknown fields.
 */
export function submitUrl(portalId: string, formId: string, secure = false): string {
  if (!isFormId(formId)) throw new TypeError('A HubSpot form id is a GUID')
  return `https://api.hsforms.com/submissions/v3/integration/${secure ? 'secure/' : ''}submit/${portal(portalId)}/${formId}`
}

import type {HubSpotContentType} from '../core/content-type'

export interface HubSpotPluginConfig {
  /**
   * The site's HubSpot route, such as `https://www.example.com/api/hubspot`, or a path such as
   * `/api/hubspot` for a Studio on the site's own domain. The Studio reaches HubSpot through it
   * only, the way Mux's plugin goes through `muxApiHost`.
   */
  api: string
  /**
   * How HubSpot files each document type's page views, such as
   * `{post: 'blog-post', campaign: 'landing-page'}`. An editor can override it per document with
   * the `hubspot.page` field. Pass the same map to the site's tracker.
   */
  contentTypes?: Readonly<Record<string, HubSpotContentType>>
  /** The HubSpot tab. `false` leaves it out. */
  tool?: boolean | {name?: string; title?: string}
}

/** The Studio's API version for its own reads and writes. */
export const API_VERSION = '2025-02-19'

export function checkConfig(config: HubSpotPluginConfig): HubSpotPluginConfig {
  const {api} = config
  const absolute = URL.canParse(api) && /^https?:$/.test(new URL(api).protocol)
  if (!absolute && !api.startsWith('/'))
    throw new TypeError(
      `sanity-plugin-hubspot: api must be the site's HubSpot route, such as https://www.example.com/api/hubspot`,
    )
  return {...config, api: api.replace(/\/+$/, '')}
}

import type {HubSpotContentType} from '../core/content-type'
import {trackingScriptUrl} from '../core/hosts'
import {queue} from './globals'

const SCRIPT_ID = 'hs-script-loader'

export interface HubSpotTrackerOptions {
  portalId: string
  /** The account's data centre, such as `eu1`. Default: `na1`. */
  region?: string
}

/** HubSpot's tracking calls, without React: for a site that runs its own consent and routing. */
export interface HubSpotTracking {
  /** Loads HubSpot's script, which counts the page it loads on. */
  load(): void
  /** Counts a page change in a single-page app. */
  pageView(path: string, contentType?: HubSpotContentType): void
  /** How HubSpot files the next page view. */
  setContentType(contentType: HubSpotContentType): void
  /** Consent withdrawn: HubSpot removes its cookies and stops tracking. */
  revoke(): void
  /** Consent given again after a `revoke`. */
  resume(): void
}

export function createTracker({portalId, region}: HubSpotTrackerOptions): HubSpotTracking {
  const src = trackingScriptUrl(portalId, region)
  return {
    load() {
      if (document.getElementById(SCRIPT_ID)) return
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = src
      script.async = true
      script.defer = true
      document.head.append(script)
    },
    pageView(path, contentType) {
      const hsq = queue('_hsq')
      hsq.push(['setPath', path])
      if (contentType) hsq.push(['setContentType', contentType])
      hsq.push(['trackPageView'])
    },
    setContentType(contentType) {
      queue('_hsq').push(['setContentType', contentType])
    },
    revoke() {
      queue('_hsp').push(['revokeCookieConsent'])
      queue('_hsq').push(['doNotTrack'])
    },
    resume() {
      queue('_hsq').push(['doNotTrack', {track: true}])
    },
  }
}

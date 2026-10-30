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
  /** Whether HubSpot's script is on the page, from this tracker or another. */
  loaded(): boolean
  /** Counts a page change in a single-page app. Without a content type, HubSpot picks one. */
  pageView(path: string, contentType?: HubSpotContentType): void
  /** How HubSpot files the next page view. */
  setContentType(contentType: HubSpotContentType): void
  /** Consent withdrawn: HubSpot removes its cookies and stops tracking. */
  revoke(): void
  /**
   * Consent given. It lifts a `revoke`, from this visit or an earlier one, and has HubSpot set
   * its cookies again without a reload.
   */
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
    loaded() {
      return document.getElementById(SCRIPT_ID) !== null
    },
    pageView(path, contentType) {
      const hsq = queue('_hsq')
      hsq.push(['setPath', path])
      // Empty, it clears the last page's, which HubSpot would otherwise keep.
      hsq.push(['setContentType', contentType ?? ''])
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
      queue('_hsp').push([
        'setHubSpotConsent',
        {analytics: true, advertisement: true, functionality: true},
      ])
      queue('_hsq').push(['doNotTrack', {track: true}])
    },
  }
}

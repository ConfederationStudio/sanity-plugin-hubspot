import {useEffect, useMemo} from 'react'

import type {HubSpotContentType} from '../core/content-type'
import {createTracker} from './tracker'

export interface HubSpotTrackerProps {
  portalId: string
  region?: string
  /**
   * Whether the visitor agreed to tracking, from the site's consent manager. `'hubspot'` loads
   * the script at once and leaves consent to HubSpot's own cookie banner.
   */
  consent: boolean | 'hubspot'
  /** The page's path. A change is counted as a page view, for single-page apps. */
  path?: string
  /** How HubSpot files this page's views. */
  contentType?: HubSpotContentType
  /** Turns tracking off, as in draft mode and Presentation previews, so editors aren't counted. */
  disabled?: boolean
}

/**
 * What the page has told HubSpot. Every tracker on it shares this, as they share the script: a
 * site that renders the tracker in each page gets a new one on each page change.
 */
let told: {path?: string; revoked: boolean} = {revoked: false}

/**
 * HubSpot's tracking script, loaded only after consent. It also brings HubSpot's chat. The
 * cookie it sets, `hubspotutk`, ties a form sent later to the visitor's earlier page views.
 */
export function HubSpotTracker({
  portalId,
  region,
  consent,
  path,
  contentType,
  disabled,
}: HubSpotTrackerProps) {
  const tracker = useMemo(() => createTracker({portalId, region}), [portalId, region])

  useEffect(() => {
    if (disabled) return
    if (consent === false) {
      if (tracker.loaded() && !told.revoked) {
        tracker.revoke()
        told.revoked = true
      }
      return
    }
    if (!tracker.loaded()) {
      // HubSpot keeps a refusal from an earlier visit in a cookie, which consent lifts.
      if (consent === true) tracker.resume()
      // Queued before the script arrives, so the first page view is filed right.
      if (contentType) tracker.setContentType(contentType)
      tracker.load()
      told = {path, revoked: false}
      return
    }
    if (consent === true && told.revoked) {
      tracker.resume()
      told.revoked = false
      // Nothing was counted while consent was withdrawn, so the page counts now.
      const here = path ?? window.location.pathname
      tracker.pageView(here, contentType)
      told.path = here
      return
    }
    if (path !== undefined && path !== told.path) {
      tracker.pageView(path, contentType)
      told.path = path
    }
  }, [consent, contentType, disabled, path, tracker])

  return null
}

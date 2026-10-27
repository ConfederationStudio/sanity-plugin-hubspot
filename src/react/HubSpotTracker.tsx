import {useEffect, useMemo, useRef} from 'react'

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
  const seen = useRef<{loaded: boolean; revoked: boolean; path?: string}>({
    loaded: false,
    revoked: false,
  })

  useEffect(() => {
    const state = seen.current
    if (disabled) return
    if (consent === false) {
      if (state.loaded && !state.revoked) {
        tracker.revoke()
        state.revoked = true
      }
      return
    }
    if (state.revoked) {
      tracker.resume()
      state.revoked = false
    }
    if (!state.loaded) {
      // Queued before the script arrives, so the first page view is filed right.
      if (contentType) tracker.setContentType(contentType)
      tracker.load()
      state.loaded = true
      state.path = path
      return
    }
    if (path !== undefined && path !== state.path) {
      tracker.pageView(path, contentType)
      state.path = path
    }
  }, [consent, contentType, disabled, path, tracker])

  return null
}

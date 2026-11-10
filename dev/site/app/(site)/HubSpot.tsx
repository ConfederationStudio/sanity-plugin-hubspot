'use client'

import {usePathname} from 'next/navigation'
import {HubSpotChat, HubSpotTracker, type HubSpotContentType} from 'sanity-plugin-hubspot/react'

import {portalId, region} from '../../lib/hubspot'
import {useConsent} from './Consent'

/** Tracking and chat, set up as the README shows, on every page. */
export function HubSpot({
  contentType,
  hideChat,
  inlineChat,
}: {
  contentType?: HubSpotContentType
  hideChat?: boolean
  inlineChat?: boolean
}) {
  const path = usePathname()
  const consent = useConsent()
  return (
    <>
      <HubSpotTracker
        portalId={portalId}
        region={region}
        consent={consent}
        path={path}
        contentType={contentType}
      />
      <HubSpotChat hidden={hideChat} inline={inlineChat} path={path} consent={consent} />
    </>
  )
}

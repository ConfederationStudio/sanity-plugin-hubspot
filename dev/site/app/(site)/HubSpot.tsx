'use client'

import {usePathname} from 'next/navigation'
import {HubSpotChat, HubSpotTracker, type HubSpotContentType} from 'sanity-plugin-hubspot/react'

import {useConsent} from './Consent'

/** The plugin's test account. Set these to try it against another one. */
const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID ?? '247346482'
const region = process.env.NEXT_PUBLIC_HUBSPOT_REGION ?? 'na2'

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

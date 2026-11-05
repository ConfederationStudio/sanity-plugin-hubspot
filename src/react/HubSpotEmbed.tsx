import {useEffect, useId, useMemo, useRef} from 'react'

import {readFormCopy, type HubSpotFormCopy} from '../core/copy'
import {DEFAULT_REGION, embedScriptUrl} from '../core/hosts'
import {hubspotWindow, loadScript} from './globals'

export interface HubSpotEmbedProps {
  form: Pick<HubSpotFormCopy, 'formId' | 'portalId' | 'region' | 'embed'>
  className?: string
}

/**
 * HubSpot's own embed, for a form the site can't draw: with reCAPTCHA, a file upload or a
 * payment. It follows the form's embed: the current one draws in a frame, the legacy one into
 * the page.
 */
export function HubSpotEmbed({form, className}: HubSpotEmbedProps) {
  const target = useRef<HTMLDivElement>(null)
  const id = `hubspot-embed-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const read = useMemo(() => readFormCopy(form), [form])
  const formId = read?.formId
  const portalId = read?.portalId
  const embed = read?.embed
  const region = read?.region ?? DEFAULT_REGION

  useEffect(() => {
    const element = target.current
    if (!formId || !portalId || !embed || !element) return undefined
    let live = true
    if (embed === 'v4') {
      // The current loader draws the frames it finds as it runs, so after a page change in a
      // single-page app it runs again for a frame still empty.
      loadScript(
        embedScriptUrl('v4', portalId, region),
        () => element.childElementCount === 0,
      ).catch(() => undefined)
    } else {
      const draw = async () => {
        await loadScript(embedScriptUrl('legacy', portalId, region))
        if (live) hubspotWindow().hbspt?.forms.create({portalId, formId, region, target: `#${id}`})
      }
      draw().catch(() => undefined)
    }
    return () => {
      live = false
      if (embed !== 'v4') element.replaceChildren()
    }
  }, [embed, formId, id, portalId, region])

  if (!formId || !portalId) return null
  return embed === 'v4' ? (
    <div
      ref={target}
      className={['hs-form-frame', className].filter(Boolean).join(' ')}
      data-region={region}
      data-form-id={formId}
      data-portal-id={portalId}
    />
  ) : (
    <div ref={target} id={id} className={className} />
  )
}

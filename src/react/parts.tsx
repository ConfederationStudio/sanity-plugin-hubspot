import type {ComponentType, ReactNode} from 'react'

import type {HubSpotConsent, HubSpotSubmitResult} from '../core/model'
import {CONSENT_INPUT, subscriptionInput} from '../core/names'

export interface HubSpotGroupProps {
  /** How many fields share the row: HubSpot lays out up to three side by side. */
  columns: number
  children: ReactNode
}

export interface HubSpotRichTextProps {
  /** HubSpot's HTML, as the form's editor wrote it in HubSpot. */
  html: string
  /** Where it sits: above a row, in the consent, or the thank-you after sending. */
  kind: 'text' | 'consent' | 'message'
}

export interface HubSpotConsentProps {
  consent: HubSpotConsent
  /** Error text by input name: the consent box and required subscription boxes. */
  errors: Record<string, string | undefined>
  idPrefix: string
  RichText: ComponentType<HubSpotRichTextProps>
}

export interface HubSpotSubmitProps {
  text: string
  pending: boolean
}

export interface HubSpotStatusProps {
  result: HubSpotSubmitResult
  RichText: ComponentType<HubSpotRichTextProps>
}

export function DefaultGroup({columns, children}: HubSpotGroupProps) {
  return (
    <div data-hubspot-row="" data-columns={columns}>
      {children}
    </div>
  )
}

/**
 * Draws HubSpot's HTML as it is, as HubSpot's own embed does. It comes from the account's form
 * editor; a site that wants it cleaned passes its own `RichText`.
 */
export function DefaultRichText({html, kind}: HubSpotRichTextProps) {
  return <div data-hubspot-text={kind} dangerouslySetInnerHTML={{__html: html}} />
}

function Box({
  id,
  name,
  label,
  required,
  error,
  RichText,
}: {
  id: string
  name: string
  label: string
  required: boolean
  error?: string
  RichText: ComponentType<HubSpotRichTextProps>
}) {
  return (
    <div data-hubspot-consent-box="">
      <input
        id={id}
        name={name}
        type="checkbox"
        value="true"
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <label htmlFor={id}>
        <RichText html={label} kind="consent" />
      </label>
      {error && (
        <p id={`${id}-error`} data-hubspot-error="">
          {error}
        </p>
      )}
    </div>
  )
}

/** The form's consent: its texts, its subscription boxes and, when HubSpot asks, a box to agree. */
export function DefaultConsent({consent, errors, idPrefix, RichText}: HubSpotConsentProps) {
  if (consent.type === 'none') return null
  if (consent.type === 'legitimateInterest')
    return consent.privacyText ? (
      <div data-hubspot-consent="">
        <RichText html={consent.privacyText} kind="consent" />
      </div>
    ) : null

  return (
    <div data-hubspot-consent="">
      {consent.communicationText && <RichText html={consent.communicationText} kind="consent" />}
      {consent.checkboxes.map((box) => {
        const name = subscriptionInput(box.subscriptionTypeId)
        return (
          <Box
            key={box._key}
            id={`${idPrefix}-${box._key}`}
            name={name}
            label={box.label}
            required={box.required}
            error={errors[name]}
            RichText={RichText}
          />
        )
      })}
      {consent.processText && <RichText html={consent.processText} kind="consent" />}
      {consent.type === 'explicit' && consent.processLabel && (
        <Box
          id={`${idPrefix}-consent`}
          name={CONSENT_INPUT}
          label={consent.processLabel}
          required
          error={errors[CONSENT_INPUT]}
          RichText={RichText}
        />
      )}
      {consent.type === 'explicit' && consent.footerText && (
        <RichText html={consent.footerText} kind="consent" />
      )}
      {consent.privacyText && <RichText html={consent.privacyText} kind="consent" />}
    </div>
  )
}

export function DefaultSubmit({text, pending}: HubSpotSubmitProps) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined}>
      {text}
    </button>
  )
}

/** The thank-you once sent, or a line saying what went wrong. */
export function DefaultStatus({result, RichText}: HubSpotStatusProps) {
  if (result.status === 'sent')
    return (
      // A thank-you holds block HTML, which `<output>` can't.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      <div data-hubspot-status="sent" role="status">
        {result.message ? (
          <RichText html={result.message} kind="message" />
        ) : (
          <p>Thanks, it’s sent.</p>
        )}
      </div>
    )
  return (
    <p data-hubspot-status={result.status} role="alert">
      {result.status === 'invalid'
        ? 'Please check the fields marked.'
        : 'It didn’t go through. Please try again in a moment.'}
    </p>
  )
}

/** A field people leave empty and bots fill. Off-screen, out of the tab order, and unlabelled for assistive tech. */
export function Honeypot({name}: {name: string}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-10000px',
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
      }}
    >
      <label>
        Leave this empty
        <input type="text" name={name} tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  )
}

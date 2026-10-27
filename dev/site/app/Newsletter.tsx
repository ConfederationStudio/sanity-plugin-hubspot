'use client'

import {useState, type SubmitEvent} from 'react'
import {sendHubSpotForm, type HubSpotFormDefinition} from 'sanity-plugin-hubspot/react'

/**
 * A site's own one-field form, sent to the HubSpot form an editor picked for it. The field's
 * `options.draws: ['email']` has the picker say which forms take an email alone.
 */
export function Newsletter({form}: {form: HubSpotFormDefinition}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'invalid' | 'failed'>('idle')

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    const data = new FormData(event.currentTarget)
    data.set('hubspot:form', form.formId)
    const result = await sendHubSpotForm(form, data)
    setState(result.status)
  }

  if (state === 'sent') return <output>You’re on the list.</output>
  return (
    <form onSubmit={onSubmit} noValidate data-newsletter="">
      <label htmlFor="newsletter-email">Email</label>
      <input id="newsletter-email" name="email" type="email" autoComplete="email" />
      <button type="submit" disabled={state === 'sending'}>
        Subscribe
      </button>
      {state === 'invalid' && <p role="alert">Please check your email address.</p>}
      {state === 'failed' && <p role="alert">It didn’t go through. Please try again.</p>}
    </form>
  )
}

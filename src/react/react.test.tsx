// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {HubSpotFormDefinition} from '../core/model'
import {parseForm} from '../core/parse'
import {SAMPLE_FORMS} from '../core/sample'
import {hubspotWindow} from './globals'
import {HubSpotForm} from './HubSpotForm'
import {sendHubSpotForm} from './send'
import {createTracker} from './tracker'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const contact = SAMPLE_FORMS[0]
function newsletter(): HubSpotFormDefinition {
  const form = parseForm({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Newsletter',
    fieldGroups: [
      {
        groupType: 'default_group',
        fields: [{fieldType: 'email', name: 'email', label: 'Email', required: true}],
      },
      {
        groupType: 'default_group',
        fields: [{fieldType: 'single_line_text', name: 'utm_source', hidden: true}],
      },
    ],
  })
  if (!form) throw new Error('The newsletter form didn’t parse')
  return {...form, portalId: '4242'}
}
const live = newsletter()

describe('HubSpotForm', () => {
  it('draws the form’s fields, consent and button', () => {
    render(<HubSpotForm form={contact} />)
    expect(screen.getByLabelText(/First name/)).toBeTruthy()
    expect(screen.getByLabelText(/Email/)).toBeTruthy()
    expect(screen.getByRole('button', {name: 'Send'})).toBeTruthy()
    expect(screen.getByText('I agree to my details being stored.')).toBeTruthy()
    expect(screen.queryByLabelText(/Company/)).toBeNull()
  })

  it('shows a follow-up once its condition holds', () => {
    render(<HubSpotForm form={contact} />)
    fireEvent.change(screen.getByLabelText(/What is it about/), {target: {value: 'sales'}})
    expect(screen.getByLabelText(/Company/)).toBeTruthy()
  })

  it('marks what’s missing and sends nothing', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<HubSpotForm form={contact} />)
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))
    await waitFor(() =>
      expect(screen.getAllByText('Please fill this in.').length).toBeGreaterThan(0),
    )
    expect(screen.getByLabelText(/First name/).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Please tick this box.')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends to HubSpot from the browser, filling hidden fields from the address', async () => {
    window.history.replaceState(null, '', '/join?utm_source=newsletter')
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({inlineMessage: '<p>Welcome aboard</p>'}),
    )
    vi.stubGlobal('fetch', fetch)
    const onSent = vi.fn()
    render(<HubSpotForm form={live} onSent={onSent} />)
    fireEvent.change(screen.getByLabelText(/Email/), {target: {value: 'ada@example.com'}})
    fireEvent.click(screen.getByRole('button', {name: 'Submit'}))
    await waitFor(() => expect(screen.getByText('Welcome aboard')).toBeTruthy())

    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe(
      `https://api.hsforms.com/submissions/v3/integration/submit/4242/${live.formId}`,
    )
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')).toMatchObject({
      fields: [
        {name: 'email', value: 'ada@example.com'},
        {name: 'utm_source', value: 'newsletter'},
      ],
      context: {pageUri: 'http://localhost:3000/join?utm_source=newsletter'},
    })
    expect(onSent).toHaveBeenCalledOnce()
  })

  it('sends through a server action when given one', async () => {
    const action = vi.fn(async (_data: FormData) => ({
      status: 'invalid' as const,
      errors: {email: 'blocked' as const},
    }))
    render(<HubSpotForm form={live} action={action} />)
    fireEvent.change(screen.getByLabelText(/Email/), {target: {value: 'ada@example.com'}})
    fireEvent.click(screen.getByRole('button', {name: 'Submit'}))
    await waitFor(() => expect(screen.getByText('Please use another email address.')).toBeTruthy())
    expect(action.mock.calls[0]?.[0]).toBeInstanceOf(FormData)
  })

  it('takes the site’s own components', () => {
    render(
      <HubSpotForm
        form={live}
        fieldComponents={{
          email: ({field, id}) => <input id={id} name={field.name} aria-label="Custom email" />,
        }}
        components={{Submit: ({text}) => <button type="submit">{text.toUpperCase()}</button>}}
      />,
    )
    expect(screen.getByLabelText('Custom email')).toBeTruthy()
    expect(screen.getByRole('button', {name: 'SUBMIT'})).toBeTruthy()
  })

  it('leaves a form it can’t draw to HubSpot’s embed', () => {
    const {container} = render(<HubSpotForm form={{...live, drawable: false, embed: 'v4'}} />)
    expect(container.querySelector('.hs-form-frame')?.getAttribute('data-form-id')).toBe(
      live.formId,
    )
  })
})

describe('sendHubSpotForm', () => {
  it('sends the page a site’s own form was on', async () => {
    window.history.replaceState(null, '', '/news')
    document.title = 'News'
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({inlineMessage: '<p>You’re on the list.</p>'}),
    )
    vi.stubGlobal('fetch', fetch)
    const data = new FormData()
    data.set('email', 'ada@example.com')
    await expect(sendHubSpotForm(live, data)).resolves.toMatchObject({status: 'sent'})

    const [, init] = fetch.mock.calls[0] ?? []
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')).toMatchObject({
      context: {pageUri: 'http://localhost:3000/news', pageName: 'News'},
    })
  })
})

describe('createTracker', () => {
  it('queues HubSpot’s calls and loads its script once', () => {
    const tracker = createTracker({portalId: '4242', region: 'eu1'})
    tracker.setContentType('blog-post')
    tracker.load()
    tracker.load()
    tracker.pageView('/news', 'blog-post')
    tracker.revoke()
    expect(document.querySelectorAll('#hs-script-loader')).toHaveLength(1)
    expect(document.querySelector<HTMLScriptElement>('#hs-script-loader')?.src).toBe(
      'https://js-eu1.hs-scripts.com/4242.js',
    )
    expect(hubspotWindow()._hsq).toEqual([
      ['setContentType', 'blog-post'],
      ['setPath', '/news'],
      ['setContentType', 'blog-post'],
      ['trackPageView'],
      ['doNotTrack'],
    ])
    expect(hubspotWindow()._hsp).toEqual([['revokeCookieConsent']])
  })
})

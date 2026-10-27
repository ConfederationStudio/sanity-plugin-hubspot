import {beforeEach, describe, expect, it} from 'vitest'

import type {RawForm} from '../core/hubspot'
import {SAMPLE_FORMS} from '../core/sample'
import {sealedFor} from './connection'
import {submissionContext} from './context'
import {hubspotRoutes, type HubSpotRoutesOptions} from './routes'
import {clearEditorCache} from './sanity'
import {seal, unseal} from './seal'
import {submitForm} from './submit'

const PROJECT = 'abc123'
const STUDIO = 'https://example.sanity.studio'
const SECRET = 'a-secret-key-that-is-long-enough-to-seal'
const FORM_A = '11111111-1111-4111-8111-111111111111'
const FORM_B = '22222222-2222-4222-8222-222222222222'

const rawForm = (id: string, name: string): RawForm => ({
  id,
  name,
  fieldGroups: [
    {
      groupType: 'default_group',
      fields: [{fieldType: 'email', name: 'email', label: 'Email', required: true}],
    },
  ],
})

interface Network {
  calls: string[]
  members: Record<string, string[]>
  settings: Record<string, unknown> | null
  submit: (url: string, init?: RequestInit) => Response
}

function network(): Network & {fetch: typeof fetch} {
  const net: Network = {
    calls: [],
    members: {'editor-token': ['editor'], 'admin-token': ['administrator'], 'stranger-token': []},
    settings: null,
    submit: () => Response.json({inlineMessage: '<p>Thanks</p>'}),
  }
  const json = (body: unknown, status = 200) => Response.json(body, {status})
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    net.calls.push(url)
    const auth = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? ''
    if (url.endsWith('/users/me')) {
      const roles = net.members[auth]
      return roles
        ? json({id: `user-${auth}`, roles: roles.map((name) => ({name}))})
        : json({}, 401)
    }
    if (url.includes('/data/doc/')) return json({documents: net.settings ? [net.settings] : []})
    if (url.startsWith('https://api.hsforms.com/')) return net.submit(url, init)
    if (auth.startsWith('bad-key')) return json({message: 'nope'}, 401)
    if (url.endsWith('/account-info/v3/details'))
      return json({portalId: 4242, uiDomain: 'app-eu1.hubspot.com', dataHostingLocation: 'eu1'})
    if (url.includes('/marketing/v3/forms?')) {
      const after = new URL(url).searchParams.get('after')
      return after
        ? json({results: [rawForm(FORM_B, 'Second')]})
        : json({results: [rawForm(FORM_A, 'First')], paging: {next: {after: 'page2'}}})
    }
    if (url.includes(`/marketing/v3/forms/${FORM_A}`)) return json(rawForm(FORM_A, 'First'))
    if (url.includes('/marketing/v3/forms/')) return json({message: 'not found'}, 404)
    return json({}, 500)
  }
  return Object.assign(net, {fetch: fetcher})
}

function setup(overrides: Partial<HubSpotRoutesOptions> = {}) {
  const net = network()
  const routes = hubspotRoutes({
    projectId: PROJECT,
    studioOrigins: [STUDIO],
    fetch: net.fetch,
    ...overrides,
  })
  const call = async (
    method: 'GET' | 'POST' | 'OPTIONS',
    path: string,
    init: {token?: string; origin?: string | null; body?: unknown} = {},
  ) => {
    const headers = new Headers()
    if (init.origin !== null) headers.set('origin', init.origin ?? STUDIO)
    if (init.token) headers.set('authorization', `Bearer ${init.token}`)
    if (init.body !== undefined) headers.set('content-type', 'application/json')
    const request = new Request(`https://site.test/api/hubspot${path}`, {
      method,
      headers,
      ...(init.body !== undefined && {body: JSON.stringify(init.body)}),
    })
    const response = await routes[method](request)
    return {
      status: response.status,
      headers: response.headers,
      body: response.status === 204 ? null : await response.json(),
    }
  }
  return {net, call}
}

beforeEach(() => clearEditorCache())

describe('hubspotRoutes', () => {
  it('answers the Studio’s origins only', async () => {
    const {call} = setup({token: 'env-key'})
    expect(
      (await call('GET', '/connection', {token: 'editor-token', origin: 'https://evil.test'}))
        .status,
    ).toBe(403)
    const preflight = await call('OPTIONS', '/forms')
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(STUDIO)
  })

  it('answers members of the project only', async () => {
    const {call} = setup({token: 'env-key'})
    expect(await call('GET', '/forms')).toMatchObject({status: 401, body: {error: 'signed-out'}})
    expect(await call('GET', '/forms', {token: 'unknown'})).toMatchObject({status: 401})
    expect(await call('GET', '/forms', {token: 'stranger-token'})).toMatchObject({
      status: 403,
      body: {error: 'not-member'},
    })
  })

  it('reports the connection', async () => {
    const {call} = setup({token: 'env-key'})
    expect((await call('GET', '/connection', {token: 'admin-token'})).body).toEqual({
      status: 'connected',
      source: 'environment',
      account: {portalId: '4242', region: 'eu1', uiDomain: 'app-eu1.hubspot.com'},
      canSaveKey: false,
    })
    expect((await setup().call('GET', '/connection', {token: 'admin-token'})).body).toEqual({
      status: 'not-connected',
      canSaveKey: false,
    })
  })

  it('reads every form, page by page, with the account written in', async () => {
    const {call} = setup({token: 'env-key'})
    const {body} = await call('GET', '/forms', {token: 'editor-token'})
    expect(body.forms.map((form: {name: string}) => form.name)).toEqual(['First', 'Second'])
    expect(body.forms[0]).toMatchObject({formId: FORM_A, portalId: '4242', region: 'eu1'})
  })

  it('reads one form, and says when HubSpot has none', async () => {
    const {call} = setup({token: 'env-key'})
    expect((await call('GET', `/forms/${FORM_A}`, {token: 'editor-token'})).body.form.name).toBe(
      'First',
    )
    expect((await call('GET', `/forms/${FORM_B}`, {token: 'editor-token'})).body).toEqual({
      form: null,
    })
    expect((await call('GET', '/forms/not-an-id', {token: 'editor-token'})).status).toBe(404)
  })

  it('seals a pasted key for administrators, and then uses it', async () => {
    const {net, call} = setup({secretKey: SECRET})
    expect(
      await call('POST', '/connection', {token: 'editor-token', body: {key: 'pat-eu1-good-key'}}),
    ).toMatchObject({
      status: 403,
      body: {error: 'forbidden-role'},
    })
    expect(
      await call('POST', '/connection', {
        token: 'admin-token',
        body: {key: 'bad-key-of-full-length'},
      }),
    ).toMatchObject({
      status: 409,
      body: {error: 'key-rejected'},
    })
    const saved = await call('POST', '/connection', {
      token: 'admin-token',
      body: {key: 'pat-eu1-good-key'},
    })
    expect(saved.status).toBe(200)
    expect(saved.body.sealedKey).not.toContain('pat-eu1')

    net.settings = {_id: 'hubspot.settings', sealedKey: saved.body.sealedKey}
    expect((await call('GET', '/connection', {token: 'admin-token'})).body).toMatchObject({
      status: 'connected',
      source: 'studio',
      canSaveKey: true,
    })
  })

  it('answers with samples in stand-in mode and calls HubSpot never', async () => {
    const {net, call} = setup({standIn: true})
    expect((await call('GET', '/connection', {token: 'editor-token'})).body).toEqual({
      status: 'stand-in',
    })
    expect((await call('GET', '/forms', {token: 'editor-token'})).body.forms).toHaveLength(
      SAMPLE_FORMS.length,
    )
    expect(net.calls.some((url) => url.includes('hubapi'))).toBe(false)
  })

  it('refuses a short secret key', () => {
    expect(() =>
      hubspotRoutes({projectId: PROJECT, studioOrigins: [STUDIO], secretKey: 'short'}),
    ).toThrow()
  })
})

describe('seal', () => {
  it('opens only with the same secret, in the same place', async () => {
    const place = sealedFor({projectId: PROJECT, dataset: 'production'})
    const sealed = await seal(SECRET, 'pat-na1-xyz', place)
    expect(await unseal(SECRET, sealed, place)).toBe('pat-na1-xyz')
    expect(await unseal(`${SECRET}!`, sealed, place)).toBeNull()
    expect(
      await unseal(SECRET, sealed, sealedFor({projectId: PROJECT, dataset: 'staging'})),
    ).toBeNull()
  })
})

describe('submitForm', () => {
  const form = {...SAMPLE_FORMS[1], formId: FORM_A, portalId: '4242'}
  const body = () => {
    const data = new FormData()
    data.set('email', 'ada@example.com')
    return data
  }

  it('sends through the secure endpoint, and falls back when HubSpot refuses the key', async () => {
    const net = network()
    const seen: string[] = []
    net.submit = (url) => {
      seen.push(url)
      return url.includes('/secure/')
        ? Response.json({}, {status: 401})
        : Response.json({inlineMessage: '<p>Thanks</p>'})
    }
    const result = await submitForm(form, body(), {token: 'service-key', fetch: net.fetch})
    expect(result).toEqual({status: 'sent', message: '<p>Thanks</p>'})
    expect(seen.map((url) => url.includes('/secure/'))).toEqual([true, false])
  })

  it('sends the visit HubSpot needs', async () => {
    const net = network()
    let sent: unknown
    net.submit = (_url, init) => {
      sent = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
      return Response.json({})
    }
    const headers = new Headers({
      'cookie': 'hubspotutk=0123456789abcdef0123456789abcdef',
      'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      'referer': 'https://site.test/news',
    })
    await submitForm(form, body(), {headers, fetch: net.fetch})
    expect(sent).toMatchObject({
      context: {
        hutk: '0123456789abcdef0123456789abcdef',
        ipAddress: '203.0.113.9',
        pageUri: 'https://site.test/news',
      },
    })
  })

  it('answers a bot as if it went, and sends nothing', async () => {
    const net = network()
    const data = body()
    data.set('hubspot:website', 'spam.example')
    expect((await submitForm(form, data, {fetch: net.fetch})).status).toBe('sent')
    expect(net.calls).toEqual([])
  })

  it('reads the context from headers it trusts', () => {
    expect(submissionContext(new Headers({'x-forwarded-for': 'not an ip'}))).toEqual({})
  })
})

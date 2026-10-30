import {isFormId} from '../core/ids'
import type {HubSpotFormDefinition} from '../core/model'
import {parseForm} from '../core/parse'
import type {
  HubSpotConnection,
  HubSpotFormReply,
  HubSpotFormsReply,
  HubSpotRouteError,
  HubSpotRouteErrorCode,
  HubSpotSaveKeyReply,
} from '../core/route'
import {SAMPLE_FORMS} from '../core/sample'
import {resolveKey, sealedFor, type KeyOptions} from './connection'
import {corsHeaders, originSet} from './cors'
import {globalFetch, reply} from './http'
import {cachedAccount, HubSpotApiError, hubspotApi} from './hubspot-api'
import {isDataset, isProjectId, SanityApiError, sanityEditor, type SanityEditor} from './sanity'
import {MIN_SECRET_LENGTH, seal} from './seal'

export interface HubSpotRoutesOptions {
  /** The Sanity project the Studio belongs to. Only its members get an answer. */
  projectId: string
  /** The dataset the Studio writes to. Default: `production`. */
  dataset?: string
  /**
   * The origins the Studio runs on, such as `https://example.sanity.studio` and, while
   * developing, `http://localhost:3333`. A Studio on the site's own domain needs none.
   */
  studioOrigins: readonly string[]
  /** A HubSpot Service Key, from the site's environment (`HUBSPOT_TOKEN`). Wins over a pasted one. */
  token?: string
  /**
   * Seals a key pasted in the Studio (`HUBSPOT_SECRET_KEY`), at least 32 characters. Without it
   * the Studio can't take a key, and the route uses `token` only.
   */
  secretKey?: string
  /** The roles that may paste or replace the key. Default: `administrator`. */
  saveRoles?: readonly string[]
  /** Answer with sample forms and call no one: for a Studio with no HubSpot account yet. */
  standIn?: boolean
  /** Stands in for the global `fetch`, in tests. */
  fetch?: typeof fetch
}

/**
 * The route's handlers, for a catch-all route such as Next.js's `app/api/hubspot/[...path]/route.ts`.
 * Plain functions, so they can be taken apart: `export const {GET, POST, OPTIONS} = hubspotRoutes(…)`.
 */
export interface HubSpotRoutes {
  GET: (request: Request) => Promise<Response>
  POST: (request: Request) => Promise<Response>
  OPTIONS: (request: Request) => Promise<Response>
}

type Route = {name: 'connection'} | {name: 'forms'} | {name: 'form'; formId: string}

/** The route reads the end of the path only, so it works under whatever path the site mounts it. */
function match(pathname: string): Route | null {
  const found = /\/(connection|forms)(?:\/([^/]+))?\/?$/.exec(pathname)
  if (!found) return null
  const [, name, id] = found
  if (name === 'connection') return id === undefined ? {name: 'connection'} : null
  if (id === undefined) return {name: 'forms'}
  return isFormId(id) ? {name: 'form', formId: id.toLowerCase()} : null
}

const STATUS: Record<HubSpotRouteErrorCode, number> = {
  'signed-out': 401,
  'not-member': 403,
  'forbidden-origin': 403,
  'forbidden-role': 403,
  'no-secret-key': 409,
  'key-from-environment': 409,
  'not-connected': 409,
  'key-rejected': 409,
  'key-lacks-scope': 409,
  'rate-limited': 429,
  'hubspot-failed': 502,
  'sanity-failed': 502,
  'bad-request': 400,
  'not-found': 404,
}

class RouteError extends Error {
  readonly code: HubSpotRouteErrorCode
  constructor(code: HubSpotRouteErrorCode) {
    super(code)
    this.code = code
  }
}

const SERVICE_KEY = /^[A-Za-z0-9_-]{10,512}$/

/** What HubSpot made of a key it refused, for the Studio to explain; undefined for other errors. */
function keyFailure(error: unknown): 'key-rejected' | 'key-lacks-scope' | undefined {
  return error instanceof HubSpotApiError &&
    (error.failure === 'key-rejected' || error.failure === 'key-lacks-scope')
    ? error.failure
    : undefined
}

/**
 * The site's HubSpot route: the Studio's only way to HubSpot. It answers the Studio's origins,
 * and only a member of the project, checked with Sanity on every new token.
 *
 * - `GET …/connection`: the key's state, the account, and whether this editor may paste a key.
 * - `POST …/connection` with `{key}`: checks a pasted key with HubSpot and seals it.
 * - `GET …/forms`: every form, as the plugin's model.
 * - `GET …/forms/:formId`: one form, or null when HubSpot no longer has it.
 */
export function hubspotRoutes(options: HubSpotRoutesOptions): HubSpotRoutes {
  const dataset = options.dataset ?? 'production'
  if (!isProjectId(options.projectId))
    throw new TypeError('hubspotRoutes: projectId is not a Sanity project id')
  if (!isDataset(dataset))
    throw new TypeError('hubspotRoutes: dataset is not a Sanity dataset name')
  if (options.secretKey !== undefined && options.secretKey.length < MIN_SECRET_LENGTH)
    throw new TypeError(`hubspotRoutes: secretKey must be at least ${MIN_SECRET_LENGTH} characters`)

  const origins = originSet(options.studioOrigins)
  const saveRoles = new Set(options.saveRoles ?? ['administrator'])
  const fetcher = options.fetch ?? globalFetch
  const keys: KeyOptions = {
    projectId: options.projectId,
    dataset,
    ...(options.token && {token: options.token}),
    ...(options.secretKey && {secretKey: options.secretKey}),
    fetch: fetcher,
  }
  const mayPaste = (editor: SanityEditor) =>
    Boolean(options.secretKey) && !options.token && editor.roles.some((role) => saveRoles.has(role))

  async function requireKey(sanityToken: string) {
    const found = await resolveKey(keys, sanityToken)
    if (found.status !== 'found') throw new RouteError('not-connected')
    const api = hubspotApi(found.key, fetcher)
    return {api, account: await cachedAccount(api, found.key)}
  }

  async function connection(editor: SanityEditor, sanityToken: string): Promise<HubSpotConnection> {
    if (options.standIn) return {status: 'stand-in'}
    const canSaveKey = mayPaste(editor)
    const found = await resolveKey(keys, sanityToken)
    if (found.status === 'none')
      return {status: 'not-connected', canSaveKey, ...(found.unreadable && {unreadable: true})}
    try {
      const account = await cachedAccount(hubspotApi(found.key, fetcher), found.key)
      return {status: 'connected', source: found.source, account, canSaveKey}
    } catch (error) {
      const failure = keyFailure(error)
      if (failure) return {status: failure, source: found.source, canSaveKey}
      throw error
    }
  }

  async function forms(sanityToken: string): Promise<HubSpotFormsReply> {
    if (options.standIn) return {forms: [...SAMPLE_FORMS]}
    const {api, account} = await requireKey(sanityToken)
    const raw = await api.forms()
    return {forms: raw.flatMap((form) => parseForm(form, account) ?? [])}
  }

  async function form(sanityToken: string, formId: string): Promise<HubSpotFormReply> {
    if (options.standIn)
      return {form: SAMPLE_FORMS.find((sample) => sample.formId === formId) ?? null}
    const {api, account} = await requireKey(sanityToken)
    const raw = await api.form(formId)
    const parsed: HubSpotFormDefinition | null = raw ? parseForm(raw, account) : null
    return {form: parsed}
  }

  async function saveKey(editor: SanityEditor, request: Request): Promise<HubSpotSaveKeyReply> {
    if (options.standIn) throw new RouteError('bad-request')
    if (options.token) throw new RouteError('key-from-environment')
    if (!options.secretKey) throw new RouteError('no-secret-key')
    if (!mayPaste(editor)) throw new RouteError('forbidden-role')
    const text = await request.text()
    const body: unknown = text.length < 2_000 ? JSON.parse(text) : null
    const key = typeof body === 'object' && body !== null && 'key' in body ? body.key : undefined
    if (typeof key !== 'string' || !SERVICE_KEY.test(key.trim()))
      throw new RouteError('bad-request')

    const api = hubspotApi(key.trim(), fetcher)
    try {
      const account = await api.account()
      await api.checkForms()
      return {sealedKey: await seal(options.secretKey, key.trim(), sealedFor(keys)), account}
    } catch (error) {
      const failure = keyFailure(error)
      if (failure) throw new RouteError(failure)
      throw error
    }
  }

  async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get('origin')
    // A browser names the origin on a POST from the site's own pages too, such as a Studio there.
    const own = origin === new URL(request.url).origin
    if (origin !== null && !own && !origins.has(origin))
      return reply(403, {error: 'forbidden-origin'} satisfies HubSpotRouteError, {vary: 'Origin'})
    const cors = corsHeaders(own ? null : origin)
    const fail = (code: HubSpotRouteErrorCode) =>
      reply(STATUS[code], {error: code} satisfies HubSpotRouteError, cors)

    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors})
    const route = match(new URL(request.url).pathname)
    if (!route || (request.method === 'POST' && route.name !== 'connection'))
      return fail('not-found')

    const sanityToken = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!sanityToken) return fail('signed-out')

    try {
      const editor = await sanityEditor(options.projectId, sanityToken, fetcher)
      if (!editor) return fail('signed-out')
      if (editor.roles.length === 0) return fail('not-member')

      let body: unknown
      if (route.name === 'connection')
        body =
          request.method === 'POST'
            ? await saveKey(editor, request)
            : await connection(editor, sanityToken)
      else if (route.name === 'forms') body = await forms(sanityToken)
      else body = await form(sanityToken, route.formId)
      return reply(200, body, cors)
    } catch (error) {
      if (error instanceof RouteError) return fail(error.code)
      if (error instanceof SyntaxError) return fail('bad-request')
      if (error instanceof HubSpotApiError) return fail(error.failure)
      if (error instanceof SanityApiError) return fail('sanity-failed')
      return fail('hubspot-failed')
    }
  }

  return {GET: handle, POST: handle, OPTIONS: handle}
}

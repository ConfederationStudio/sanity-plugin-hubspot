import {fingerprint, globalFetch} from './http'

/**
 * The two things the route asks Sanity: who a token belongs to, and what the settings document
 * holds. Plain HTTP calls on the project's own API host, so the server entry needs no client.
 */

const API_VERSION = 'v2025-02-19'
const TIMEOUT = 5_000
/** A token is asked about at most once a minute, so a Studio session isn't one call per request. */
const EDITOR_TTL = 60_000
const MAX_CACHED = 200

export const isProjectId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)

export const isDataset = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)

export class SanityApiError extends Error {
  constructor(status: number) {
    super(`Sanity answered ${status}`)
    this.name = 'SanityApiError'
  }
}

export interface SanityEditor {
  id: string
  /** The editor's role names in the project. Empty for someone who isn't a member. */
  roles: string[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const host = (projectId: string) => `https://${projectId}.api.sanity.io/${API_VERSION}`

const editors = new Map<string, {editor: SanityEditor | null; expires: number}>()

/**
 * Who a Sanity token belongs to, asked of `/users/me` on the project's host: null for a token
 * Sanity refuses. The token is used for that one question and never kept or logged.
 */
export async function sanityEditor(
  projectId: string,
  token: string,
  fetcher: typeof fetch = globalFetch,
): Promise<SanityEditor | null> {
  const id = `${projectId}:${await fingerprint(token)}`
  const cached = editors.get(id)
  if (cached && cached.expires > Date.now()) return cached.editor

  const response = await fetcher(`${host(projectId)}/users/me`, {
    headers: {authorization: `Bearer ${token}`, accept: 'application/json'},
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (response.status >= 500) throw new SanityApiError(response.status)
  const user: unknown = response.ok ? await response.json().catch(() => null) : null
  let editor: SanityEditor | null = null
  if (isObject(user) && typeof user.id === 'string' && user.id !== '') {
    const roles = (Array.isArray(user.roles) ? user.roles : [])
      .map((role: unknown) => (isObject(role) ? role.name : undefined))
      .filter((name): name is string => typeof name === 'string' && name !== '')
    if (roles.length === 0 && typeof user.role === 'string' && user.role !== '')
      roles.push(user.role)
    editor = {id: user.id, roles}
  }

  if (editors.size >= MAX_CACHED) editors.clear()
  editors.set(id, {editor, expires: Date.now() + EDITOR_TTL})
  return editor
}

/** One document by id, read with a token, or null when there is none. */
export async function sanityDocument(
  options: {projectId: string; dataset: string; token: string; fetch?: typeof fetch},
  documentId: string,
): Promise<Record<string, unknown> | null> {
  const fetcher = options.fetch ?? globalFetch
  const url = `${host(options.projectId)}/data/doc/${options.dataset}/${encodeURIComponent(documentId)}`
  const response = await fetcher(url, {
    headers: {authorization: `Bearer ${options.token}`, accept: 'application/json'},
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new SanityApiError(response.status)
  const body: unknown = await response.json().catch(() => null)
  const [document] = isObject(body) && Array.isArray(body.documents) ? body.documents : []
  return isObject(document) ? document : null
}

/** Forgets every cached answer about tokens. For tests. */
export function clearEditorCache(): void {
  editors.clear()
}

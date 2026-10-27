import {SETTINGS_ID} from '../core/ids'
import type {HubSpotKeySource} from '../core/route'
import {sanityDocument} from './sanity'
import {unseal} from './seal'

export interface KeyOptions {
  projectId: string
  dataset: string
  token?: string
  secretKey?: string
  fetch?: typeof fetch
}

export type ResolvedKey =
  | {status: 'found'; key: string; source: HubSpotKeySource}
  /** `unreadable`: a key is saved, but the site's secret key can't open it. */
  | {status: 'none'; unreadable?: boolean}

/** What a sealed key is bound to: it opens in this project and dataset only. */
export const sealedFor = (options: Pick<KeyOptions, 'projectId' | 'dataset'>): string =>
  `sanity-plugin-hubspot:${options.projectId}:${options.dataset}`

/**
 * The HubSpot key to call with: the environment's, else the one pasted in the Studio, opened.
 * Reading the pasted one takes a Sanity token, since the settings document is never served
 * without one: the editor's, for the Studio's calls.
 */
export async function resolveKey(options: KeyOptions, sanityToken?: string): Promise<ResolvedKey> {
  if (options.token) return {status: 'found', key: options.token, source: 'environment'}
  if (!options.secretKey || !sanityToken) return {status: 'none'}
  const settings = await sanityDocument(
    {
      projectId: options.projectId,
      dataset: options.dataset,
      token: sanityToken,
      fetch: options.fetch,
    },
    SETTINGS_ID,
  )
  const sealed = settings?.sealedKey
  if (typeof sealed !== 'string' || sealed === '') return {status: 'none'}
  const key = await unseal(options.secretKey, sealed, sealedFor(options))
  return key ? {status: 'found', key, source: 'studio'} : {status: 'none', unreadable: true}
}

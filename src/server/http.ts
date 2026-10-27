/**
 * The global `fetch`, called through a wrapper: some runtimes (Cloudflare's among them) refuse a
 * `fetch` taken off the global and called on its own.
 */
export const globalFetch: typeof fetch = (input, init) => fetch(input, init)

/** A secret's SHA-256 in hex, so a cache can tell secrets apart without holding them. */
export async function fingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A JSON answer nobody caches: an editor expects what HubSpot and the settings hold now. */
export function reply(status: number, body: unknown, headers?: HeadersInit): Response {
  const all = new Headers(headers)
  all.set('content-type', 'application/json; charset=utf-8')
  all.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), {status, headers: all})
}

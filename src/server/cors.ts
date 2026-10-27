/** The Studio's origins as written, each reduced to scheme, host and port. */
export function originSet(origins: readonly string[]): Set<string> {
  const set = new Set<string>()
  for (const origin of origins) {
    if (!URL.canParse(origin)) throw new TypeError(`Not an origin: ${origin}`)
    set.add(new URL(origin).origin)
  }
  return set
}

/**
 * The route's CORS headers. Only the Studio's origins may read its answers; a request without an
 * origin comes from the same site or from a server, and gets none.
 */
export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({vary: 'Origin'})
  if (origin) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
    headers.set('access-control-allow-headers', 'authorization, content-type')
    headers.set('access-control-max-age', '600')
  }
  return headers
}

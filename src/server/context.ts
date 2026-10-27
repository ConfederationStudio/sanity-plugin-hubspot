import {readHutk, type HubSpotContext} from '../core/submission'
import {isHttpUrl} from '../core/text'

/** Anything with a `get` for headers: `Request['headers']`, or Next.js's `headers()`. */
export interface HeadersLike {
  get(name: string): string | null
}

const IP = /^[0-9a-f.:]{3,45}$/i

/** The visitor's address, from the proxy headers hosts set. The first hop is the visitor. */
function visitorAddress(headers: HeadersLike): string | undefined {
  const candidates = [
    headers.get('x-forwarded-for')?.split(',')[0],
    headers.get('x-real-ip'),
    headers.get('cf-connecting-ip'),
  ]
  return (
    candidates.map((value) => value?.trim()).find((value) => value && IP.test(value)) ?? undefined
  )
}

/**
 * The visit a send came from, read off the request: HubSpot's tracking cookie, the visitor's
 * address and the page. The page the form posts wins over this one.
 */
export function submissionContext(headers: HeadersLike): HubSpotContext {
  const hutk = readHutk(headers.get('cookie'))
  const ipAddress = visitorAddress(headers)
  const referer = headers.get('referer')
  return {
    ...(hutk && {hutk}),
    ...(ipAddress && {ipAddress}),
    ...(referer && isHttpUrl(referer) && {pageUri: referer}),
  }
}

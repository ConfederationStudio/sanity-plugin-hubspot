/**
 * How HubSpot files a page view in its reports, sent with `_hsq.push(['setContentType', …])`.
 * Without one HubSpot guesses, and on a site it doesn't host it guesses `standard-page`.
 */
export const CONTENT_TYPES = [
  {value: 'standard-page', title: 'Website page'},
  {value: 'landing-page', title: 'Landing page'},
  {value: 'blog-post', title: 'Blog post'},
  {value: 'listing-page', title: 'Listing page'},
  {value: 'knowledge-article', title: 'Knowledge base article'},
] as const

export type HubSpotContentType = (typeof CONTENT_TYPES)[number]['value']

const VALUES: ReadonlySet<string> = new Set(CONTENT_TYPES.map((type) => type.value))

export const isContentType = (value: unknown): value is HubSpotContentType =>
  typeof value === 'string' && VALUES.has(value)

/**
 * A page's content type: the one an editor picked, else the one its document type is mapped to
 * in the plugin's `contentTypes` option, else none, which leaves it to HubSpot.
 */
export function resolveContentType(
  picked: unknown,
  documentType?: string,
  byDocumentType?: Readonly<Record<string, string>>,
): HubSpotContentType | undefined {
  if (isContentType(picked)) return picked
  const mapped = documentType ? byDocumentType?.[documentType] : undefined
  return isContentType(mapped) ? mapped : undefined
}

import {CONTENT_TYPES, isContentType, type HubSpotContentType} from '../../core/content-type'
import {PAGE_TYPE} from '../../core/ids'
import {publishedId, type Usage} from './rows'

/** As much of the Studio's schema as the overview reads. */
export interface SchemaLike {
  getTypeNames(): string[]
  get(name: string):
    | {
        title?: string
        type?: {name: string} | null
        fields?: readonly {name: string; type: {name: string}}[]
      }
    | undefined
}

/** A document type whose page views HubSpot files: mapped in the plugin's options, or with the field. */
export interface PageType {
  type: string
  title: string
  /** The `hubspot.page` field on it, where an editor overrides the type or hides chat. */
  field?: string
  /** What the plugin's `contentTypes` option maps the type to. */
  mapped?: HubSpotContentType
}

/**
 * The document types the tracking overview lists: those the `contentTypes` option maps, and those
 * with a `hubspot.page` field at their top level.
 */
export function pageTypes(
  schema: SchemaLike,
  contentTypes: Readonly<Record<string, string>> = {},
): PageType[] {
  const out: PageType[] = []
  const seen = new Set<string>()
  for (const name of schema.getTypeNames()) {
    const type = schema.get(name)
    if (type?.type?.name !== 'document') continue
    const field = type.fields?.find((one) => one.type.name === PAGE_TYPE)?.name
    const mapped = contentTypes[name]
    if (!field && !isContentType(mapped)) continue
    seen.add(name)
    out.push({
      type: name,
      title: type.title ?? name,
      ...(field && {field}),
      ...(isContentType(mapped) && {mapped}),
    })
  }
  // A mapped type the schema doesn't have is still listed, so a misspelt one can be seen.
  for (const [name, mapped] of Object.entries(contentTypes))
    if (!seen.has(name) && isContentType(mapped)) out.push({type: name, title: name, mapped})
  return out.toSorted((a, b) => a.title.localeCompare(b.title))
}

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const TYPE_NAME = /^[A-Za-z0-9_.-]+$/

/**
 * The query for the documents whose `hubspot.page` field says something: a content type of
 * their own, or to hide chat. None when no document type has the field. Names go into the query
 * as written, so only plain ones are taken.
 */
export function pagesQuery(types: readonly PageType[]): string | undefined {
  const fields = types.flatMap(({type, field}) =>
    field && FIELD_NAME.test(field) && TYPE_NAME.test(type) ? [{type, field}] : [],
  )
  if (fields.length === 0) return undefined
  const where = fields
    .map(
      ({type, field}) =>
        `(_type == "${type}" && (defined(${field}.contentType) || ${field}.hideChat == true))`,
    )
    .join(' || ')
  const pick = (key: string) =>
    `select(${fields.map(({type, field}) => `_type == "${type}" => ${field}.${key}`).join(', ')})`
  return `*[${where}][0...500]{_id, _type, "title": coalesce(title, name, heading, _id), "contentType": ${pick('contentType')}, "hideChat": ${pick('hideChat')}}`
}

/** A document as `pagesQuery` reads it. */
export interface PageFacts extends Usage {
  contentType?: string | null
  hideChat?: boolean | null
}

export interface TrackingOverview {
  /** Documents an editor gave a content type of their own. */
  overrides: (Usage & {contentType: HubSpotContentType})[]
  /** Documents that hide chat. */
  chatHidden: Usage[]
}

/** The documents that set something, a draft and its published document counted once. */
export function trackingOverview(pages: readonly PageFacts[]): TrackingOverview {
  const byId = new Map<string, PageFacts>()
  // The published document speaks for the page; a draft only where there is none.
  for (const page of pages.toSorted(
    (a, b) => Number(a._id !== publishedId(a._id)) - Number(b._id !== publishedId(b._id)),
  )) {
    const id = publishedId(page._id)
    if (!byId.has(id)) byId.set(id, {...page, _id: id})
  }
  const overview: TrackingOverview = {overrides: [], chatHidden: []}
  for (const {contentType, hideChat, ...usage} of byId.values()) {
    if (isContentType(contentType)) overview.overrides.push({...usage, contentType})
    if (hideChat === true) overview.chatHidden.push(usage)
  }
  return overview
}

export const contentTypeTitle = (value: HubSpotContentType | undefined): string =>
  CONTENT_TYPES.find((type) => type.value === value)?.title ?? 'HubSpot decides'

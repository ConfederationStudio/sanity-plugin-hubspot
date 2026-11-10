import type {HubSpotFormDefinition} from '../../core/model'
import {isCurrent, type CopyState} from '../copies'

/** A document a form is on. */
export interface Usage {
  _id: string
  _type: string
  title?: string
}

/** What the tab reads of each copy, with the documents that point at it. */
export interface CopyFacts extends CopyState {
  name?: string
  drawable?: boolean
  undrawable?: HubSpotFormDefinition['undrawable']
  progressive?: boolean
  syncedAt?: string
  usedOn: Usage[]
}

/** Every copy with the documents that use it. A draft and its published document count once. */
export const COPIES_QUERY = `*[_type == $type]{
  _id, formId, name, archived, drawable, undrawable, progressive, updatedAt, version, syncedAt,
  "usedOn": *[references(^._id)]{_id, _type, "title": coalesce(title, name, heading, _id)}
}`

/**
 * Whether the site has the form as HubSpot has it now. `none`: there is no copy, which only
 * matters once a document uses the form.
 */
export type CopyStatus = 'current' | 'outdated' | 'none'

/** One form in the tab's list: a form HubSpot lists, or a copy of one it no longer has. */
export interface FormRow {
  formId: string
  name: string
  /** The form as HubSpot lists it now. None for a form HubSpot no longer has. */
  form?: HubSpotFormDefinition
  archived: boolean
  drawable: boolean
  undrawable: HubSpotFormDefinition['undrawable']
  progressive: boolean
  /** When HubSpot last changed the form. */
  updatedAt?: string
  /** When the copy was last written. */
  syncedAt?: string
  copy: CopyStatus
  usedOn: Usage[]
  /** In use, and the site can't draw it as its editor expects. */
  attention: boolean
}

export const publishedId = (id: string): string => id.replace(/^(drafts|versions\.[^.]+)\./, '')

function dedupe(usage: readonly Usage[]): Usage[] {
  const seen = new Map<string, Usage>()
  for (const document of usage) {
    const id = publishedId(document._id)
    if (!seen.has(id)) seen.set(id, {...document, _id: id})
  }
  return [...seen.values()]
}

/**
 * The tab's rows: every form HubSpot lists, and the copies of forms it no longer lists. Forms
 * that need attention come first, then the most used; the rest follow by name.
 */
export function formRows(
  forms: readonly HubSpotFormDefinition[],
  copies: readonly CopyFacts[],
): FormRow[] {
  const byFormId = new Map(copies.map((copy) => [copy.formId, copy]))
  const listed = forms.map((form) => {
    const copy = byFormId.get(form.formId)
    const usedOn = dedupe(copy?.usedOn ?? [])
    const state: CopyStatus = copy ? (isCurrent(copy, form) ? 'current' : 'outdated') : 'none'
    const row: FormRow = {
      formId: form.formId,
      name: form.name,
      form,
      archived: false,
      drawable: form.drawable,
      undrawable: form.undrawable,
      progressive: form.progressive,
      copy: state,
      usedOn,
      attention: usedOn.length > 0 && (!form.drawable || state === 'none'),
    }
    if (form.updatedAt) row.updatedAt = form.updatedAt
    if (copy?.syncedAt) row.syncedAt = copy.syncedAt
    return row
  })
  const listedIds = new Set(forms.map((form) => form.formId))
  const gone = copies
    .filter((copy) => !listedIds.has(copy.formId))
    .map((copy) => {
      const usedOn = dedupe(copy.usedOn)
      // Unlisted, yet not marked archived: HubSpot still answers for it by id.
      const archived = copy.archived ?? true
      const drawable = copy.drawable ?? false
      const row: FormRow = {
        formId: copy.formId,
        name: copy.name ?? copy.formId,
        archived,
        drawable,
        undrawable: copy.undrawable ?? [],
        progressive: copy.progressive ?? false,
        copy: 'current',
        usedOn,
        attention: usedOn.length > 0 && (archived || !drawable),
      }
      if (copy.updatedAt) row.updatedAt = copy.updatedAt
      if (copy.syncedAt) row.syncedAt = copy.syncedAt
      return row
    })
  return [...listed, ...gone].toSorted(
    (a, b) =>
      Number(b.attention) - Number(a.attention) ||
      b.usedOn.length - a.usedOn.length ||
      a.name.localeCompare(b.name),
  )
}

export type FormFilter = 'in-use' | 'attention' | 'unused' | 'all'

export const FILTERS: readonly {value: FormFilter; title: string}[] = [
  {value: 'in-use', title: 'In use'},
  {value: 'attention', title: 'Needs attention'},
  {value: 'unused', title: 'Not used'},
  {value: 'all', title: 'All'},
]

const FILTER: Record<FormFilter, (row: FormRow) => boolean> = {
  'in-use': (row) => row.usedOn.length > 0,
  'attention': (row) => row.attention,
  'unused': (row) => row.usedOn.length === 0,
  'all': () => true,
}

export interface FormCounts extends Record<FormFilter, number> {
  /** Forms in use that the site draws itself. */
  drawn: number
}

export function countRows(rows: readonly FormRow[]): FormCounts {
  const count = (keep: (row: FormRow) => boolean) => rows.filter(keep).length
  return {
    'in-use': count(FILTER['in-use']),
    'attention': count(FILTER.attention),
    'unused': count(FILTER.unused),
    'all': rows.length,
    'drawn': count((row) => row.usedOn.length > 0 && row.drawable && !row.archived),
  }
}

/** An id is searched whole, and only from this many characters, so a digit doesn't match them all. */
const ID_SEARCH_FROM = 4

/**
 * The rows a filter keeps, narrowed by a search: every word must be in the form's name, or the
 * search as typed must be part of its id.
 */
export function filterRows(rows: readonly FormRow[], filter: FormFilter, query: string): FormRow[] {
  const typed = query.trim().toLowerCase()
  const words = typed.split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (!FILTER[filter](row)) return false
    if (words.length === 0) return true
    const name = row.name.toLowerCase()
    return (
      words.every((word) => name.includes(word)) ||
      (typed.length >= ID_SEARCH_FROM && row.formId.toLowerCase().includes(typed))
    )
  })
}

/** The filter the tab opens on: the forms in use, or every form while none is. */
export const firstFilter = (counts: FormCounts): FormFilter =>
  counts['in-use'] > 0 ? 'in-use' : 'all'

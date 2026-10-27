import type {HubSpotCondition, HubSpotFieldType} from './model'

/**
 * The follow-up conditions the site can judge: all of HubSpot's except its two date windows
 * (`within_time`, `within_time_reverse`). A form with any other is left to HubSpot's embed.
 */
export const SUPPORTED_OPERATORS: ReadonlySet<string> = new Set([
  'eq',
  'neq',
  'contains',
  'doesnt_contain',
  'str_starts_with',
  'str_ends_with',
  'lt',
  'lte',
  'gt',
  'gte',
  'between',
  'not_between',
  'set_any',
  'set_not_any',
  'set_all',
  'set_not_all',
  'set_eq',
  'set_neq',
  'is_not_empty',
])

/**
 * A field's answer as a list, the way conditions and the server read it: one value for most
 * fields, the ticked options for a set of checkboxes, and `true` or `false` for a single
 * checkbox, which always has an answer.
 */
export function answerOf(type: HubSpotFieldType, posted: readonly string[]): string[] {
  if (type === 'checkbox')
    return [posted.some((value) => value !== '' && value !== 'false') ? 'true' : 'false']
  const values = posted.map((value) => value.trim()).filter((value) => value !== '')
  return type === 'checkboxes' ? values : values.slice(0, 1)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A number from an answer or a condition. Dates become HubSpot's midnight-UTC milliseconds. */
function numeric(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return Number.NaN
  if (DATE.test(value)) return Date.parse(`${value}T00:00:00Z`)
  return Number(value)
}

const sameSet = (chosen: ReadonlySet<string>, listed: readonly string[]) =>
  chosen.size === new Set(listed).size && listed.every((value) => chosen.has(value))

/**
 * Whether a follow-up field shows, given its parent's answer. An unanswered parent shows none.
 * Text compares without regard to case; the set operators compare option values exactly.
 */
export function meetsCondition(when: HubSpotCondition, answer: readonly string[]): boolean {
  const first = answer[0]
  if (first === undefined) return false
  const text = first.toLowerCase()
  const target = (when.value ?? '').toLowerCase()
  const number = numeric(first)
  const limit = numeric(when.value)
  const low = numeric(when.rangeStart)
  const high = numeric(when.rangeEnd)
  const chosen = new Set(answer)
  const listed = when.values ?? []

  switch (when.operator) {
    case 'eq':
      return text === target
    case 'neq':
      return text !== target
    case 'contains':
      return text.includes(target)
    case 'doesnt_contain':
      return !text.includes(target)
    case 'str_starts_with':
      return text.startsWith(target)
    case 'str_ends_with':
      return text.endsWith(target)
    case 'lt':
      return number < limit
    case 'lte':
      return number <= limit
    case 'gt':
      return number > limit
    case 'gte':
      return number >= limit
    case 'between':
      return low <= number && number <= high
    case 'not_between':
      return [number, low, high].every(Number.isFinite) && (number < low || number > high)
    case 'set_any':
      return listed.some((value) => chosen.has(value))
    case 'set_not_any':
      return !listed.some((value) => chosen.has(value))
    case 'set_all':
      return listed.every((value) => chosen.has(value))
    case 'set_not_all':
      return !listed.every((value) => chosen.has(value))
    case 'set_eq':
      return sameSet(chosen, listed)
    case 'set_neq':
      return !sameSet(chosen, listed)
    case 'is_not_empty':
      return true
    default:
      return false
  }
}

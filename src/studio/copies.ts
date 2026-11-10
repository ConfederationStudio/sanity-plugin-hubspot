import {FORM_COPY_TYPE, FORM_TYPE, formCopyId} from '../core/ids'
import {
  MODEL_VERSION,
  type HubSpotField,
  type HubSpotFormDefinition,
  type HubSpotUndrawableReason,
} from '../core/model'
import type {RouteClient} from './route'

/** A form copy as stored: the form's definition, plus when it was copied and whether HubSpot still has it. */
export type HubSpotFormCopy = HubSpotFormDefinition & {
  _id: string
  _type: typeof FORM_COPY_TYPE
  archived: boolean
  syncedAt: string
}

/** What tells whether a copy holds its form as HubSpot has it now. */
export interface CopyState {
  _id: string
  formId: string
  archived?: boolean
  updatedAt?: string
  version?: number
}

/** The Sanity calls copies make, which the Studio's client answers. */
export interface CopyClient {
  fetch<R>(query: string, params: Record<string, unknown>): Promise<R>
  createOrReplace(document: HubSpotFormCopy): Promise<unknown>
  patch(id: string): {set(attributes: Record<string, unknown>): {commit(): Promise<unknown>}}
}

/** A `hubspot.form` field's value. */
export interface HubSpotFormValue {
  _type?: typeof FORM_TYPE
  formId?: string
  name?: string
  definition?: {_type: 'reference'; _ref: string; _weak: true}
}

/** Array items need a `_type` for the Studio to show them; the model leaves it out. */
function typedField(field: HubSpotField): HubSpotField & {_type: string} {
  return {
    ...field,
    _type: 'hubspot.formField',
    options: field.options.map((option) => Object.assign({_type: 'hubspot.formOption'}, option)),
    followUps: field.followUps.map((followUp) =>
      Object.assign({}, followUp, {
        _type: 'hubspot.formFollowUp',
        field: typedField(followUp.field),
      }),
    ),
  }
}

export function copyDocument(
  form: HubSpotFormDefinition,
  syncedAt = new Date().toISOString(),
): HubSpotFormCopy {
  const consent =
    form.consent.type === 'explicit' || form.consent.type === 'implicit'
      ? {
          ...form.consent,
          checkboxes: form.consent.checkboxes.map((box) =>
            Object.assign({_type: 'hubspot.formSubscription'}, box),
          ),
        }
      : form.consent
  return {
    ...form,
    _id: formCopyId(form.formId),
    _type: FORM_COPY_TYPE,
    groups: form.groups.map((group) =>
      Object.assign({}, group, {_type: 'hubspot.formGroup', fields: group.fields.map(typedField)}),
    ),
    consent,
    archived: false,
    syncedAt,
  }
}

/** Whether a copy holds its form as HubSpot has it now, in this version of the model. */
export const isCurrent = (
  copy: Omit<CopyState, '_id' | 'formId'>,
  form: Pick<HubSpotFormDefinition, 'updatedAt'>,
): boolean => !copy.archived && copy.updatedAt === form.updatedAt && copy.version === MODEL_VERSION

/** Writes a form's copy as the editor, replacing the last one. */
export async function writeCopy(client: CopyClient, form: HubSpotFormDefinition): Promise<void> {
  await client.createOrReplace(copyDocument(form))
}

/**
 * Brings a form's copy up to date as the editor. A current copy is left alone, so a role that
 * can't write documents can still pick a form that someone has copied. A refused write is
 * `stale` when the site still has an older copy to draw, and `missing` when it has none.
 */
export async function keepCopy(
  client: CopyClient,
  form: HubSpotFormDefinition,
): Promise<'current' | 'written' | 'stale' | 'missing'> {
  const copy = await client
    .fetch<CopyState | null>('*[_id == $id][0]{_id, formId, archived, updatedAt, version}', {
      id: formCopyId(form.formId),
    })
    .catch(() => null)
  if (copy && isCurrent(copy, form)) return 'current'
  try {
    await writeCopy(client, form)
    return 'written'
  } catch {
    return copy ? 'stale' : 'missing'
  }
}

/** Marks a copy archived when HubSpot no longer has its form. It is never deleted: pages still point at it. */
export async function markArchived(client: CopyClient, formId: string): Promise<void> {
  await client
    .patch(formCopyId(formId))
    .set({archived: true, syncedAt: new Date().toISOString()})
    .commit()
}

/** What a sync did to one form's copy. Copies it left alone aren't listed. */
export interface SyncChange {
  formId: string
  name?: string
  outcome: 'written' | 'archived' | 'failed'
}

export interface SyncResult {
  written: number
  archived: number
  failed: number
  /** Each copy the sync wrote, archived or couldn't write, for the tab to list. */
  changes: SyncChange[]
}

const COPY_REF = /"_ref":"(hubspot-form-[0-9a-f-]{36})"/g

/**
 * The forms documents point at that have no copy yet: picked by an editor whose role couldn't
 * write one, or set by a migration. Found through the documents that reference them, drafts
 * included, as the Studio's client reads them.
 */
async function uncopied(
  client: CopyClient,
  forms: HubSpotFormDefinition[],
  copies: CopyState[],
): Promise<HubSpotFormDefinition[]> {
  const copied = new Set(copies.map((copy) => copy._id))
  const byCopyId = new Map(forms.map((form) => [formCopyId(form.formId), form]))
  const missing = [...byCopyId.keys()].filter((id) => !copied.has(id))
  if (missing.length === 0) return []
  const documents = await client.fetch<unknown[]>('*[references($ids)]', {ids: missing})
  const referenced = new Set(
    Array.from(JSON.stringify(documents).matchAll(COPY_REF), (match) => match[1]),
  )
  return missing.flatMap((id) => (referenced.has(id) ? (byCopyId.get(id) ?? []) : []))
}

/**
 * Brings the copies up to date: a form in use with no copy gets one, a form HubSpot changed is
 * copied again, and one it no longer lists is asked for by id, then marked archived if HubSpot
 * has none. `all` copies every one.
 */
export async function syncCopies(
  client: CopyClient,
  route: Pick<RouteClient, 'form'>,
  forms: HubSpotFormDefinition[],
  copies: CopyState[],
  all: boolean,
): Promise<SyncResult> {
  const listed = new Map(forms.map((form) => [form.formId, form]))
  type Task = {
    formId: string
    name?: string
    run: () => Promise<'written' | 'archived' | 'kept'>
  }
  const firsts = (await uncopied(client, forms, copies)).map((form): Task => ({
    formId: form.formId,
    name: form.name,
    run: async () => {
      await writeCopy(client, form)
      return 'written'
    },
  }))
  const rest = copies.map((copy): Task => {
    const fresh = listed.get(copy.formId)
    return {
      formId: copy.formId,
      ...(fresh && {name: fresh.name}),
      run: async () => {
        if (fresh) {
          if (!all && isCurrent(copy, fresh)) return 'kept'
          await writeCopy(client, fresh)
          return 'written'
        }
        if (copy.archived && !all) return 'kept'
        const {form} = await route.form(copy.formId)
        if (form) {
          await writeCopy(client, form)
          return 'written'
        }
        if (copy.archived) return 'kept'
        await markArchived(client, copy.formId)
        return 'archived'
      },
    }
  })
  const tasks = [...firsts, ...rest]
  const outcomes = await Promise.allSettled(tasks.map((task) => task.run()))
  const result: SyncResult = {written: 0, archived: 0, failed: 0, changes: []}
  for (const [index, settled] of outcomes.entries()) {
    const outcome = settled.status === 'rejected' ? 'failed' : settled.value
    const task = tasks[index]
    if (outcome === 'kept' || !task) continue
    result[outcome]++
    result.changes.push({formId: task.formId, ...(task.name && {name: task.name}), outcome})
  }
  return result
}

/**
 * Reads one form from HubSpot again and rewrites its copy, as the editor. When HubSpot has no
 * such form any more, the copy is marked archived instead.
 */
export async function refreshCopy(
  client: CopyClient,
  route: Pick<RouteClient, 'form'>,
  formId: string,
): Promise<'written' | 'archived'> {
  const {form} = await route.form(formId)
  if (form) {
    await writeCopy(client, form)
    return 'written'
  }
  await markArchived(client, formId)
  return 'archived'
}

export function fieldValue(form: Pick<HubSpotFormDefinition, 'formId' | 'name'>): HubSpotFormValue {
  return {
    _type: FORM_TYPE,
    formId: form.formId,
    name: form.name,
    definition: {_type: 'reference', _ref: formCopyId(form.formId), _weak: true},
  }
}

export const UNDRAWABLE_TEXT: Record<HubSpotUndrawableReason, string> = {
  'recaptcha': 'reCAPTCHA is on, and HubSpot refuses sends from anywhere but its embed',
  'file': 'it asks for a file',
  'payment': 'it takes a payment',
  'unknown-field': 'it has a kind of field the plugin doesn’t know',
  'condition': 'a follow-up field depends on a date window',
  'consent-basis': 'its legitimate interest has the lawful basis “other”',
  'consent-subscriptions': 'its legitimate interest doesn’t name exactly one subscription',
}

export function formatDate(iso: string | undefined): string | undefined {
  if (!iso || Number.isNaN(Date.parse(iso))) return undefined
  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(iso))
}

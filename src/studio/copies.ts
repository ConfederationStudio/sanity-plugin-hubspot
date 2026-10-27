import type {SanityClient} from 'sanity'

import {FORM_COPY_TYPE, FORM_TYPE, formCopyId} from '../core/ids'
import type {HubSpotField, HubSpotFormDefinition, HubSpotUndrawableReason} from '../core/model'

/** A form copy as stored: the form's definition, plus when it was copied and whether HubSpot still has it. */
export type HubSpotFormCopy = HubSpotFormDefinition & {
  _id: string
  _type: typeof FORM_COPY_TYPE
  archived: boolean
  syncedAt: string
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

/** Writes a form's copy as the editor, replacing the last one. */
export async function writeCopy(client: SanityClient, form: HubSpotFormDefinition): Promise<void> {
  await client.createOrReplace(copyDocument(form))
}

/** Marks a copy archived when HubSpot no longer has its form. It is never deleted: pages still point at it. */
export async function markArchived(client: SanityClient, formId: string): Promise<void> {
  await client
    .patch(formCopyId(formId))
    .set({archived: true, syncedAt: new Date().toISOString()})
    .commit()
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

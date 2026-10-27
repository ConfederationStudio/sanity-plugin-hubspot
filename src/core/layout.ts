import {answerOf, meetsCondition} from './conditions'
import type {HubSpotField, HubSpotFieldType, HubSpotFormDefinition, HubSpotOption} from './model'
import {inputName} from './names'

/** What the visitor has entered so far, by input name. A field not in it keeps its default. */
export type HubSpotAnswers = Readonly<Record<string, readonly string[]>>

/** A field as a renderer draws it. */
export interface HubSpotFieldView {
  /** Unique within the form, for React keys and element ids. */
  key: string
  /** What the input posts under. */
  name: string
  /** The CRM property the answer goes to. */
  property: string
  type: HubSpotFieldType
  /** Plain text. */
  label: string
  /** When false, draw the label for screen readers only. */
  hasLabel: boolean
  required: boolean
  placeholder?: string
  /** HubSpot's HTML. */
  description?: string
  options: HubSpotOption[]
  defaultValues: string[]
}

export type HubSpotFormPart =
  | {kind: 'text'; key: string; html: string}
  | {kind: 'row'; key: string; fields: HubSpotFieldView[]}
  | {kind: 'hidden'; key: string; name: string; value: string}

/** A field's answer: what the visitor entered, else its default. */
export function currentAnswer(field: HubSpotField, answers: HubSpotAnswers): string[] {
  return answerOf(field.type, answers[inputName(field)] ?? field.defaultValues)
}

/** The follow-ups of a field that show for its current answer. */
export function shownFollowUps(field: HubSpotField, answers: HubSpotAnswers): HubSpotField[] {
  if (field.followUps.length === 0) return []
  const answer = currentAnswer(field, answers)
  return field.followUps
    .filter((followUp) => meetsCondition(followUp.when, answer))
    .map((followUp) => followUp.field)
}

/** Every field that takes part in a send now: visible or hidden, follow-ups that show included. */
export function activeFields(form: HubSpotFormDefinition, answers: HubSpotAnswers): HubSpotField[] {
  const out: HubSpotField[] = []
  const walk = (field: HubSpotField) => {
    out.push(field)
    for (const followUp of shownFollowUps(field, answers)) walk(followUp)
  }
  for (const group of form.groups) for (const field of group.fields) walk(field)
  return out
}

function view(field: HubSpotField, key: string): HubSpotFieldView {
  return {
    key,
    name: inputName(field),
    property: field.name,
    type: field.type,
    label: field.label,
    hasLabel: field.hasLabel,
    required: field.required,
    ...(field.placeholder && {placeholder: field.placeholder}),
    ...(field.description && {description: field.description}),
    options: field.options,
    defaultValues: field.defaultValues,
  }
}

/**
 * The form as parts to draw, in order: each group's text, then its visible fields as one row,
 * then the follow-ups that show, a row each, under the row that asked for them. Hidden fields
 * come out as hidden inputs holding their default.
 */
export function layoutForm(
  form: HubSpotFormDefinition,
  answers: HubSpotAnswers = {},
): HubSpotFormPart[] {
  const parts: HubSpotFormPart[] = []
  const hidden = (field: HubSpotField, key: string) =>
    parts.push({kind: 'hidden', key, name: inputName(field), value: field.defaultValues.join(';')})
  const followUps = (field: HubSpotField, key: string) => {
    for (const [index, followUp] of shownFollowUps(field, answers).entries()) {
      const followUpKey = `${key}-${index}`
      if (followUp.hidden) hidden(followUp, followUpKey)
      else parts.push({kind: 'row', key: followUpKey, fields: [view(followUp, followUpKey)]})
      followUps(followUp, followUpKey)
    }
  }

  for (const group of form.groups) {
    if (group.text) parts.push({kind: 'text', key: `${group._key}-text`, html: group.text})
    const visible = group.fields.filter((field) => !field.hidden)
    if (visible.length > 0)
      parts.push({
        kind: 'row',
        key: group._key,
        fields: visible.map((field) => view(field, `${group._key}-${field._key}`)),
      })
    for (const field of group.fields) {
      const key = `${group._key}-${field._key}`
      if (field.hidden) hidden(field, key)
      followUps(field, key)
    }
  }
  return parts
}

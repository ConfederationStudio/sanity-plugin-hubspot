import {EnvelopeIcon} from '@sanity/icons/Envelope'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {FORM_COPY_TYPE} from '../../core/ids'
import {isSampleFormId} from '../../core/sample'

/**
 * The form copy and the objects inside it. The Studio writes a copy whenever an editor picks or
 * refreshes a form, and nobody edits one, so every field is read-only. The document holds the
 * plugin's form model as is, so `definition->` in a page's query is ready for `<HubSpotForm>`.
 */

const text = (name: string, title?: string) =>
  defineField({name, ...(title && {title}), type: 'string', readOnly: true})
const html = (name: string, title?: string) =>
  defineField({name, ...(title && {title}), type: 'text', rows: 3, readOnly: true})
const flag = (name: string, title?: string) =>
  defineField({name, ...(title && {title}), type: 'boolean', readOnly: true})
const list = (name: string, of: 'string' | 'number', title?: string) =>
  defineField({
    name,
    ...(title && {title}),
    type: 'array',
    of: [defineArrayMember({type: of})],
    readOnly: true,
  })

const option = defineType({
  name: 'hubspot.formOption',
  title: 'Option',
  type: 'object',
  readOnly: true,
  fields: [text('value'), text('label'), text('description')],
  preview: {select: {title: 'label', subtitle: 'value'}},
})

const condition = defineType({
  name: 'hubspot.formCondition',
  title: 'Shows when',
  type: 'object',
  readOnly: true,
  fields: [
    text('operator'),
    text('value'),
    list('values', 'string'),
    text('rangeStart'),
    text('rangeEnd'),
  ],
})

const field = defineType({
  name: 'hubspot.formField',
  title: 'Field',
  type: 'object',
  readOnly: true,
  fields: [
    text('label'),
    text('name', 'Property'),
    text('type', 'Drawn as'),
    text('hubspotType', 'HubSpot field type'),
    text('objectTypeId', 'Object'),
    flag('hasLabel', 'Has a label in HubSpot'),
    flag('required'),
    flag('hidden'),
    text('placeholder'),
    html('description'),
    list('defaultValues', 'string', 'Default values'),
    defineField({
      name: 'options',
      type: 'array',
      readOnly: true,
      of: [defineArrayMember({type: 'hubspot.formOption'})],
    }),
    defineField({
      name: 'followUps',
      title: 'Follow-up fields',
      type: 'array',
      readOnly: true,
      of: [defineArrayMember({type: 'hubspot.formFollowUp'})],
    }),
  ],
  preview: {select: {title: 'label', subtitle: 'name'}},
})

const followUp = defineType({
  name: 'hubspot.formFollowUp',
  title: 'Follow-up field',
  type: 'object',
  readOnly: true,
  fields: [
    defineField({name: 'when', type: 'hubspot.formCondition', readOnly: true}),
    defineField({name: 'field', type: 'hubspot.formField', readOnly: true}),
  ],
  preview: {
    select: {title: 'field.label', operator: 'when.operator'},
    prepare: ({title, operator}: {title?: string; operator?: string}) => ({
      title,
      subtitle: operator && `Shows when the answer ${operator.replace(/_/g, ' ')}`,
    }),
  },
})

const group = defineType({
  name: 'hubspot.formGroup',
  title: 'Row',
  type: 'object',
  readOnly: true,
  fields: [
    html('text', 'Text above'),
    defineField({
      name: 'fields',
      type: 'array',
      readOnly: true,
      of: [defineArrayMember({type: 'hubspot.formField'})],
    }),
  ],
  preview: {
    select: {
      first: 'fields.0.label',
      second: 'fields.1.label',
      third: 'fields.2.label',
      text: 'text',
    },
    prepare: ({first, second, third, text: words}: Record<string, string | undefined>) => ({
      title: [first, second, third].filter(Boolean).join(' · ') || 'Text',
      subtitle: words?.replace(/<[^>]*>/g, ' ').trim(),
    }),
  },
})

const subscription = defineType({
  name: 'hubspot.formSubscription',
  title: 'Subscription box',
  type: 'object',
  readOnly: true,
  fields: [
    defineField({
      name: 'subscriptionTypeId',
      title: 'Subscription',
      type: 'number',
      readOnly: true,
    }),
    html('label'),
    flag('required'),
  ],
})

const consent = defineType({
  name: 'hubspot.formConsent',
  title: 'Consent',
  type: 'object',
  readOnly: true,
  fields: [
    text('type'),
    text('basis', 'Lawful basis'),
    list('subscriptionTypeIds', 'number', 'Subscriptions'),
    defineField({
      name: 'checkboxes',
      title: 'Subscription boxes',
      type: 'array',
      readOnly: true,
      of: [defineArrayMember({type: 'hubspot.formSubscription'})],
    }),
    html('communicationText', 'Text about communications'),
    html('processText', 'Text about storing data'),
    html('processLabel', 'Box for storing data'),
    html('footerText', 'Footer'),
    html('privacyText', 'Privacy text'),
  ],
})

const afterSubmit = defineType({
  name: 'hubspot.formAfterSubmit',
  title: 'After sending',
  type: 'object',
  readOnly: true,
  fields: [text('type'), html('html', 'Thank-you message'), text('url', 'Redirect to')],
})

const copy = defineType({
  name: FORM_COPY_TYPE,
  title: 'HubSpot form copy',
  type: 'document',
  icon: EnvelopeIcon,
  readOnly: true,
  fields: [
    text('name'),
    text('formId', 'Form id'),
    flag('archived', 'Archived in HubSpot'),
    flag('drawable', 'Drawn by the site'),
    list('undrawable', 'string', 'Why not'),
    flag('progressive', 'Has progressive fields'),
    text('updatedAt', 'Last changed in HubSpot'),
    text('syncedAt', 'Copied'),
    text('submitText', 'Button'),
    defineField({name: 'afterSubmit', type: 'hubspot.formAfterSubmit', readOnly: true}),
    defineField({
      name: 'groups',
      title: 'Rows',
      type: 'array',
      readOnly: true,
      of: [defineArrayMember({type: 'hubspot.formGroup'})],
    }),
    defineField({name: 'consent', type: 'hubspot.formConsent', readOnly: true}),
    text('portalId', 'Account'),
    text('region', 'Data centre'),
    text('language'),
    text('embed', 'HubSpot embed'),
    defineField({name: 'version', title: 'Model version', type: 'number', readOnly: true}),
  ],
  preview: {
    select: {title: 'name', formId: 'formId', archived: 'archived', drawable: 'drawable'},
    prepare: ({
      title,
      formId,
      archived,
      drawable,
    }: {
      title?: string
      formId?: string
      archived?: boolean
      drawable?: boolean
    }) => ({
      title,
      subtitle:
        formId && isSampleFormId(formId)
          ? 'Sample form'
          : archived
            ? 'Archived in HubSpot'
            : drawable
              ? 'Drawn by the site'
              : 'Shown with HubSpot’s embed',
      media: EnvelopeIcon,
    }),
  },
})

export const copyTypes = [
  option,
  condition,
  field,
  followUp,
  group,
  subscription,
  consent,
  afterSubmit,
  copy,
]

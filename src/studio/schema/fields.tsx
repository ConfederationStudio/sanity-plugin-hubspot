import {CommentIcon} from '@sanity/icons/Comment'
import {EnvelopeIcon} from '@sanity/icons/Envelope'
import {Stack, Text} from '@sanity/ui'
import {
  defineField,
  defineType,
  useFormValue,
  type ObjectDefinition,
  type ObjectInputProps,
} from 'sanity'

import {CONTENT_TYPES} from '../../core/content-type'
import {
  CHAT_TYPE,
  FORM_COPY_TYPE,
  FORM_TYPE,
  formCopyId,
  isFormId,
  OPEN_CHAT_TYPE,
  PAGE_TYPE,
} from '../../core/ids'
import {API_VERSION, type HubSpotPluginConfig} from '../config'
import type {HubSpotFormValue} from '../copies'
import {FormInput} from '../FormInput'

export interface HubSpotFormOptions {
  /**
   * For a site that draws its own form, such as a newsletter's one email field: the property
   * names it sends. The picker then says which HubSpot forms take them.
   */
  draws?: string[]
}

/** `defineField({type: 'hubspot.form', …})`, with its options typed. */
export interface HubSpotFormFieldDefinition extends Omit<
  ObjectDefinition,
  'type' | 'fields' | 'options'
> {
  type: typeof FORM_TYPE
  options?: HubSpotFormOptions
}

declare module 'sanity' {
  export interface IntrinsicDefinitions {
    'hubspot.form': HubSpotFormFieldDefinition
  }
}

function PageInput(props: ObjectInputProps & {contentTypes?: HubSpotPluginConfig['contentTypes']}) {
  const documentType = useFormValue(['_type'])
  const mapped = typeof documentType === 'string' ? props.contentTypes?.[documentType] : undefined
  const fallback = CONTENT_TYPES.find((type) => type.value === mapped)?.title
  return (
    <Stack gap={3}>
      {props.renderDefault(props)}
      <Text size={1} muted>
        {fallback
          ? `Without a choice, HubSpot files this page as: ${fallback}.`
          : 'Without a choice, HubSpot decides how to file this page.'}
      </Text>
    </Stack>
  )
}

export function fieldTypes(config: HubSpotPluginConfig) {
  const form = defineType({
    name: FORM_TYPE,
    title: 'HubSpot form',
    type: 'object',
    icon: EnvelopeIcon,
    fields: [
      defineField({name: 'formId', title: 'Form id', type: 'string', readOnly: true, hidden: true}),
      defineField({name: 'name', type: 'string', readOnly: true, hidden: true}),
      defineField({
        name: 'definition',
        type: 'reference',
        to: [{type: FORM_COPY_TYPE}],
        weak: true,
        readOnly: true,
        hidden: true,
      }),
    ],
    components: {
      input: (props: ObjectInputProps<HubSpotFormValue>) => (
        <FormInput {...props} config={config} />
      ),
    },
    preview: {
      select: {name: 'name', archived: 'definition.archived'},
      prepare: ({name, archived}: {name?: string; archived?: boolean}) => ({
        title: name ?? 'No form chosen',
        subtitle: archived ? 'Archived in HubSpot' : 'HubSpot form',
        media: EnvelopeIcon,
      }),
    },
    validation: (rule) =>
      rule
        .custom(async (value: HubSpotFormValue | undefined, context) => {
          if (!value?.formId) return true
          if (!isFormId(value.formId)) return 'This isn’t a HubSpot form id. Choose the form again.'
          const copy = await context
            .getClient({apiVersion: API_VERSION})
            .fetch<{archived?: boolean} | null>('*[_id == $id][0]{archived}', {
              id: formCopyId(value.formId),
            })
          return copy?.archived
            ? `“${value.name ?? 'This form'}” is archived in HubSpot, so the site can’t send it.`
            : true
        })
        .warning(),
  })

  const page = defineType({
    name: PAGE_TYPE,
    title: 'HubSpot',
    type: 'object',
    fields: [
      defineField({
        name: 'contentType',
        title: 'Content type in HubSpot',
        description: 'How HubSpot’s reports file this page’s views.',
        type: 'string',
        options: {list: CONTENT_TYPES.map(({value, title}) => ({value, title}))},
      }),
      defineField({
        name: 'hideChat',
        title: 'Hide chat on this page',
        type: 'boolean',
        initialValue: false,
      }),
    ],
    components: {
      input: (props: ObjectInputProps) => (
        <PageInput {...props} contentTypes={config.contentTypes} />
      ),
    },
  })

  const chat = defineType({
    name: CHAT_TYPE,
    title: 'Live chat',
    type: 'object',
    icon: CommentIcon,
    fields: [
      defineField({
        name: 'title',
        title: 'Heading',
        description: 'Shown above the chat. Leave empty for none.',
        type: 'string',
      }),
    ],
    preview: {
      select: {title: 'title'},
      prepare: ({title}: {title?: string}) => ({
        title: title ?? 'Live chat',
        subtitle: 'HubSpot chat, inside the page',
        media: CommentIcon,
      }),
    },
  })

  const openChat = defineType({
    name: OPEN_CHAT_TYPE,
    title: 'Open chat',
    type: 'object',
    icon: CommentIcon,
    fields: [
      defineField({
        name: 'fallbackUrl',
        title: 'Otherwise go to',
        description:
          'Where the link goes when chat can’t open, such as before consent: a contact page, say.',
        type: 'url',
        validation: (rule) =>
          rule.uri({scheme: ['http', 'https', 'mailto', 'tel'], allowRelative: true}),
      }),
    ],
  })

  return [form, page, chat, openChat]
}

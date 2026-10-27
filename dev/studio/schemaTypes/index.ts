import {defineArrayMember, defineField, defineType} from 'sanity'

/** Rich text with every place the plugin can sit in it: a form, an inline chat and an "Open chat" link. */
const body = defineField({
  name: 'body',
  type: 'array',
  of: [
    defineArrayMember({type: 'block', marks: {annotations: [{type: 'hubspot.openChat'}]}}),
    defineArrayMember({type: 'hubspot.form'}),
    defineArrayMember({type: 'hubspot.chat'}),
  ],
})

const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'form', type: 'hubspot.form'}),
    defineField({
      name: 'newsletter',
      title: 'Newsletter form',
      description: 'The site draws its own email field, so the picker says which forms take it.',
      type: 'hubspot.form',
      options: {draws: ['email']},
    }),
    defineField({name: 'hubspot', title: 'HubSpot', type: 'hubspot.page'}),
    body,
  ],
})

const post = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'hubspot', title: 'HubSpot', type: 'hubspot.page'}),
    body,
  ],
})

export const schemaTypes = [page, post]

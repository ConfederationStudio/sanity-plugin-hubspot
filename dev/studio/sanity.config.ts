import {defineConfig} from 'sanity'
import {hubspot} from 'sanity-plugin-hubspot'
import {structureTool} from 'sanity/structure'

import {dataset, hubspotApi, projectId} from './env'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'HubSpot plugin test',
  projectId,
  dataset,
  plugins: [
    structureTool(),
    hubspot({
      api: hubspotApi,
      contentTypes: {page: 'standard-page', post: 'blog-post'},
    }),
  ],
  schema: {types: schemaTypes},
})

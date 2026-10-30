import {defineConfig} from 'sanity'
import {hubspot} from 'sanity-plugin-hubspot'
import {structureTool} from 'sanity/structure'

import {dataset, projectId} from './env'
import {schemaTypes} from './schemaTypes'

/**
 * The test Studio, wherever it runs: on its own, at `api` on the site, or inside the site at
 * `basePath`, where the route is on the same domain.
 */
export function testStudio({api, basePath}: {api: string; basePath?: string}) {
  return defineConfig({
    name: 'default',
    title: 'HubSpot plugin test',
    projectId,
    dataset,
    ...(basePath && {basePath}),
    plugins: [
      structureTool(),
      hubspot({api, contentTypes: {page: 'standard-page', post: 'blog-post'}}),
    ],
    schema: {types: schemaTypes},
  })
}

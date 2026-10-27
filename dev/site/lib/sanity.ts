import type {PortableTextBlock} from '@portabletext/react'
import {createClient} from '@sanity/client'
import {HUBSPOT_FORM_PROJECTION, type HubSpotFormDefinition} from 'sanity-plugin-hubspot/server'

/** The plugin's test project. Set these to try it against another one. */
export const projectId = process.env.SANITY_PROJECT_ID ?? '3hko8drb'
export const dataset = process.env.SANITY_DATASET ?? 'production'

// The dataset is public and copies have no dot in their ids, so the site reads without a token.
export const client = createClient({
  projectId,
  dataset,
  apiVersion: '2025-02-19',
  useCdn: false,
  perspective: 'published',
})

export interface FormValue {
  _type: 'hubspot.form'
  formId?: string
  name?: string
  definition: HubSpotFormDefinition | null
}

export interface PageListItem {
  _type: 'page' | 'post'
  title: string
  slug: string
}

export interface Page extends PageListItem {
  form: FormValue | null
  newsletter: FormValue | null
  hubspot: {contentType?: string; hideChat?: boolean} | null
  body: PortableTextBlock[] | null
}

export const PAGES_QUERY = `*[_type in ["page", "post"] && defined(slug.current)] | order(title asc){
  _type, title, "slug": slug.current
}`

export const PAGE_QUERY = `*[_type in ["page", "post"] && slug.current == $slug][0]{
  _type,
  title,
  "slug": slug.current,
  form${HUBSPOT_FORM_PROJECTION},
  newsletter${HUBSPOT_FORM_PROJECTION},
  hubspot,
  body[]{..., _type == "hubspot.form" => ${HUBSPOT_FORM_PROJECTION}}
}`

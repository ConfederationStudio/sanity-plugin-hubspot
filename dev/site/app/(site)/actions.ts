'use server'

import {headers} from 'next/headers'
import {
  formCopyId,
  postedFormId,
  submitForm,
  type HubSpotFormDefinition,
  type HubSpotSubmitResult,
} from 'sanity-plugin-hubspot/server'

import {client} from '../../lib/sanity'

/** Sends from the site's server, as the README shows: the form is read from Sanity, never the post. */
export async function sendForm(data: FormData): Promise<HubSpotSubmitResult> {
  const formId = postedFormId(data)
  const form = formId
    ? await client.fetch<HubSpotFormDefinition | null>(`*[_id == $id][0]`, {id: formCopyId(formId)})
    : null
  if (!form) return {status: 'failed'}
  return submitForm(form, data, {
    ...(process.env.HUBSPOT_TOKEN && {token: process.env.HUBSPOT_TOKEN}),
    headers: await headers(),
  })
}

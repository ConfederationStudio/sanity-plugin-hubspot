import {hubspotRoutes} from 'sanity-plugin-hubspot/server'

import {dataset, projectId} from '../../../../lib/sanity'

const token = process.env.HUBSPOT_TOKEN
const secretKey = process.env.HUBSPOT_SECRET_KEY
// The local Studio, and deployed ones, comma-separated. The Studio at /studio needs none.
const studioOrigins = [
  'http://localhost:3333',
  ...(process.env.HUBSPOT_STUDIO_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]

// With neither a Service Key nor a secret to seal a pasted one, the route stands in with sample
// forms, so the Studio can pick one before there is a HubSpot account.
export const {GET, POST, OPTIONS} = hubspotRoutes({
  projectId,
  dataset,
  studioOrigins,
  ...(token && {token}),
  ...(secretKey && {secretKey}),
  standIn: !token && !secretKey,
})

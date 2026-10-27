import {hubspotRoutes} from 'sanity-plugin-hubspot/server'

import {dataset, projectId} from '../../../../lib/sanity'

const token = process.env.HUBSPOT_TOKEN
const secretKey = process.env.HUBSPOT_SECRET_KEY

// With neither a Service Key nor a secret to seal a pasted one, the route stands in with sample
// forms, so the Studio can pick one before there is a HubSpot account.
export const {GET, POST, OPTIONS} = hubspotRoutes({
  projectId,
  dataset,
  studioOrigins: ['http://localhost:3333'],
  ...(token && {token}),
  ...(secretKey && {secretKey}),
  standIn: !token && !secretKey,
})

/** The plugin's test project. Set these to try it against another one. */
export const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? '3hko8drb'
export const dataset = process.env.SANITY_STUDIO_DATASET ?? 'production'

/** The test site's HubSpot route: `dev/site`, on `pnpm dev`. */
export const hubspotApi =
  process.env.SANITY_STUDIO_HUBSPOT_API ?? 'http://localhost:3000/api/hubspot'

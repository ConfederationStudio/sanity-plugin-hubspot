import {isFormId, isPortalId} from '../../core/ids'
import type {HubSpotAccount} from '../../core/model'

/** HubSpot's app for a data centre: `app.hubspot.com`, `app-eu1.hubspot.com`. */
const UI_DOMAIN = /^app(-[a-z0-9]+)?\.hubspot\.com$/

/**
 * Where the account's HubSpot app lives. A domain the route passed on that isn't HubSpot's is
 * left out for the default one, so a link here never leads anywhere else.
 */
function appOrigin(account: HubSpotAccount | undefined): string | undefined {
  if (!account || !isPortalId(account.portalId)) return undefined
  const domain =
    account.uiDomain && UI_DOMAIN.test(account.uiDomain) ? account.uiDomain : 'app.hubspot.com'
  return `https://${domain}`
}

/** The pages of the account an editor goes to from the tab. */
export interface HubSpotAccountLinks {
  forms: string
  contacts: string
  reports: string
  chat: string
}

export function accountLinks(account: HubSpotAccount | undefined): HubSpotAccountLinks | undefined {
  const origin = appOrigin(account)
  if (!origin || !account) return undefined
  const id = account.portalId
  return {
    forms: `${origin}/forms/${id}`,
    contacts: `${origin}/contacts/${id}`,
    reports: `${origin}/reports-dashboard/${id}`,
    chat: `${origin}/chatflows/${id}`,
  }
}

/** One form's pages in HubSpot: its editor, and what visitors have sent to it. */
export interface HubSpotFormLinks {
  edit: string
  submissions: string
}

export function formLinks(
  account: HubSpotAccount | undefined,
  formId: string,
): HubSpotFormLinks | undefined {
  const origin = appOrigin(account)
  if (!origin || !account || !isFormId(formId)) return undefined
  const id = account.portalId
  return {
    edit: `${origin}/forms/${id}/editor/${formId}/edit/form`,
    submissions: `${origin}/submissions/${id}/form/${formId}/submissions`,
  }
}

/**
 * `sanity-plugin-hubspot`: the Studio's side. The site imports `sanity-plugin-hubspot/react` and
 * `sanity-plugin-hubspot/server` instead.
 */
export {hubspot} from './studio/plugin'
export type {HubSpotPluginConfig} from './studio/config'
export type {HubSpotFormCopy, HubSpotFormValue} from './studio/copies'
export type {HubSpotFormFieldDefinition, HubSpotFormOptions} from './studio/schema/fields'

export {CONTENT_TYPES, type HubSpotContentType} from './core/content-type'
export {
  CHAT_TYPE,
  FORM_COPY_TYPE,
  FORM_TYPE,
  formCopyId,
  OPEN_CHAT_TYPE,
  PAGE_TYPE,
} from './core/ids'
export type {
  HubSpotAccount,
  HubSpotConsent,
  HubSpotField,
  HubSpotFormDefinition,
  HubSpotGroup,
} from './core/model'

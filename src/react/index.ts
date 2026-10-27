'use client'

/**
 * `sanity-plugin-hubspot/react`: the site's side, for the browser. It never imports Sanity. A
 * server component takes the same plain helpers (the GROQ projection, content types) from
 * `sanity-plugin-hubspot/server`, since everything here is client code to a React server.
 */
export {
  defaultFieldComponents,
  visuallyHidden,
  type HubSpotFieldProps,
  type HubSpotFieldState,
} from './fields'
export {
  HUBSPOT_INLINE_CHAT_ID,
  HubSpotChat,
  HubSpotChatEmbed,
  HubSpotChatLink,
  openHubSpotChat,
  type HubSpotChatLinkProps,
  type HubSpotChatProps,
} from './HubSpotChat'
export {HubSpotEmbed, type HubSpotEmbedProps} from './HubSpotEmbed'
export {
  DEFAULT_ERROR_TEXT,
  HubSpotForm,
  type HubSpotFormComponents,
  type HubSpotFormProps,
} from './HubSpotForm'
export {HubSpotTracker, type HubSpotTrackerProps} from './HubSpotTracker'
export type {
  HubSpotConsentProps,
  HubSpotGroupProps,
  HubSpotRichTextProps,
  HubSpotStatusProps,
  HubSpotSubmitProps,
} from './parts'
export {fillFromAddress, sendHubSpotForm} from './send'
export {createTracker, type HubSpotTracking, type HubSpotTrackerOptions} from './tracker'

export {CONTENT_TYPES, resolveContentType, type HubSpotContentType} from '../core/content-type'
export {fitsFields, type HubSpotFit} from '../core/drawable'
export {FORM_COPY_TYPE, FORM_TYPE, formCopyId, HUBSPOT_FORM_PROJECTION} from '../core/ids'
export {
  layoutForm,
  type HubSpotAnswers,
  type HubSpotFieldView,
  type HubSpotFormPart,
} from '../core/layout'
export type * from '../core/model'

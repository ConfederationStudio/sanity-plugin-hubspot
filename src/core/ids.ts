/** Schema type names. Namespaced like Mux's `mux.video` and `mux.videoAsset`. */
export const FORM_TYPE = 'hubspot.form'
export const FORM_COPY_TYPE = 'hubspot.formDefinition'
export const PAGE_TYPE = 'hubspot.page'
export const CHAT_TYPE = 'hubspot.chat'
export const OPEN_CHAT_TYPE = 'hubspot.openChat'
export const SETTINGS_TYPE = 'hubspot.settings'

/**
 * The settings document's id. It holds a dot, so Sanity never serves it without a token, even
 * from a public dataset. Any project member can still read it, which is why the key in it is
 * sealed.
 */
export const SETTINGS_ID = 'hubspot.settings'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isFormId = (value: unknown): value is string =>
  typeof value === 'string' && GUID.test(value)

export const isPortalId = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,12}$/.test(value)

/**
 * A form copy's document id. No dot, unlike the settings document: a page's query reads
 * copies without a token, so they must be public wherever the dataset is.
 */
export const formCopyId = (formId: string): string => `hubspot-form-${formId.toLowerCase()}`

/**
 * The GROQ projection for a `hubspot.form` field, with its copy: `newsletter${HUBSPOT_FORM_PROJECTION}`
 * in a page's query, then `<HubSpotForm form={page.newsletter?.definition} />`.
 */
export const HUBSPOT_FORM_PROJECTION = '{_type, formId, name, "definition": definition->}'

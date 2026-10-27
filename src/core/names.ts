import type {HubSpotField} from './model'

/**
 * The names the plugin's own inputs post under. HubSpot property names are lowercase letters,
 * digits and underscores, so a colon can never meet a field's name.
 */
export const FORM_INPUT = 'hubspot:form'
export const CONSENT_INPUT = 'hubspot:consent'
/** Left empty by people and filled by bots. A send with it filled is dropped quietly. */
export const HONEYPOT_INPUT = 'hubspot:website'
export const PAGE_URI_INPUT = 'hubspot:page'
export const PAGE_NAME_INPUT = 'hubspot:title'

export const subscriptionInput = (subscriptionTypeId: number): string =>
  `hubspot:subscription:${subscriptionTypeId}`

/**
 * The name a field's input posts under: its property name, led by its object for anything but
 * a contact, since a company and a contact may both have a `name`.
 */
export const inputName = (field: Pick<HubSpotField, 'name' | 'objectTypeId'>): string =>
  field.objectTypeId === '0-1' ? field.name : `${field.objectTypeId}/${field.name}`

/**
 * `sanity-plugin-hubspot/server`: the site's route for the Studio, and sending forms from the
 * site's server. Web `Request` and `Response` only; it imports neither Sanity nor React.
 */
export {submissionContext, type HeadersLike} from './context'
export {hubspotRoutes, type HubSpotRoutes, type HubSpotRoutesOptions} from './routes'
export {getHubSpotForm, submitForm, type SubmitFormOptions} from './submit'

export {FORM_COPY_TYPE, formCopyId, isFormId} from '../core/ids'
export {
  postedFormId,
  readSubmission,
  type FormDataLike,
  type HubSpotContext,
} from '../core/submission'
export type {HubSpotFieldError, HubSpotFormDefinition, HubSpotSubmitResult} from '../core/model'

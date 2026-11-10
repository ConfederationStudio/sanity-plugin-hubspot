import type {HubSpotConnection} from '../../core/route'
import {failureText, RouteError, type RouteFailure} from '../route'

/** `next`: the step to do now. `waiting`: it can't be checked until the ones before it pass. */
export type SetupState = 'done' | 'failed' | 'next' | 'waiting'

export type SetupStepId = 'token' | 'route' | 'editor' | 'key' | 'hubspot'

export interface SetupStep {
  id: SetupStepId
  title: string
  state: SetupState
  /** What the check found, or what to do about it. */
  detail?: string
}

/** What has to hold, in the order the Studio finds out, for the tab to list HubSpot's forms. */
const STEPS: readonly {id: SetupStepId; title: string}[] = [
  {id: 'token', title: 'You’re signed in to the Studio with a token'},
  {id: 'route', title: 'The Studio reaches the site’s HubSpot route'},
  {id: 'editor', title: 'The route accepts this Studio and your account'},
  {id: 'key', title: 'The site has a HubSpot key'},
  {id: 'hubspot', title: 'HubSpot takes the key and lets it read forms'},
]

/** The step each of the route's failures stops at. */
const STOPS_AT: Record<RouteFailure, SetupStepId> = {
  'no-token': 'token',
  'unreachable': 'route',
  'not-found': 'route',
  'bad-request': 'route',
  'signed-out': 'editor',
  'not-member': 'editor',
  'forbidden-origin': 'editor',
  'sanity-failed': 'editor',
  'not-connected': 'key',
  'no-secret-key': 'key',
  'key-from-environment': 'key',
  'forbidden-role': 'key',
  'key-rejected': 'hubspot',
  'key-lacks-scope': 'hubspot',
  'rate-limited': 'hubspot',
  'hubspot-failed': 'hubspot',
}

const KEY_SOURCE = {
  environment: 'From the site’s environment (HUBSPOT_TOKEN).',
  studio: 'Pasted here and sealed, so only the site can read it.',
}

type Details = Partial<Record<SetupStepId, string>>

function checklist(stateAt: (index: number) => SetupState, details: Details = {}): SetupStep[] {
  return STEPS.map((step, index) => {
    const out: SetupStep = {id: step.id, title: step.title, state: stateAt(index)}
    const detail = details[step.id]
    if (detail) out.detail = detail
    return out
  })
}

/** The checklist with everything before `at` done and everything after it waiting. */
function upTo(at: SetupStepId, state: SetupState, details: Details): SetupStep[] {
  const stop = STEPS.findIndex((step) => step.id === at)
  return checklist((index) => (index < stop ? 'done' : index === stop ? state : 'waiting'), details)
}

/**
 * The tab's setup checklist, read off what the route answered: its connection, or the failure
 * that stopped the Studio from getting one. With neither, nothing is known yet.
 */
export function setupSteps(input: {
  connection?: HubSpotConnection
  failure?: RouteFailure
  api: string
}): SetupStep[] {
  const {connection, failure, api} = input
  if (failure)
    return upTo(STOPS_AT[failure], 'failed', {
      [STOPS_AT[failure]]: failureText(new RouteError(failure), api),
    })
  if (!connection) return checklist(() => 'waiting')

  switch (connection.status) {
    case 'connected':
      return checklist(() => 'done', {
        route: api,
        key: KEY_SOURCE[connection.source],
        hubspot: `Account ${connection.account.portalId}, in the ${connection.account.region} data centre.`,
      })
    case 'stand-in':
      return upTo('key', 'next', {
        key: 'Stand-in mode: the route answers with sample forms and calls nobody. Set HUBSPOT_TOKEN in the site’s environment, or HUBSPOT_SECRET_KEY to paste a key here.',
      })
    case 'key-rejected':
      return upTo('hubspot', 'failed', {
        key: KEY_SOURCE[connection.source],
        hubspot:
          'HubSpot doesn’t take it as a key. It needs a Service Key: a personal access key or developer API key won’t work, and nor will a revoked one.',
      })
    case 'key-lacks-scope':
      return upTo('hubspot', 'failed', {
        key: KEY_SOURCE[connection.source],
        hubspot:
          'HubSpot takes the key, but it lacks the forms scope. Add the scope to the Service Key in HubSpot, or create one that has it.',
      })
    default:
      if (connection.unreadable)
        return upTo('key', 'failed', {
          key: 'A key is saved, but the site’s secret can’t open it: HUBSPOT_SECRET_KEY has changed. Paste the key again.',
        })
      return upTo('key', 'next', {
        key: connection.canSaveKey
          ? 'Paste a HubSpot Service Key with the forms scope.'
          : 'Set HUBSPOT_TOKEN in the site’s environment, or set HUBSPOT_SECRET_KEY and have an administrator paste a key here.',
      })
  }
}

/** Whether every step passed. */
export const isSetUp = (steps: readonly SetupStep[]): boolean =>
  steps.every((step) => step.state === 'done')

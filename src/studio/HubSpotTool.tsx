import {LaunchIcon} from '@sanity/icons/Launch'
import {SyncIcon} from '@sanity/icons/Sync'
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Text,
} from '@sanity/ui'
import {Menu, MenuButton, MenuItem} from '@sanity/ui/menu'
import {useToast} from '@sanity/ui/toast'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient} from 'sanity'

import {FORM_COPY_TYPE} from '../core/ids'
import type {HubSpotFormDefinition} from '../core/model'
import type {HubSpotConnection} from '../core/route'
import {API_VERSION, type HubSpotPluginConfig} from './config'
import {refreshCopy, syncCopies} from './copies'
import {failureText, RouteError, useRoute, type RouteFailure} from './route'
import {FormsPanel} from './tool/FormsPanel'
import {accountLinks} from './tool/links'
import {COPIES_QUERY, formRows, type CopyFacts} from './tool/rows'
import {formatTime, isNotable, type SyncRun} from './tool/runs'
import {isSetUp, setupSteps} from './tool/setup'
import {SetupPanel} from './tool/SetupPanel'
import {TrackingPanel} from './tool/TrackingPanel'

/** How long the tab waits for a token before saying the session has none. */
const SIGN_IN_WAIT = 5000
/** How many refreshes the Setup panel lists. */
const RUNS_KEPT = 10

interface ToolState {
  connection?: HubSpotConnection
  forms?: HubSpotFormDefinition[]
  copies?: CopyFacts[]
  failure?: RouteFailure
}

type Panel = 'forms' | 'tracking' | 'setup'

const PANELS: readonly {id: Panel; label: string}[] = [
  {id: 'forms', label: 'Forms'},
  {id: 'tracking', label: 'Tracking and chat'},
  {id: 'setup', label: 'Setup'},
]

/** The account and key in a line, once HubSpot is connected. */
function statusLine(connection: HubSpotConnection | undefined, refreshed: string | undefined) {
  if (connection?.status === 'stand-in') return 'Sample forms only'
  if (connection?.status !== 'connected') return undefined
  return [
    `Account ${connection.account.portalId}`,
    connection.account.region,
    connection.source === 'environment' ? 'key from the site’s environment' : 'key pasted here',
    refreshed && `refreshed ${refreshed}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function StatusBadge({
  connection,
  failure,
}: {
  connection: HubSpotConnection | undefined
  failure: RouteFailure | undefined
}) {
  if (failure) return <Badge tone="critical">Not working</Badge>
  if (connection?.status === 'connected') return <Badge tone="positive">Connected</Badge>
  if (connection?.status === 'stand-in') return <Badge>Stand-in</Badge>
  return connection ? <Badge tone="caution">Setup needed</Badge> : null
}

/**
 * The HubSpot tab: the connection in a line, every form with the documents it is on, how pages
 * are tracked, and the setup. Opening it brings the copies up to date; Refresh all copies every
 * one again.
 */
export function HubSpotTool({config}: {config: HubSpotPluginConfig}) {
  const client = useClient({apiVersion: API_VERSION})
  const route = useRoute(config.api)
  const toast = useToast()
  const [state, setState] = useState<ToolState>({})
  // The latest refresh, and the ones worth listing: asked for, or that changed a copy.
  const [lastRun, setLastRun] = useState<SyncRun>()
  const [runs, setRuns] = useState<SyncRun[]>([])
  const runCount = useRef(0)
  const [syncing, setSyncing] = useState(true)
  const [chosen, setChosen] = useState<Panel>()
  // A load for a route that has since changed, such as one with no token yet, is answered by the next.
  const current = useRef(route)
  useEffect(() => {
    current.current = route
  }, [route])

  const load = useCallback(
    async (all = false) => {
      try {
        const connection = await route.connection()
        if (connection.status !== 'connected' && connection.status !== 'stand-in') {
          setState({connection})
          return
        }
        const [{forms}, copies] = await Promise.all([
          route.forms(),
          client.fetch<CopyFacts[]>(COPIES_QUERY, {type: FORM_COPY_TYPE}),
        ])
        const result = await syncCopies(client, route, forms, copies, all)
        const fresh =
          result.written + result.archived > 0
            ? await client.fetch<CopyFacts[]>(COPIES_QUERY, {type: FORM_COPY_TYPE})
            : copies
        setState({connection, forms, copies: fresh})
        const run: SyncRun = {id: runCount.current++, at: new Date().toISOString(), all, result}
        setLastRun(run)
        if (isNotable(run)) setRuns((last) => [run, ...last].slice(0, RUNS_KEPT))
        if (all && result.failed === 0)
          toast.push({status: 'success', title: 'Every form copy is up to date'})
      } catch (error) {
        // Signing in, the Studio can open before Sanity gives it a token, which then reloads the tab.
        if (error instanceof RouteError && error.code === 'no-token')
          await new Promise((resolve) => setTimeout(resolve, SIGN_IN_WAIT))
        if (route !== current.current) return
        const failure = error instanceof RouteError ? error.code : 'hubspot-failed'
        setState((last) => ({...last, failure}))
      } finally {
        if (route === current.current) setSyncing(false)
      }
    },
    [client, route, toast],
  )

  // Opening the tab brings the copies up to date. Every state change in `load` follows an await.
  useEffect(() => {
    const run = async () => {
      await load()
    }
    void run()
  }, [load])

  const refresh = useCallback(
    (all: boolean) => {
      setSyncing(true)
      void load(all)
    },
    [load],
  )

  const refreshForm = useCallback(
    async (formId: string) => {
      try {
        const outcome = await refreshCopy(client, route, formId)
        toast.push(
          outcome === 'written'
            ? {status: 'success', title: 'Form refreshed from HubSpot'}
            : {status: 'warning', title: 'HubSpot no longer has this form'},
        )
        await load()
      } catch (error) {
        toast.push({
          status: 'error',
          title: 'Couldn’t refresh the form',
          description:
            error instanceof RouteError
              ? failureText(error, config.api)
              : 'Your role may not allow writing documents.',
        })
      }
    },
    [client, config.api, load, route, toast],
  )

  const {connection, failure} = state
  const rows = useMemo(
    () => formRows(state.forms ?? [], state.copies ?? []),
    [state.copies, state.forms],
  )
  const steps = useMemo(
    () => setupSteps({connection, failure, api: config.api}),
    [config.api, connection, failure],
  )
  const account = connection?.status === 'connected' ? connection.account : undefined
  const links = accountLinks(account)
  const ready = state.forms !== undefined && !failure
  // Until an editor picks a panel, the tab opens on what there is to do: the forms, or the setup.
  const panel = chosen ?? (ready ? 'forms' : 'setup')
  const status = statusLine(connection, formatTime(lastRun?.at))
  const waiting = !connection && !failure

  return (
    <Container width={2} padding={4} sizing="border">
      <Stack gap={5}>
        <Flex align="center" gap={3} wrap="wrap">
          {/* Wide enough that the buttons wrap under the title on a narrow screen. */}
          <Box flex={1} style={{minWidth: 260}}>
            <Stack gap={3}>
              <Flex align="center" gap={3}>
                <Heading as="h1" size={2}>
                  HubSpot
                </Heading>
                <StatusBadge connection={connection} failure={failure} />
              </Flex>
              {status && (
                <Text size={1} muted>
                  {status}
                </Text>
              )}
            </Stack>
          </Box>
          {links && (
            <MenuButton
              id="hubspot-open"
              button={<Button text="Open HubSpot" iconRight={LaunchIcon} mode="ghost" />}
              popover={{placement: 'bottom-end', portal: true}}
              menu={
                <Menu>
                  <MenuItem
                    as="a"
                    href={links.forms}
                    target="_blank"
                    rel="noreferrer"
                    text="Forms"
                  />
                  <MenuItem
                    as="a"
                    href={links.contacts}
                    target="_blank"
                    rel="noreferrer"
                    text="Contacts"
                  />
                  <MenuItem
                    as="a"
                    href={links.reports}
                    target="_blank"
                    rel="noreferrer"
                    text="Reports"
                  />
                  <MenuItem as="a" href={links.chat} target="_blank" rel="noreferrer" text="Chat" />
                </Menu>
              }
            />
          )}
          <Button
            text="Refresh all"
            icon={SyncIcon}
            mode="ghost"
            title="Read every form from HubSpot again and rewrite the copies"
            loading={syncing}
            disabled={syncing || !state.forms}
            onClick={() => refresh(true)}
          />
        </Flex>

        {waiting ? (
          <Flex justify="center" padding={5}>
            <Spinner muted />
          </Flex>
        ) : (
          <Stack gap={4}>
            <TabList gap={1}>
              {PANELS.map(({id, label}) => (
                <Tab
                  key={id}
                  id={`hubspot-tab-${id}`}
                  aria-controls={`hubspot-panel-${id}`}
                  label={label}
                  selected={panel === id}
                  onClick={() => setChosen(id)}
                />
              ))}
            </TabList>
            <TabPanel
              id="hubspot-panel-forms"
              aria-labelledby="hubspot-tab-forms"
              hidden={panel !== 'forms'}
            >
              {ready ? (
                <FormsPanel
                  rows={rows}
                  account={account}
                  lastRun={lastRun}
                  busy={syncing}
                  onRefreshForm={refreshForm}
                  onRetry={() => refresh(false)}
                />
              ) : (
                <Card padding={4} radius={2} border tone="transparent">
                  <Text size={1} muted>
                    HubSpot’s forms show here once the setup is done.
                  </Text>
                </Card>
              )}
            </TabPanel>
            <TabPanel
              id="hubspot-panel-tracking"
              aria-labelledby="hubspot-tab-tracking"
              hidden={panel !== 'tracking'}
            >
              {panel === 'tracking' && <TrackingPanel config={config} />}
            </TabPanel>
            <TabPanel
              id="hubspot-panel-setup"
              aria-labelledby="hubspot-tab-setup"
              hidden={panel !== 'setup'}
            >
              <SetupPanel
                steps={steps}
                connection={connection}
                route={route}
                api={config.api}
                runs={runs}
                busy={syncing}
                onCheck={() => refresh(false)}
                onChanged={() => refresh(false)}
              />
            </TabPanel>
          </Stack>
        )}
        {!waiting && !isSetUp(steps) && panel !== 'setup' && (
          <Card padding={3} radius={2} border tone={failure ? 'critical' : 'caution'}>
            <Flex align="center" gap={3}>
              <Box flex={1}>
                <Text size={1}>The setup isn’t finished, so some of this may be missing.</Text>
              </Box>
              <Button
                text="Open setup"
                mode="ghost"
                fontSize={1}
                onClick={() => setChosen('setup')}
              />
            </Flex>
          </Card>
        )}
      </Stack>
    </Container>
  )
}

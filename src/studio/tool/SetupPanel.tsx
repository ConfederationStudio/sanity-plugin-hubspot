import {SyncIcon} from '@sanity/icons/Sync'
import {Badge, Box, Button, Card, Dialog, Flex, Heading, Stack, Text, TextInput} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {useState} from 'react'
import {useClient} from 'sanity'

import {SETTINGS_ID, SETTINGS_TYPE} from '../../core/ids'
import type {HubSpotConnection} from '../../core/route'
import {API_VERSION} from '../config'
import {failureText, type RouteClient} from '../route'
import {formatTime, runSummary, type SyncRun} from './runs'
import {isSetUp, type SetupState, type SetupStep} from './setup'

const BADGE: Record<
  SetupState,
  {text: string; tone: 'positive' | 'critical' | 'caution' | 'default'}
> = {
  done: {text: 'Done', tone: 'positive'},
  failed: {text: 'Fix', tone: 'critical'},
  next: {text: 'Next', tone: 'caution'},
  waiting: {text: 'Later', tone: 'default'},
}

function Step({step}: {step: SetupStep}) {
  const badge = BADGE[step.state]
  return (
    <Flex gap={3} align="flex-start">
      <Box style={{width: 56, flexShrink: 0}}>
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </Box>
      <Box flex={1}>
        <Stack gap={2}>
          <Text size={1} weight="medium" muted={step.state === 'waiting'}>
            {step.title}
          </Text>
          {step.detail && (
            <Text size={1} muted>
              {step.detail}
            </Text>
          )}
        </Stack>
      </Box>
    </Flex>
  )
}

/** Where an administrator pastes, replaces or removes the HubSpot key the site keeps sealed. */
function KeyForm({
  connection,
  route,
  api,
  onChanged,
}: {
  connection: HubSpotConnection
  route: RouteClient
  api: string
  onChanged: () => void
}) {
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const saved = 'source' in connection && connection.source === 'studio'

  const save = async () => {
    setSaving(true)
    try {
      const {sealedKey, account} = await route.saveKey(key.trim())
      await client.createOrReplace({_id: SETTINGS_ID, _type: SETTINGS_TYPE, sealedKey, account})
      setKey('')
      toast.push({status: 'success', title: `Connected to HubSpot account ${account.portalId}`})
      onChanged()
    } catch (error) {
      toast.push({
        status: 'error',
        title: 'The key wasn’t saved',
        description: failureText(error, api),
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setConfirming(false)
    setSaving(true)
    try {
      await client.patch(SETTINGS_ID).unset(['sealedKey', 'account']).commit()
      toast.push({status: 'success', title: 'The HubSpot key is removed'})
      onChanged()
    } catch {
      toast.push({status: 'error', title: 'The key wasn’t removed'})
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap={3}>
      <Heading as="h2" size={1}>
        HubSpot key
      </Heading>
      <Text size={1} muted>
        A Service Key with the forms scope, from Development › Keys › Service keys in HubSpot. The
        site checks it with HubSpot and seals it, and the Studio saves only the sealed text.
      </Text>
      <Flex gap={2}>
        <Box flex={1}>
          <TextInput
            type="password"
            autoComplete="off"
            aria-label="HubSpot Service Key"
            placeholder="pat-na1-…"
            value={key}
            onChange={(event) => setKey(event.currentTarget.value)}
          />
        </Box>
        <Button
          text={saved ? 'Replace key' : 'Save key'}
          tone="primary"
          disabled={key.trim() === '' || saving}
          loading={saving}
          onClick={() => void save()}
        />
      </Flex>
      {saved && (
        <Box>
          <Button
            text="Remove key"
            mode="ghost"
            tone="critical"
            fontSize={1}
            disabled={saving}
            onClick={() => setConfirming(true)}
          />
        </Box>
      )}
      {confirming && (
        <Dialog
          id="hubspot-remove-key"
          header="Remove the HubSpot key?"
          width={1}
          onClose={() => setConfirming(false)}
          footer={
            <Flex gap={2} justify="flex-end" padding={3}>
              <Button text="Keep it" mode="ghost" onClick={() => setConfirming(false)} />
              <Button text="Remove key" tone="critical" onClick={() => void remove()} />
            </Flex>
          }
        >
          <Box padding={4}>
            <Text size={1}>
              The Studio will stop listing HubSpot’s forms until a key is pasted again. Forms
              already on the site keep working from their copies.
            </Text>
          </Box>
        </Dialog>
      )}
    </Stack>
  )
}

export interface SetupPanelProps {
  steps: SetupStep[]
  connection: HubSpotConnection | undefined
  route: RouteClient
  api: string
  /** The refreshes since the tab opened that were asked for or changed a copy, newest first. */
  runs: SyncRun[]
  /** A check is under way. */
  busy: boolean
  /** Asks the route again, after something was fixed outside the Studio. */
  onCheck: () => void
  /** Called once the key is saved or removed. */
  onChanged: () => void
}

/**
 * The tab's setup: what has to hold for the Studio to list HubSpot's forms, each step checked,
 * then the key for an administrator to paste, and the refreshes since the tab opened.
 */
export function SetupPanel({
  steps,
  connection,
  route,
  api,
  runs,
  busy,
  onCheck,
  onChanged,
}: SetupPanelProps) {
  const canSaveKey =
    connection !== undefined && connection.status !== 'stand-in' && connection.canSaveKey
  return (
    <Stack gap={5}>
      <Card padding={4} radius={2} border>
        <Stack gap={4}>
          {steps.map((step) => (
            <Step key={step.id} step={step} />
          ))}
          {!isSetUp(steps) && (
            <Box>
              <Button
                text="Check again"
                icon={SyncIcon}
                mode="ghost"
                fontSize={1}
                loading={busy}
                disabled={busy}
                onClick={onCheck}
              />
            </Box>
          )}
        </Stack>
      </Card>
      {connection && canSaveKey && (
        <KeyForm connection={connection} route={route} api={api} onChanged={onChanged} />
      )}
      {runs.length > 0 && (
        <Stack gap={3}>
          <Heading as="h2" size={1}>
            Refreshes since you opened the tab
          </Heading>
          <Card radius={2} border overflow="hidden">
            {runs.map((run, index) => (
              <Card key={run.id} borderTop={index > 0} paddingX={3} paddingY={3}>
                <Flex gap={3}>
                  <Box style={{width: 72, flexShrink: 0}}>
                    <Text size={1} muted>
                      {formatTime(run.at)}
                    </Text>
                  </Box>
                  <Box flex={1}>
                    <Text size={1}>
                      {run.all ? 'Every form read again. ' : ''}
                      {runSummary(run.result)}
                    </Text>
                  </Box>
                </Flex>
              </Card>
            ))}
          </Card>
          <Text size={1} muted>
            Opening the tab refreshes the copies that are behind. Each form’s row says when its copy
            was last written.
          </Text>
        </Stack>
      )}
    </Stack>
  )
}

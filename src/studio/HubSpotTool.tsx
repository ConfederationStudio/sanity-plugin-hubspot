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
  Inline,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {IntentLink} from 'sanity/router'

import {FORM_COPY_TYPE, SETTINGS_ID, SETTINGS_TYPE} from '../core/ids'
import type {HubSpotAccount, HubSpotFormDefinition} from '../core/model'
import type {HubSpotConnection} from '../core/route'
import {API_VERSION, type HubSpotPluginConfig} from './config'
import {formatDate, syncCopies, type CopyState} from './copies'
import {FormStatus} from './FormParts'
import {failureText, useRoute, type RouteClient} from './route'

interface Usage {
  _id: string
  _type: string
  title?: string
}

interface CopyFacts extends CopyState {
  name?: string
  drawable?: boolean
  undrawable?: HubSpotFormDefinition['undrawable']
  progressive?: boolean
  usedOn: Usage[]
}

/** Every copy with the documents that use it. A draft and its published document count once. */
const COPIES = `*[_type == $type]{
  _id, formId, name, archived, drawable, undrawable, progressive, updatedAt, version,
  "usedOn": *[references(^._id)]{_id, _type, "title": coalesce(title, name, heading, _id)}
}`

const publishedId = (id: string) => id.replace(/^(drafts|versions\.[^.]+)\./, '')

function dedupe(usage: Usage[]): Usage[] {
  const seen = new Map<string, Usage>()
  for (const document of usage) {
    const id = publishedId(document._id)
    if (!seen.has(id)) seen.set(id, {...document, _id: id})
  }
  return [...seen.values()]
}

const UI_DOMAIN = /^app(-[a-z0-9]+)?\.hubspot\.com$/

function editorUrl(account: HubSpotAccount | undefined, formId: string): string | undefined {
  if (!account) return undefined
  const domain =
    account.uiDomain && UI_DOMAIN.test(account.uiDomain) ? account.uiDomain : 'app.hubspot.com'
  return `https://${domain}/forms/${account.portalId}/editor/${formId}/edit/form`
}

function UsedOn({usage}: {usage: Usage[]}) {
  if (usage.length === 0)
    return (
      <Text size={1} muted>
        Not used yet
      </Text>
    )
  return (
    <Stack gap={2}>
      <Text size={1} muted>
        Used on {usage.length === 1 ? '1 document' : `${usage.length} documents`}
      </Text>
      {usage.map((document) => (
        <Text key={document._id} size={1}>
          <IntentLink intent="edit" params={{id: document._id, type: document._type}}>
            {document.title ?? document._id}
          </IntentLink>
        </Text>
      ))}
    </Stack>
  )
}

function ConnectionPanel({
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
  const canSaveKey = connection.status !== 'stand-in' && connection.canSaveKey

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

  const theKey =
    'source' in connection && connection.source === 'environment'
      ? 'the key in HUBSPOT_TOKEN'
      : 'the saved key'
  let summary: string
  switch (connection.status) {
    case 'connected':
      summary = `Connected to HubSpot account ${connection.account.portalId}, in the ${connection.account.region} data centre. ${
        connection.source === 'environment'
          ? 'The key comes from the site’s environment (HUBSPOT_TOKEN).'
          : 'The key was pasted here, and only the site can read it.'
      }`
      break
    case 'key-rejected':
      summary = `HubSpot doesn’t take ${theKey} as a key. It needs a Service Key: a personal access key or developer API key won’t work, and nor will a revoked one.`
      break
    case 'key-lacks-scope':
      summary = `HubSpot takes ${theKey}, but it lacks the forms scope. Add the scope to the Service Key in HubSpot, or create one that has it.`
      break
    case 'stand-in':
      summary = 'Stand-in mode: the site’s route answers with sample forms and calls nobody.'
      break
    default:
      summary = connection.unreadable
        ? 'A key is saved, but the site’s secret key can’t open it: HUBSPOT_SECRET_KEY has changed. Paste the key again.'
        : canSaveKey
          ? 'Not connected. Paste a HubSpot Service Key with the forms scope.'
          : 'Not connected. Set HUBSPOT_TOKEN in the site’s environment, or set HUBSPOT_SECRET_KEY and have an administrator paste a key here.'
  }

  return (
    <Card
      padding={4}
      radius={2}
      border
      tone={connection.status === 'connected' ? 'positive' : 'caution'}
    >
      <Stack gap={4}>
        <Heading size={1} as="h2">
          Connection
        </Heading>
        <Text size={1}>{summary}</Text>
        {canSaveKey && (
          <Flex gap={2}>
            <Box flex={1}>
              <TextInput
                type="password"
                autoComplete="off"
                placeholder="pat-na1-…"
                value={key}
                onChange={(event) => setKey(event.currentTarget.value)}
              />
            </Box>
            <Button
              text={connection.status === 'connected' ? 'Replace key' : 'Save key'}
              tone="primary"
              disabled={key.trim() === '' || saving}
              loading={saving}
              onClick={save}
            />
          </Flex>
        )}
        {canSaveKey &&
          connection.status !== 'not-connected' &&
          'source' in connection &&
          connection.source === 'studio' && (
            <Box>
              <Button
                text="Remove key"
                mode="ghost"
                tone="critical"
                disabled={saving}
                onClick={remove}
              />
            </Box>
          )}
      </Stack>
    </Card>
  )
}

interface ToolState {
  connection?: HubSpotConnection
  forms?: HubSpotFormDefinition[]
  copies?: CopyFacts[]
  failure?: string
}

/**
 * The HubSpot tab: the connection, the forms in use that need attention, and every form with
 * the documents it is on. Opening it brings the copies up to date; Refresh copies them all.
 */
export function HubSpotTool({config}: {config: HubSpotPluginConfig}) {
  const client = useClient({apiVersion: API_VERSION})
  const route = useRoute(config.api)
  const toast = useToast()
  const [state, setState] = useState<ToolState>({})
  const [syncing, setSyncing] = useState(true)

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
          client.fetch<CopyFacts[]>(COPIES, {type: FORM_COPY_TYPE}),
        ])
        const result = await syncCopies(client, route, forms, copies, all)
        const fresh =
          result.written + result.archived > 0
            ? await client.fetch<CopyFacts[]>(COPIES, {type: FORM_COPY_TYPE})
            : copies
        setState({connection, forms, copies: fresh})
        if (result.failed > 0)
          toast.push({
            status: 'warning',
            title: `${result.failed} form ${result.failed === 1 ? 'copy' : 'copies'} couldn’t be updated`,
            description: 'Your role may not allow writing documents.',
          })
        else if (all) toast.push({status: 'success', title: 'Every form copy is up to date'})
      } catch (error) {
        setState((current) => ({...current, failure: failureText(error, config.api)}))
      } finally {
        setSyncing(false)
      }
    },
    [client, config.api, route, toast],
  )

  // Opening the tab brings the copies up to date. Every state change in `load` follows an await.
  useEffect(() => {
    const run = async () => {
      await load()
    }
    void run()
  }, [load])

  const rows = useMemo(() => {
    const copies = new Map((state.copies ?? []).map((copy) => [copy.formId, copy]))
    const listed = (state.forms ?? []).map((form) => {
      const copy = copies.get(form.formId)
      return {
        formId: form.formId,
        name: form.name,
        facts: {...form, archived: false},
        updatedAt: form.updatedAt,
        usedOn: dedupe(copy?.usedOn ?? []),
      }
    })
    const listedIds = new Set(listed.map((row) => row.formId))
    const gone = (state.copies ?? [])
      .filter((copy) => !listedIds.has(copy.formId))
      .map((copy) => ({
        formId: copy.formId,
        name: copy.name ?? copy.formId,
        facts: {
          formId: copy.formId,
          archived: copy.archived ?? true,
          drawable: copy.drawable ?? false,
          undrawable: copy.undrawable ?? [],
          progressive: copy.progressive ?? false,
        },
        updatedAt: copy.updatedAt,
        usedOn: dedupe(copy.usedOn),
      }))
    return [...listed, ...gone].toSorted(
      (a, b) => b.usedOn.length - a.usedOn.length || a.name.localeCompare(b.name),
    )
  }, [state.copies, state.forms])

  const attention = rows.filter(
    (row) => row.usedOn.length > 0 && (row.facts.archived || !row.facts.drawable),
  )
  const account = state.connection?.status === 'connected' ? state.connection.account : undefined

  return (
    <Container width={2} padding={4} sizing="border">
      <Stack gap={5}>
        <Flex align="center" gap={3}>
          <Box flex={1}>
            <Heading as="h1" size={2}>
              HubSpot
            </Heading>
          </Box>
          <Button
            text="Refresh all"
            icon={SyncIcon}
            mode="ghost"
            loading={syncing}
            disabled={syncing || !state.forms}
            onClick={() => {
              setSyncing(true)
              void load(true)
            }}
          />
        </Flex>

        {state.failure && (
          <Card tone="critical" padding={4} radius={2} border>
            <Text size={1}>{state.failure}</Text>
          </Card>
        )}
        {!state.connection && !state.failure && (
          <Flex justify="center" padding={5}>
            <Spinner muted />
          </Flex>
        )}
        {state.connection && (
          <ConnectionPanel
            connection={state.connection}
            route={route}
            api={config.api}
            onChanged={() => {
              setSyncing(true)
              void load()
            }}
          />
        )}

        {attention.length > 0 && (
          <Stack gap={3}>
            <Heading as="h2" size={1}>
              Needs attention
            </Heading>
            {attention.map((row) => (
              <Card key={row.formId} padding={4} radius={2} border tone="caution">
                <Stack gap={3}>
                  <Text weight="semibold">{row.name}</Text>
                  <FormStatus form={row.facts} />
                  <UsedOn usage={row.usedOn} />
                </Stack>
              </Card>
            ))}
          </Stack>
        )}

        {state.forms && (
          <Stack gap={3}>
            <Heading as="h2" size={1}>
              Forms
            </Heading>
            {rows.length === 0 && (
              <Text size={1} muted>
                The account has no forms yet.
              </Text>
            )}
            {rows.map((row) => {
              const link = editorUrl(account, row.formId)
              const changed = formatDate(row.updatedAt)
              return (
                <Card key={row.formId} padding={4} radius={2} border>
                  <Stack gap={3}>
                    <Flex align="center" gap={3}>
                      <Box flex={1}>
                        <Stack gap={2}>
                          <Text weight="semibold">{row.name}</Text>
                          {changed && (
                            <Text size={1} muted>
                              Last changed in HubSpot {changed}
                            </Text>
                          )}
                        </Stack>
                      </Box>
                      {row.usedOn.length > 0 && <Badge>In use</Badge>}
                      {link && !row.facts.archived && (
                        <Button
                          as="a"
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          text="Edit in HubSpot"
                          icon={LaunchIcon}
                          mode="bleed"
                          fontSize={1}
                        />
                      )}
                    </Flex>
                    <Inline gap={2}>
                      <FormStatus form={row.facts} />
                    </Inline>
                    <UsedOn usage={row.usedOn} />
                  </Stack>
                </Card>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  )
}

import {ChevronDownIcon} from '@sanity/icons/ChevronDown'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {CopyIcon} from '@sanity/icons/Copy'
import {LaunchIcon} from '@sanity/icons/Launch'
import {SearchIcon} from '@sanity/icons/Search'
import {SyncIcon} from '@sanity/icons/Sync'
import {Badge, Box, Button, Card, Flex, Grid, Stack, Text, TextInput} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {useMemo, useState} from 'react'
import {IntentLink} from 'sanity/router'

import type {HubSpotAccount, HubSpotFormDefinition} from '../../core/model'
import {isSampleFormId} from '../../core/sample'
import {formatDate} from '../copies'
import {FormFields, FormStatus} from '../FormParts'
import {formLinks} from './links'
import {
  countRows,
  FILTERS,
  filterRows,
  firstFilter,
  type FormCounts,
  type FormFilter,
  type FormRow,
  type Usage,
} from './rows'
import {changedSomething, formatTime, runSummary, type SyncRun} from './runs'

/** How many rows show before "Show more": an account can hold hundreds of forms. */
const PAGE = 50

function Tile({
  title,
  value,
  note,
  caution,
}: {
  title: string
  value: number
  note?: string
  caution?: boolean
}) {
  return (
    <Card padding={3} radius={2} border tone={caution ? 'caution' : 'default'}>
      <Stack gap={3}>
        <Text size={1} muted>
          {title}
        </Text>
        <Flex align="baseline" gap={2}>
          <Text size={4} weight="medium">
            {value}
          </Text>
          {note && (
            <Text size={1} muted>
              {note}
            </Text>
          )}
        </Flex>
      </Stack>
    </Card>
  )
}

function Tiles({counts}: {counts: FormCounts}) {
  return (
    <Grid gridTemplateColumns={[2, 2, 4]} gap={3}>
      <Tile title="In use" value={counts['in-use']} />
      <Tile title="Needs attention" value={counts.attention} caution={counts.attention > 0} />
      <Tile
        title="Drawn by your site"
        value={counts.drawn}
        note={counts['in-use'] > 0 ? `of ${counts['in-use']} in use` : undefined}
      />
      <Tile title="Not used" value={counts.unused} />
    </Grid>
  )
}

/** The one thing to know about a form before opening its row. */
function RowBadge({row}: {row: FormRow}) {
  if (row.archived)
    return (
      <Badge tone="critical">
        {isSampleFormId(row.formId) ? 'Sample form' : 'Archived in HubSpot'}
      </Badge>
    )
  const used = row.usedOn.length > 0
  if (used && row.copy === 'none') return <Badge tone="caution">Not copied yet</Badge>
  if (!row.drawable) return <Badge tone={used ? 'caution' : 'default'}>HubSpot’s embed</Badge>
  return <Badge tone={used ? 'positive' : 'default'}>Drawn by your site</Badge>
}

const usedText = (count: number): string =>
  count === 0 ? 'Not used' : count === 1 ? '1 document' : `${count} documents`

function Fact({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <Flex gap={3}>
      <Box style={{width: 132, flexShrink: 0}}>
        <Text size={1} muted>
          {label}
        </Text>
      </Box>
      {/* Plain words are set as text; anything else, such as a list of links, sets its own. */}
      <Box flex={1}>
        {typeof children === 'string' ? <Text size={1}>{children}</Text> : children}
      </Box>
    </Flex>
  )
}

function consentText(consent: HubSpotFormDefinition['consent']): string {
  if (consent.type === 'none') return 'None'
  if (consent.type === 'legitimateInterest') return 'Legitimate interest'
  const boxes = consent.checkboxes.length
  const kind = consent.type === 'explicit' ? 'Asks for consent' : 'Consent by sending'
  return boxes === 0
    ? kind
    : `${kind}, ${boxes === 1 ? '1 subscription' : `${boxes} subscriptions`}`
}

function afterText(after: HubSpotFormDefinition['afterSubmit']): string {
  if (after.type === 'message') return 'Shows a thank-you message'
  if (after.type === 'redirect') return `Goes to ${after.url}`
  return 'Nothing set in HubSpot'
}

function copyText(row: FormRow): string {
  const copied = formatDate(row.syncedAt)
  if (row.copy === 'current') return copied ? `Up to date, copied ${copied}` : 'Up to date'
  if (row.copy === 'outdated') return 'Behind: HubSpot changed the form after it was copied'
  return row.usedOn.length > 0
    ? 'Missing, so the site can’t draw the form yet'
    : 'None. One is written when a document uses the form'
}

function UsedOn({usage}: {usage: Usage[]}) {
  if (usage.length === 0) return <Text size={1}>No document yet</Text>
  return (
    <Stack gap={2}>
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

function FormDetail({
  row,
  account,
  onRefresh,
}: {
  row: FormRow
  account: HubSpotAccount | undefined
  onRefresh: (formId: string) => Promise<void>
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const links = row.archived ? undefined : formLinks(account, row.formId)
  const changed = formatDate(row.updatedAt)
  // An unused form has no copy to refresh, and none is written until a document uses it.
  const refreshable = row.copy !== 'none' || row.usedOn.length > 0

  const refresh = async () => {
    setBusy(true)
    try {
      await onRefresh(row.formId)
    } finally {
      setBusy(false)
    }
  }
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(row.formId)
      toast.push({status: 'success', title: 'Form ID copied'})
    } catch {
      toast.push({status: 'error', title: 'The form ID wasn’t copied', description: row.formId})
    }
  }

  return (
    <Stack gap={4}>
      {/* The row's badge already says a form is drawn by the site; this adds why one isn't. */}
      {(row.archived || !row.drawable || row.progressive) && <FormStatus form={row} />}
      <Stack gap={3}>
        {changed && <Fact label="Changed in HubSpot">{changed}</Fact>}
        <Fact label="Copy on the site">{copyText(row)}</Fact>
        {row.form && <Fact label="Consent">{consentText(row.form.consent)}</Fact>}
        {row.form && <Fact label="After sending">{afterText(row.form.afterSubmit)}</Fact>}
        <Fact label="Used on">
          <UsedOn usage={row.usedOn} />
        </Fact>
      </Stack>
      {row.form && <FormFields form={row.form} />}
      <Flex gap={2} wrap="wrap">
        {links && (
          <Button
            as="a"
            href={links.edit}
            target="_blank"
            rel="noreferrer"
            text="Edit in HubSpot"
            icon={LaunchIcon}
            mode="ghost"
            fontSize={1}
          />
        )}
        {links && (
          <Button
            as="a"
            href={links.submissions}
            target="_blank"
            rel="noreferrer"
            text="Submissions in HubSpot"
            icon={LaunchIcon}
            mode="ghost"
            fontSize={1}
          />
        )}
        {refreshable && (
          <Button
            text="Refresh this form"
            icon={SyncIcon}
            mode="ghost"
            fontSize={1}
            loading={busy}
            disabled={busy}
            onClick={() => void refresh()}
          />
        )}
        <Button
          text="Copy form ID"
          icon={CopyIcon}
          mode="ghost"
          fontSize={1}
          onClick={() => void copyId()}
        />
      </Flex>
    </Stack>
  )
}

function Row({
  row,
  first,
  open,
  onToggle,
  account,
  onRefresh,
}: {
  row: FormRow
  first: boolean
  open: boolean
  onToggle: () => void
  account: HubSpotAccount | undefined
  onRefresh: (formId: string) => Promise<void>
}) {
  const detailId = `hubspot-form-${row.formId}`
  return (
    <Card borderTop={!first}>
      <Card
        as="button"
        type="button"
        padding={3}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
        style={{width: '100%', textAlign: 'left'}}
      >
        <Flex align="center" gap={3}>
          <Text size={1} muted>
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </Text>
          {/* On a narrow screen the badge and the count wrap under the name, which keeps its width. */}
          <Box flex={1}>
            <Flex align="center" gap={3} wrap="wrap">
              <Box flex={1} style={{minWidth: 180}}>
                <Text weight="medium" textOverflow="ellipsis">
                  {row.name}
                </Text>
              </Box>
              <Flex align="center" gap={3}>
                <RowBadge row={row} />
                <Box style={{minWidth: 96}}>
                  <Text size={1} muted align="right">
                    {usedText(row.usedOn.length)}
                  </Text>
                </Box>
              </Flex>
            </Flex>
          </Box>
        </Flex>
      </Card>
      {open && (
        <Box id={detailId} padding={4} paddingTop={2}>
          <FormDetail row={row} account={account} onRefresh={onRefresh} />
        </Box>
      )}
    </Card>
  )
}

/** What the last refresh changed, with the copies it couldn't write and a way to try again. */
function LastRun({run, busy, onRetry}: {run: SyncRun; busy: boolean; onRetry: () => void}) {
  const failed = run.result.changes.filter((change) => change.outcome === 'failed')
  const at = formatTime(run.at)
  return (
    <Card padding={3} radius={2} border tone={failed.length > 0 ? 'caution' : 'positive'}>
      <Flex align="center" gap={3}>
        <Box flex={1}>
          <Stack gap={3}>
            <Text size={1}>
              {at ? `Refreshed at ${at}: ` : 'Refreshed: '}
              {runSummary(run.result)}
            </Text>
            {failed.length > 0 && (
              <Text size={1} muted>
                Not written: {failed.map((change) => change.name ?? change.formId).join(', ')}. Your
                role may not allow writing documents.
              </Text>
            )}
          </Stack>
        </Box>
        {failed.length > 0 && (
          <Button
            text="Try again"
            mode="ghost"
            fontSize={1}
            loading={busy}
            disabled={busy}
            onClick={onRetry}
          />
        )}
      </Flex>
    </Card>
  )
}

export interface FormsPanelProps {
  rows: FormRow[]
  account: HubSpotAccount | undefined
  /** The latest refresh, shown when it changed something. */
  lastRun: SyncRun | undefined
  busy: boolean
  /** Reads one form from HubSpot again and rewrites its copy. */
  onRefreshForm: (formId: string) => Promise<void>
  /** Refreshes the copies that are behind once more. */
  onRetry: () => void
}

/**
 * The tab's forms: how many are in use and need attention, then every form in the account,
 * searchable, each opening to its fields, its copy and the documents it is on.
 */
export function FormsPanel({
  rows,
  account,
  lastRun,
  busy,
  onRefreshForm,
  onRetry,
}: FormsPanelProps) {
  const counts = useMemo(() => countRows(rows), [rows])
  const [chosen, setChosen] = useState<FormFilter>()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string>()
  const [limit, setLimit] = useState(PAGE)
  const filter = chosen ?? firstFilter(counts)
  const found = useMemo(() => filterRows(rows, filter, query), [rows, filter, query])
  const shown = found.slice(0, limit)

  return (
    <Stack gap={4}>
      {lastRun && changedSomething(lastRun.result) && (
        <LastRun run={lastRun} busy={busy} onRetry={onRetry} />
      )}
      <Tiles counts={counts} />
      <Stack gap={3}>
        <TextInput
          icon={SearchIcon}
          placeholder={counts.all === 1 ? 'Search 1 form' : `Search ${counts.all} forms`}
          value={query}
          clearButton={query !== ''}
          onClear={() => setQuery('')}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setLimit(PAGE)
          }}
        />
        <Flex gap={1} wrap="wrap">
          {FILTERS.map(({value, title}) => (
            <Button
              key={value}
              text={`${title} ${counts[value]}`}
              mode="bleed"
              fontSize={1}
              padding={2}
              selected={filter === value}
              aria-pressed={filter === value}
              onClick={() => {
                setChosen(value)
                setLimit(PAGE)
              }}
            />
          ))}
        </Flex>
      </Stack>
      {found.length === 0 ? (
        <Card padding={4} radius={2} border tone="transparent">
          <Text size={1} muted align="center">
            {rows.length === 0
              ? 'The account has no forms yet.'
              : query.trim() === ''
                ? 'No form here.'
                : 'No form has that in its name or ID.'}
          </Text>
        </Card>
      ) : (
        <Card radius={2} border overflow="hidden">
          {shown.map((row, index) => (
            <Row
              key={row.formId}
              row={row}
              first={index === 0}
              open={open === row.formId}
              onToggle={() =>
                setOpen((current) => (current === row.formId ? undefined : row.formId))
              }
              account={account}
              onRefresh={onRefreshForm}
            />
          ))}
        </Card>
      )}
      {found.length > shown.length && (
        <Flex justify="center">
          <Button
            text={`Show ${Math.min(PAGE, found.length - shown.length)} more`}
            mode="ghost"
            fontSize={1}
            onClick={() => setLimit((current) => current + PAGE)}
          />
        </Flex>
      )}
    </Stack>
  )
}

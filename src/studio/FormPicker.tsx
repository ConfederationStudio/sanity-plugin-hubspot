import {SearchIcon} from '@sanity/icons/Search'
import {Box, Card, Dialog, Flex, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {useEffect, useMemo, useState} from 'react'

import {fitsFields} from '../core/drawable'
import type {HubSpotFormDefinition} from '../core/model'
import {summarize} from '../core/parse'
import {formatDate} from './copies'
import {FitStatus, FormStatus} from './FormParts'
import {failureText, type RouteClient} from './route'

type Load =
  | {status: 'loading'}
  | {status: 'failed'; message: string}
  | {status: 'ready'; forms: HubSpotFormDefinition[]}

export interface FormPickerProps {
  route: RouteClient
  api: string
  /** The properties the site's own form sends, from the field's `draws` option. */
  draws?: readonly string[]
  onPick: (form: HubSpotFormDefinition) => void
  onClose: () => void
}

/** Every form in the account, searchable by name, each with whether the site can draw it. */
export function FormPicker({route, api, draws, onPick, onClose}: FormPickerProps) {
  const [load, setLoad] = useState<Load>({status: 'loading'})
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    const run = async () => {
      try {
        const {forms} = await route.forms()
        if (live)
          setLoad({status: 'ready', forms: forms.toSorted((a, b) => a.name.localeCompare(b.name))})
      } catch (error) {
        if (live) setLoad({status: 'failed', message: failureText(error, api)})
      }
    }
    void run()
    return () => {
      live = false
    }
  }, [route, api])

  const shown = useMemo(() => {
    if (load.status !== 'ready') return []
    const words = query.trim().toLowerCase()
    return words ? load.forms.filter((form) => form.name.toLowerCase().includes(words)) : load.forms
  }, [load, query])

  return (
    <Dialog id="hubspot-form-picker" header="Choose a HubSpot form" onClose={onClose} width={1}>
      <Box padding={4}>
        <Stack gap={3}>
          <TextInput
            icon={SearchIcon}
            placeholder="Search by name"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            autoFocus
          />
          {load.status === 'loading' && (
            <Flex justify="center" padding={4}>
              <Spinner muted />
            </Flex>
          )}
          {load.status === 'failed' && (
            <Card tone="critical" padding={3} radius={2} border>
              <Text size={1}>{load.message}</Text>
            </Card>
          )}
          {load.status === 'ready' && shown.length === 0 && (
            <Text size={1} muted>
              {load.forms.length === 0
                ? 'The account has no forms yet.'
                : 'No form has that in its name.'}
            </Text>
          )}
          <Stack gap={1}>
            {shown.map((form) => {
              const summary = summarize(form)
              const changed = formatDate(form.updatedAt)
              return (
                <Card
                  key={form.formId}
                  as="button"
                  type="button"
                  padding={3}
                  radius={2}
                  onClick={() => onPick(form)}
                  style={{textAlign: 'left', width: '100%'}}
                >
                  <Stack gap={3}>
                    <Text weight="semibold">{form.name}</Text>
                    <Text size={1} muted>
                      {summary.fieldCount === 1 ? '1 field' : `${summary.fieldCount} fields`}
                      {changed && ` · changed ${changed}`}
                    </Text>
                    <FormStatus form={form} />
                    {draws && draws.length > 0 && (
                      <FitStatus fit={fitsFields(form.groups, draws)} />
                    )}
                  </Stack>
                </Card>
              )
            })}
          </Stack>
        </Stack>
      </Box>
    </Dialog>
  )
}

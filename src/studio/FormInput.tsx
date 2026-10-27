import {SearchIcon} from '@sanity/icons/Search'
import {SyncIcon} from '@sanity/icons/Sync'
import {TrashIcon} from '@sanity/icons/Trash'
import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {useCallback, useEffect, useState} from 'react'
import {set, unset, useClient, type ObjectInputProps} from 'sanity'

import {fitsFields} from '../core/drawable'
import {formCopyId} from '../core/ids'
import type {HubSpotFormDefinition} from '../core/model'
import {API_VERSION, type HubSpotPluginConfig} from './config'
import {
  copyDocument,
  fieldValue,
  formatDate,
  markArchived,
  writeCopy,
  type HubSpotFormCopy,
  type HubSpotFormValue,
} from './copies'
import {FitStatus, FormFields, FormStatus} from './FormParts'
import {FormPicker} from './FormPicker'
import {failureText, useRoute} from './route'

/** The field's `draws` option, read without trusting its shape. */
function readDraws(options: unknown): string[] | undefined {
  if (typeof options !== 'object' || options === null || !('draws' in options)) return undefined
  const {draws} = options
  return Array.isArray(draws)
    ? draws.filter((name): name is string => typeof name === 'string')
    : undefined
}

export type FormInputProps = ObjectInputProps<HubSpotFormValue> & {config: HubSpotPluginConfig}

/**
 * The `hubspot.form` field: the picked form, whether the site can draw it, and its fields. A
 * pick writes the form's copy as the editor, then saves the field; when the editor's role can't
 * write the copy, the pick is still saved, and the HubSpot tab writes the copy later.
 */
export function FormInput(props: FormInputProps) {
  const {value, onChange, readOnly, config, schemaType} = props
  const client = useClient({apiVersion: API_VERSION})
  const route = useRoute(config.api)
  const toast = useToast()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  // The copy is kept with the form it belongs to, so a change of form never shows the last one.
  const [loaded, setLoaded] = useState<{formId: string; copy: HubSpotFormCopy | null} | null>(null)
  const formId = value?.formId
  const name = value?.name
  const copy = formId && loaded?.formId === formId ? loaded.copy : null
  const setCopy = useCallback(
    (next: HubSpotFormCopy | null) => {
      if (formId) setLoaded({formId, copy: next})
    },
    [formId],
  )
  const draws = readDraws(schemaType.options)

  useEffect(() => {
    if (!formId) return undefined
    let live = true
    const run = async () => {
      const document = await client
        .fetch<HubSpotFormCopy | null>('*[_id == $id][0]', {id: formCopyId(formId)})
        .catch(() => null)
      if (live) setLoaded({formId, copy: document})
    }
    void run()
    return () => {
      live = false
    }
  }, [client, formId])

  const keep = useCallback(
    async (form: HubSpotFormDefinition) => {
      try {
        await writeCopy(client, form)
        setLoaded({formId: form.formId, copy: copyDocument(form)})
        return true
      } catch {
        toast.push({
          status: 'warning',
          title: 'Form chosen, but not copied',
          description:
            'Your role can’t write the form’s copy, so the site can’t draw it yet. Someone who can create documents can open the HubSpot tab to copy it.',
        })
        return false
      }
    },
    [client, toast],
  )

  const pick = useCallback(
    async (form: HubSpotFormDefinition) => {
      setPicking(false)
      await keep(form)
      onChange(set(fieldValue(form)))
    },
    [keep, onChange],
  )

  const refresh = useCallback(async () => {
    if (!formId) return
    setBusy(true)
    try {
      const {form} = await route.form(formId)
      if (form) {
        if (await keep(form)) toast.push({status: 'success', title: 'Form refreshed from HubSpot'})
        if (form.name !== name) onChange(set(form.name, ['name']))
      } else {
        await markArchived(client, formId).catch(() => undefined)
        if (copy) setCopy({...copy, archived: true})
        toast.push({status: 'warning', title: 'HubSpot no longer has this form'})
      }
    } catch (error) {
      toast.push({
        status: 'error',
        title: 'Couldn’t refresh the form',
        description: failureText(error, config.api),
      })
    } finally {
      setBusy(false)
    }
  }, [client, config.api, copy, formId, keep, name, onChange, route, setCopy, toast])

  const changed = formatDate(copy?.updatedAt)

  return (
    <Stack gap={3}>
      {formId ? (
        <Card padding={3} radius={2} border tone={copy?.archived ? 'critical' : 'default'}>
          <Stack gap={4}>
            <Flex align="center" gap={2}>
              <Box flex={1}>
                <Stack gap={2}>
                  <Text weight="semibold">{name ?? copy?.name ?? 'Untitled form'}</Text>
                  <Text size={1} muted>
                    {copy
                      ? changed
                        ? `Last changed in HubSpot ${changed}`
                        : 'HubSpot form'
                      : 'Not copied yet'}
                  </Text>
                </Stack>
              </Box>
              <Button
                text="Change"
                mode="ghost"
                fontSize={1}
                disabled={readOnly}
                onClick={() => setPicking(true)}
              />
              <Button
                icon={SyncIcon}
                mode="bleed"
                title="Refresh from HubSpot"
                aria-label="Refresh from HubSpot"
                loading={busy}
                disabled={readOnly}
                onClick={refresh}
              />
              <Button
                icon={TrashIcon}
                mode="bleed"
                tone="critical"
                title="Remove the form"
                aria-label="Remove the form"
                disabled={readOnly}
                onClick={() => onChange(unset())}
              />
            </Flex>
            {copy && <FormStatus form={copy} />}
            {copy && draws && draws.length > 0 && (
              <FitStatus fit={fitsFields(copy.groups, draws)} />
            )}
            {copy && <FormFields form={copy} />}
          </Stack>
        </Card>
      ) : (
        <Card padding={3} radius={2} border tone="transparent">
          <Flex align="center" justify="space-between" gap={3}>
            <Text size={1} muted>
              No form chosen
            </Text>
            <Button
              text="Choose a form"
              icon={SearchIcon}
              mode="ghost"
              disabled={readOnly}
              onClick={() => setPicking(true)}
            />
          </Flex>
        </Card>
      )}
      {picking && (
        <FormPicker
          route={route}
          api={config.api}
          draws={draws}
          onPick={pick}
          onClose={() => setPicking(false)}
        />
      )}
    </Stack>
  )
}

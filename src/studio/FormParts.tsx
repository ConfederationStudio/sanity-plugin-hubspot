import {Badge, Box, Card, Flex, Inline, Stack, Text} from '@sanity/ui'

import type {HubSpotFit} from '../core/drawable'
import type {HubSpotField, HubSpotFormDefinition} from '../core/model'
import {UNDRAWABLE_TEXT} from './copies'

type FormFacts = Pick<HubSpotFormDefinition, 'drawable' | 'undrawable' | 'progressive'> & {
  archived?: boolean
}

/** Whether HubSpot still has the form, and whether the site can draw it. */
export function FormStatus({form}: {form: FormFacts}) {
  return (
    <Stack gap={2}>
      <Inline gap={2}>
        {form.archived && <Badge tone="critical">Archived in HubSpot</Badge>}
        {form.drawable ? (
          <Badge tone="positive">Drawn by your site</Badge>
        ) : (
          <Badge tone="caution">Shown with HubSpot’s embed</Badge>
        )}
      </Inline>
      {!form.drawable && form.undrawable.length > 0 && (
        <Text size={1} muted>
          The site can’t draw it because{' '}
          {form.undrawable.map((reason) => UNDRAWABLE_TEXT[reason]).join('; ')}.
        </Text>
      )}
      {form.progressive && (
        <Text size={1} muted>
          Its progressive fields show in HubSpot’s embed only; the site leaves them out.
        </Text>
      )}
    </Stack>
  )
}

/** Whether a form takes what the site's own form sends (the field's `draws` option). */
export function FitStatus({fit}: {fit: HubSpotFit}) {
  if (fit.fits) return <Badge tone="positive">Takes what this field’s form sends</Badge>
  const parts = [
    fit.missing.length > 0 && `has no ${fit.missing.join(', ')}`,
    fit.unsent.length > 0 && `also requires ${fit.unsent.join(', ')}`,
  ].filter(Boolean)
  return (
    <Text size={1} muted>
      <Badge tone="caution">Doesn’t fit</Badge> This form {parts.join(' and ')}.
    </Text>
  )
}

const KIND: Record<HubSpotField['type'], string> = {
  text: 'Text',
  email: 'Email',
  tel: 'Phone',
  number: 'Number',
  date: 'Date',
  textarea: 'Long text',
  select: 'Dropdown',
  radio: 'Choice',
  checkboxes: 'Checkboxes',
  checkbox: 'Checkbox',
  file: 'File',
  payment: 'Payment',
  unknown: 'Unknown',
}

/** The form's fields as a table, follow-ups under the field that shows them. */
export function FormFields({form}: {form: Pick<HubSpotFormDefinition, 'groups'>}) {
  const rows: {key: string; field: HubSpotField; depth: number}[] = []
  const walk = (field: HubSpotField, key: string, depth: number) => {
    rows.push({key, field, depth})
    for (const followUp of field.followUps)
      walk(followUp.field, `${key}-${followUp._key}`, depth + 1)
  }
  for (const group of form.groups)
    for (const field of group.fields) walk(field, `${group._key}-${field._key}`, 0)
  if (rows.length === 0) return null

  return (
    <Card radius={2} border>
      <Stack>
        {rows.map(({key, field, depth}) => (
          <Card key={key} borderTop={key !== rows[0]?.key} paddingX={3} paddingY={2}>
            <Flex gap={3} align="center">
              <Box flex={1} style={{paddingLeft: depth * 16}}>
                <Text size={1} muted={field.hidden}>
                  {depth > 0 && '↳ '}
                  {field.label}
                  {field.hidden && ' (hidden)'}
                </Text>
              </Box>
              <Text size={1} muted>
                {KIND[field.type]}
              </Text>
              <Box style={{minWidth: 64}}>
                <Text size={1} muted align="right">
                  {field.required ? 'Required' : ''}
                </Text>
              </Box>
            </Flex>
          </Card>
        ))}
      </Stack>
    </Card>
  )
}

import {EnvelopeIcon} from '@sanity/icons/Envelope'
import {definePlugin} from 'sanity'

import {FORM_COPY_TYPE} from '../core/ids'
import {checkConfig, type HubSpotPluginConfig} from './config'
import {HubSpotTool} from './HubSpotTool'
import {copyTypes} from './schema/copy'
import {fieldTypes} from './schema/fields'

/**
 * HubSpot forms, page content types and live chat for the Studio:
 *
 * ```ts
 * plugins: [hubspot({api: 'https://www.example.com/api/hubspot'})]
 * ```
 */
export const hubspot = definePlugin<HubSpotPluginConfig>((options) => {
  const config = checkConfig(options)
  const tool = typeof config.tool === 'object' ? config.tool : {}
  return {
    name: 'sanity-plugin-hubspot',
    schema: {types: [...fieldTypes(config), ...copyTypes]},
    tools:
      config.tool === false
        ? []
        : [
            {
              name: tool.name ?? 'hubspot',
              title: tool.title ?? 'HubSpot',
              icon: EnvelopeIcon,
              component: () => <HubSpotTool config={config} />,
            },
          ],
    document: {
      // Copies are written by the plugin alone.
      newDocumentOptions: (previous) =>
        previous.filter((option) => option.templateId !== FORM_COPY_TYPE),
      actions: (previous, context) =>
        context.schemaType === FORM_COPY_TYPE
          ? previous.filter((action) => action.action === 'delete')
          : previous,
    },
  }
})

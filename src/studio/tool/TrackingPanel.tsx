import {Box, Card, Flex, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {useEffect, useMemo, useState} from 'react'
import {useClient, useSchema} from 'sanity'
import {IntentLink} from 'sanity/router'

import {API_VERSION, type HubSpotPluginConfig} from '../config'
import type {Usage} from './rows'
import {
  contentTypeTitle,
  pagesQuery,
  pageTypes,
  trackingOverview,
  type PageFacts,
  type TrackingOverview,
} from './tracking'

function Pages({
  title,
  empty,
  pages,
  note,
}: {
  title: string
  empty: string
  pages: readonly Usage[]
  note?: (page: Usage) => string | undefined
}) {
  return (
    <Stack gap={3}>
      <Heading as="h2" size={1}>
        {title}
      </Heading>
      {pages.length === 0 ? (
        <Text size={1} muted>
          {empty}
        </Text>
      ) : (
        <Card radius={2} border overflow="hidden">
          {pages.map((page, index) => (
            <Card key={page._id} borderTop={index > 0} paddingX={3} paddingY={3}>
              <Flex gap={3} align="center">
                <Box flex={1}>
                  <Text size={1} textOverflow="ellipsis">
                    <IntentLink intent="edit" params={{id: page._id, type: page._type}}>
                      {page.title ?? page._id}
                    </IntentLink>
                  </Text>
                </Box>
                {note?.(page) && (
                  <Text size={1} muted>
                    {note(page)}
                  </Text>
                )}
              </Flex>
            </Card>
          ))}
        </Card>
      )}
    </Stack>
  )
}

type Load = {status: 'loading'} | {status: 'failed'} | {status: 'ready'; overview: TrackingOverview}

/**
 * How HubSpot files each kind of page, and the pages an editor set apart: those with a content
 * type of their own, and those that hide chat.
 */
export function TrackingPanel({config}: {config: HubSpotPluginConfig}) {
  const client = useClient({apiVersion: API_VERSION})
  const schema = useSchema()
  const types = useMemo(() => pageTypes(schema, config.contentTypes), [schema, config.contentTypes])
  const query = useMemo(() => pagesQuery(types), [types])
  const [load, setLoad] = useState<Load>({status: 'loading'})

  useEffect(() => {
    let live = true
    const run = async () => {
      try {
        const pages = query ? await client.fetch<PageFacts[]>(query) : []
        if (live) setLoad({status: 'ready', overview: trackingOverview(pages)})
      } catch {
        if (live) setLoad({status: 'failed'})
      }
    }
    void run()
    return () => {
      live = false
    }
  }, [client, query])

  const contentTypes = useMemo(() => {
    const byId = new Map<string, string>()
    if (load.status === 'ready')
      for (const page of load.overview.overrides)
        byId.set(page._id, contentTypeTitle(page.contentType))
    return byId
  }, [load])

  return (
    <Stack gap={5}>
      <Stack gap={3}>
        <Heading as="h2" size={1}>
          Content types
        </Heading>
        <Text size={1} muted>
          How HubSpot’s reports file each kind of page, from the plugin’s contentTypes option. The
          site’s tracker reads the same map.
        </Text>
        {types.length === 0 ? (
          <Text size={1} muted>
            No document type is mapped yet, and none has a hubspot.page field, so HubSpot decides
            how to file every page.
          </Text>
        ) : (
          <Card radius={2} border overflow="hidden">
            {types.map((type, index) => (
              <Card key={type.type} borderTop={index > 0} paddingX={3} paddingY={3}>
                <Flex gap={3} align="center">
                  <Box flex={1}>
                    <Text size={1} weight="medium">
                      {type.title}
                    </Text>
                  </Box>
                  <Text size={1} muted>
                    {contentTypeTitle(type.mapped)}
                    {type.field ? ', unless a page says otherwise' : ''}
                  </Text>
                </Flex>
              </Card>
            ))}
          </Card>
        )}
      </Stack>

      {load.status === 'loading' && (
        <Flex justify="center" padding={4}>
          <Spinner muted />
        </Flex>
      )}
      {load.status === 'failed' && (
        <Card tone="critical" padding={3} radius={2} border>
          <Text size={1}>The pages couldn’t be read. Try opening the tab again.</Text>
        </Card>
      )}
      {load.status === 'ready' && (
        <>
          <Pages
            title="Pages with a content type of their own"
            empty="No page overrides its document type’s content type."
            pages={load.overview.overrides}
            note={(page) => contentTypes.get(page._id)}
          />
          <Pages
            title="Pages that hide chat"
            empty="Chat shows on every page."
            pages={load.overview.chatHidden}
          />
        </>
      )}
    </Stack>
  )
}

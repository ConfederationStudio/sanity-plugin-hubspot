import {
  PortableText,
  type PortableTextComponents,
  type PortableTextMarkComponentProps,
} from '@portabletext/react'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {HubSpotChatEmbed, HubSpotChatLink, HubSpotForm} from 'sanity-plugin-hubspot/react'
import {resolveContentType} from 'sanity-plugin-hubspot/server'

import {client, PAGE_QUERY, type FormValue, type Page} from '../../../lib/sanity'
import {sendForm} from '../actions'
import {HubSpot} from '../HubSpot'
import {Newsletter} from '../Newsletter'

export const dynamic = 'force-dynamic'

// The same map as the Studio's `contentTypes` option.
const CONTENT_TYPES = {page: 'standard-page', post: 'blog-post'}

const components: PortableTextComponents = {
  types: {
    'hubspot.form': ({value}: {value: FormValue}) => <HubSpotForm form={value.definition} />,
    'hubspot.chat': ({value}: {value: {title?: string}}) => (
      <aside>
        {value.title && <h3>{value.title}</h3>}
        <HubSpotChatEmbed />
      </aside>
    ),
  },
  marks: {
    'hubspot.openChat': ({
      value,
      children,
    }: PortableTextMarkComponentProps<{_type: 'hubspot.openChat'; fallbackUrl?: string}>) => (
      <HubSpotChatLink fallbackUrl={value?.fallbackUrl}>{children}</HubSpotChatLink>
    ),
  },
}

export default async function PageRoute({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const page = await client.fetch<Page | null>(PAGE_QUERY, {slug})
  if (!page) notFound()

  const contentType = resolveContentType(page.hubspot?.contentType, page._type, CONTENT_TYPES)
  const inlineChat = page.body?.some((block) => block._type === 'hubspot.chat') ?? false
  return (
    <>
      <HubSpot
        contentType={contentType}
        hideChat={page.hubspot?.hideChat}
        inlineChat={inlineChat}
      />
      <p>
        <Link href="/">All pages</Link>
      </p>
      <h1>{page.title}</h1>
      <p data-content-type={contentType ?? ''}>
        HubSpot files this page as: {contentType ?? 'left to HubSpot'}
        {page.hubspot?.hideChat ? ' · chat hidden' : ''}
      </p>

      {page.form && (
        <section>
          <h2>Form ({page.form.name}), sent from the server</h2>
          {page.form.definition ? (
            <HubSpotForm form={page.form.definition} action={sendForm} />
          ) : (
            <p role="alert">The form has no copy yet. Open the Studio’s HubSpot tab.</p>
          )}
        </section>
      )}

      {page.newsletter?.definition && (
        <section>
          <h2>Newsletter ({page.newsletter.name}), the site’s own field</h2>
          <Newsletter form={page.newsletter.definition} />
        </section>
      )}

      {page.body && (
        <section>
          <h2>Body, forms sent from the browser</h2>
          <PortableText value={page.body} components={components} />
        </section>
      )}
    </>
  )
}

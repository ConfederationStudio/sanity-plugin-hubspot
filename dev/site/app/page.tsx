import Link from 'next/link'

import {client, PAGES_QUERY, type PageListItem} from '../lib/sanity'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const pages = await client.fetch<PageListItem[]>(PAGES_QUERY)
  return (
    <>
      <h1>HubSpot plugin test site</h1>
      {pages.length === 0 ? (
        <p>No pages yet. Make one in the Studio at http://localhost:3333 and publish it.</p>
      ) : (
        <ul>
          {pages.map((page) => (
            <li key={page.slug}>
              <Link href={`/${page.slug}`}>{page.title}</Link> ({page._type})
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

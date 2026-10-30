import type {ReactNode} from 'react'

import {ConsentProvider} from './Consent'

import './styles.css'

export const metadata = {title: 'HubSpot plugin test site'}

export default function Layout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        <ConsentProvider>
          <main>{children}</main>
        </ConsentProvider>
      </body>
    </html>
  )
}

import type {ReactNode} from 'react'

import './styles.css'

export const metadata = {title: 'HubSpot plugin test site'}

export default function Layout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}

import type {ReactNode} from 'react'

/** The Studio's own page, without the site's styles and consent bar. */
export default function StudioLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body style={{margin: 0}}>{children}</body>
    </html>
  )
}

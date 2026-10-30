import {NextStudio} from 'next-sanity/studio'

import config from '../config'

export const dynamic = 'force-static'
export {metadata, viewport} from 'next-sanity/studio'

/** The test Studio inside the site: the route's same-domain case. */
export default function StudioPage() {
  return <NextStudio config={config} />
}

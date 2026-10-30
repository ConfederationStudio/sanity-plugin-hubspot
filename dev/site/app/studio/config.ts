'use client'

import {testStudio} from 'hubspot-test-studio/config'

// The route is on this domain, so it needs no origin for this Studio.
export default testStudio({api: '/api/hubspot', basePath: '/studio'})

import {defineCliConfig} from 'sanity/cli'

import {dataset, projectId} from './env'

export default defineCliConfig({
  api: {projectId, dataset},
  server: {port: 3333},
  // https://confederation-hubspot-test.sanity.studio
  deployment: {appId: 'b6w0acssoj9iu35uacbxj7fp'},
})

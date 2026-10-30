import type {NextConfig} from 'next'

const config: NextConfig = {
  // The Studio at /studio shares the test Studio's config, which is TypeScript source.
  transpilePackages: ['hubspot-test-studio'],
  turbopack: {
    // The workspace links the plugin and the test Studio, each with its own copy of sanity, and a
    // Studio works only with one. A site that installs the plugin from npm has one already.
    resolveAlias: {
      'sanity': './node_modules/sanity/lib/index.js',
      'sanity/router': './node_modules/sanity/lib/router.js',
      'sanity/structure': './node_modules/sanity/lib/structure.js',
    },
  },
}

export default config

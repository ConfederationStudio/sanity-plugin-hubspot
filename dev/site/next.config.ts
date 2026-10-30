import type {NextConfig} from 'next'

const config: NextConfig = {
  // The Studio at /studio shares the test Studio's config, which is TypeScript source.
  transpilePackages: ['hubspot-test-studio'],
}

export default config

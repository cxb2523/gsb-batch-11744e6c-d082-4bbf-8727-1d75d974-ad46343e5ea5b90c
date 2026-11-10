import { createRequire } from 'node:module'
import nextra from 'nextra'

const require = createRequire(import.meta.url)

const withNextra = nextra({
  defaultShowCopyCode: true,
})

export default withNextra({
  output: 'export',
  // served at tryquickdraw.com/docs via a proxy route on the main site
  basePath: '/docs',
  trailingSlash: true,
  images: { unoptimized: true },
  webpack(config) {
    // zod >= 4.4 broke nextra-theme-docs' prop schemas (z.custom now rejects
    // undefined). Resolve every zod import to this app's pinned 4.1.12.
    config.resolve.alias.zod = require.resolve('zod')
    return config
  },
})

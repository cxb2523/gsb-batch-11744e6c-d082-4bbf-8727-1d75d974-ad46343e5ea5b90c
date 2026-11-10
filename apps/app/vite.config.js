import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Build against the engine in this repo, not the published copy: Vercel
// installs this folder on its own, which would otherwise pull whatever
// @quickdrawjs/core is on npm. The hosted app always tracks main.
const core = fileURLToPath(new URL('../../packages/core/src/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@quickdrawjs\/core$/, replacement: core + 'index.js' },
      { find: /^@quickdrawjs\/core\/(quickdraw|styles)\.css$/, replacement: core + 'quickdraw.css' },
    ],
  },
})

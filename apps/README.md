# apps

Deployable surfaces, not published packages:

- `website/` — [tryquickdraw.com](https://tryquickdraw.com): Astro static site and blog. The hero embeds the real SDK.
- `docs/` — [tryquickdraw.com/docs](https://tryquickdraw.com/docs/): Nextra (Next.js) documentation site, statically exported with `basePath: /docs` and proxied under the main domain.
- `app/` — [the hosted whiteboard](https://app.tryquickdraw.com): a thin Vite wrapper around `@quickdrawjs/core` with localStorage persistence.

All consume the engine from the workspace, so they always track `main`.

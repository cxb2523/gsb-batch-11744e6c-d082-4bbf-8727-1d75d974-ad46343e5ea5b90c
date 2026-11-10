// Reads the star-history snapshot that CI commits to docs/star-history.json.
//
// The build doesn't call GitHub itself: the stargazers API requires a token,
// and a token doesn't belong in a static site build. `scripts/star-history.mjs`
// refreshes the snapshot nightly, and the browser tops it up from raw
// .githubusercontent.com so a stale deploy still draws today's line.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EMPTY = { stars: 0, createdAt: null, starredAt: [], generatedAt: null }

export function readStarHistory() {
  // Resolved from this file so it doesn't matter where the build is invoked.
  const path = fileURLToPath(new URL('../../../../docs/star-history.json', import.meta.url))
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return {
      stars: data.stars ?? 0,
      createdAt: data.createdAt ?? null,
      starredAt: Array.isArray(data.starredAt) ? data.starredAt : [],
      generatedAt: data.generatedAt ?? null,
    }
  } catch (err) {
    console.warn(
      `[star-history] no snapshot at docs/star-history.json (${err.code ?? err.message}) — ` +
        'the chart will fill in from the browser. Run `npm run star-history` to seed it.',
    )
    return EMPTY
  }
}

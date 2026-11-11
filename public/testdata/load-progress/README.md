# getLoadProgress() verification assets

These files support the loading-progress feature (`SplatMesh.getLoadProgress()` /
`Reall3dViewer.getLoadProgress()`).

## Data samples

- `load-progress-test.splat` — a valid, tiny 3DGS `.splat` file: **1000 points × 32 bytes = 32000 bytes**.
  Regenerate with `npm run make-test-splat` (script: `scripts/make-test-splat.mjs`).
- `invalid-test.splat` — 12 bytes, smaller than one Gaussian record, so the loader marks it `Invalid`.
- `does-not-exist.splat` — intentionally absent; a real static server returns 404 and the loader
  reports `FetchFailed`. (The Vite dev server uses an SPA fallback that serves HTML instead, which
  yields `Invalid`; use the strict static server below to observe the genuine 404 → `FetchFailed` path.)

## Pages (served by `npm run dev`)

- `/load-progress.html` — interactive panel. Buttons drive the normal, missing-URL, invalid,
  fetchLimit-abort and dispose paths. Every snapshot is rendered on screen and validated.
  Console entry point: `window.loadProgressDemo` (`snapshot()`, `loadNormal()`, `loadFail()`,
  `loadInvalid()`, `loadAbort()`, `dispose()`).
- `/load-progress-e2e.html` — headless auto-run page that writes a PASS/FAIL JSON report into
  `document.title` and `#result`.
- `/load-progress-404-e2e.html` — same, but fetches the missing URL from the strict static server
  to verify 404 → `FetchFailed`.

## Scripts

- `npm run make-test-splat` — regenerate the valid `.splat` sample.
- `npm run test-load-progress` — Node unit checks for the snapshot percentage/sanitization rules.
- `node scripts/strict-static-server.mjs public 4199` — static server with real 404s (no SPA
  fallback) and CORS headers, used by the 404 e2e page.

## Expected terminal snapshots

| Path | status | dataSplatCount / modelSplatCount | progress |
| --- | --- | --- | --- |
| before addModel / after dispose | FetchReady | 0 / 0 | 0 |
| normal sample fully loaded | FetchDone | 1000 / 1000 | 100 |
| fetchLimit = 200 (meta.maxRenderCountOfPc) | FetchAborted | 200 / 1000 | 20 |
| invalid sample | Invalid | 0 / 0 | 0 |
| missing URL (real 404) | FetchFailed | 0 / 0 | 0 |

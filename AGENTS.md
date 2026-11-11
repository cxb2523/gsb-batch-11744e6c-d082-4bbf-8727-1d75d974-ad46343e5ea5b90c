# 毛线星球 · Yarn Planet — project instructions

Original small-planet game: carry a spool, lay colored thread along your real walking route, connect
sources to things that need them, and color floods back into a paper-sketch planet.
Read `docs/DESIGN.md` first. Canonical ids, coordinates and copy live in `src/chapter/`.

## Ground rules
- Original content only. Build geometry in code from primitives and synthesize audio. Never add
  assets, code or data taken from other games. Third-party code needs an MIT-compatible license and an
  entry in `THIRD_PARTY_NOTICES.md`.
- Module boundaries are in `src/contracts.ts`. Each workstream owns its folder:
  `src/world/`, `src/character/` + `src/residents/`, `src/thread/`, `src/fx/` + `src/sky.ts` + `src/art/`,
  `src/ui*` + `src/style.css` + `src/i18n.ts` + `src/locales/` + `src/game-copy.ts` + `src/ui-copy.ts` + `src/audio/`
  + `src/chapter/script-locales.ts`. `src/main.ts` and `src/chapter/director.ts` belong to the lead;
  touch them only for minimal wiring your module needs, and say so in your report.
- Extend contracts additively; keep exported factory signatures (`createWorld`, `createCharacter`,
  `createResidents`/`updateResidents`, `createThreadSystem`, `createEnvironmentFx`, `GameSound`).
- Use `createToonMaterial` (src/art/toon.ts) for every lit surface so the paper→color revival,
  sun, shadows and ink outlines stay consistent. Things that are always colored pass `alwaysAlive`.
- Planet center stays at (0,0,0); radial gravity depends on it. Land radius 14, sea 13.72.
- Characters: local +Y feet-to-head, +Z face, origin at the feet. Use `sphereOrientation(normal, forward)`.
- Physics/camera rules: keep real 3D capsule collision against the full
  collider set, parallel-transport headings, keep render pose separate from physics pose,
  animation/camera signals use retained collision-resolved velocity.

## Verify
- `npm test`, `npm run build` (tsc + vite) must pass.
- `npm run dev` (http://127.0.0.1:4173) then `node scripts/shot.mjs --start --out /tmp/x --steps "..."`
  for screenshots and the DEV `data-game-state` JSON (see header of scripts/shot.mjs).
  Debug helpers (`teleport`, `complete`) are for visual checks only, never gameplay evidence;
  confirm gameplay with ordinary keyboard input as well.
- Performance budget: < 250 draw calls, < 500k triangles on desktop; check `renderStats` in state.

## Production
- `yarn.ynot.games` primary (the ynot.games series domain); `yarnplanet.makerjackie.com`, `unspool.makerjackie.com` and
  `unspool.01mvp.com` kept as old domains. Cloudflare Worker `unspool-01mvp`. Public GitHub `makerjackie/yarn-planet` (MIT).
- Run tests before `npm run deploy`; then `npm run verify:online`.
- Static-assets Worker keeps `html_handling: auto-trailing-slash`; missing assets must 404.
- `public/woven/` (simulated routes for the trailer) is local only: delete or move it before a deploy, and never present
  simulated routes as real players.

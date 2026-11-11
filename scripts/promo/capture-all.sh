#!/bin/bash
# 4K captures for the promo (vite dev on :4180, wrangler dev on :8788 seeded by seed-local.mjs).
set -euo pipefail
W=${PROMO_WORK:-$(cd "$(dirname "$0")/../.." && pwd)/press/promo/work}
S=$W/saves
cd "$(dirname "$0")/../.."
run() { echo "== $1"; shift; "$@" 2>&1 | tail -1; }
run woven node scripts/promo/woven.mjs --out "$W/woven" --seconds 6.5
run phone-zh npx tsx scripts/promo/film.ts --plan phone --gamecam --lang zh --save "$S/after-o1.json" --out "$W/phone-zh" --stills "$W/stills"
run phone-en npx tsx scripts/promo/film.ts --plan phone --gamecam --lang en --prefix phone-en --save "$S/after-o1.json" --out "$W/phone-en" --stills "$W/stills"
run multi-zh npx tsx scripts/promo/multi.ts --lang zh --save "$S/after-finale.json" --out "$W/multi-zh" --seconds 6
run multi-en npx tsx scripts/promo/multi.ts --lang en --save "$S/after-finale.json" --out "$W/multi-en" --seconds 6
run finale npx tsx scripts/promo/film.ts --plan finale --query "dpr=2&online=http://127.0.0.1:8788" --save "$S/after-fw.json" --out "$W/finale" --stills "$W/stills"
echo done

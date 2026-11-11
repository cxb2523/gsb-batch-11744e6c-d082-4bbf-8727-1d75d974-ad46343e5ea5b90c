#!/bin/bash
# Remaining 4K captures after a dev-server restart (see capture-all.sh).
set -euo pipefail
W=${PROMO_WORK:-$(cd "$(dirname "$0")/../.." && pwd)/press/promo/work}
S=$W/saves
cd "$(dirname "$0")/../.."
until curl -s --noproxy '*' -o /dev/null http://127.0.0.1:4180/; do sleep 1; done
run() { echo "== $1"; shift; "$@" 2>&1 | tail -3; }
run multi-zh npx tsx scripts/promo/multi.ts --lang zh --save "$S/after-finale.json" --out "$W/multi-zh" --seconds 6
run multi-en npx tsx scripts/promo/multi.ts --lang en --save "$S/after-finale.json" --out "$W/multi-en" --seconds 6
run finale npx tsx scripts/promo/film.ts --plan finale --query "dpr=2&online=http://127.0.0.1:8788" --save "$S/after-fw.json" --out "$W/finale" --stills "$W/stills"
run title node scripts/promo/woven.mjs --plain --out "$W/title" --seconds 6
echo done

#!/bin/bash
# v2 4K captures (vite dev on :4180). All game UI hidden except greeting bubbles.
# Resumable: a step whose output already has markers.json (or the woven's last frame) is skipped.
set -uo pipefail
W=${PROMO_WORK:-$(cd "$(dirname "$0")/../.." && pwd)/press/promo/work}
S=$W/saves
cd "$(dirname "$0")/../.."
until curl -s --noproxy '*' -o /dev/null http://127.0.0.1:4180/; do sleep 1; done
step() {
  local name=$1 dir=$2; shift 2
  if [ -f "$W/$dir/markers.json" ] || [ -f "$W/$dir/00509.jpg" ]; then echo "== $name (done)"; return; fi
  for attempt in 1 2; do
    echo "== $name (attempt $attempt)"
    if "$@" 2>&1 | grep -v '^\s*at ' | tail -2; then [ -f "$W/$dir/markers.json" ] || [ -f "$W/$dir/00509.jpg" ] && return; fi
  done
}
step lay v2-lay npx tsx scripts/promo/film.ts --plan lay --conn w1 --startat spring --save "$S/after-h1.json" --out "$W/v2-lay" --stills "$W/v2-stills" --prefix lay
step lay2 v2-lay2 npx tsx scripts/promo/film.ts --plan lay --conn w1 --startat spring --cam 0,30,140 --query "dpr=2&nobirds" --save "$S/after-h1.json" --out "$W/v2-lay2" --stills "$W/v2-stills" --prefix lay2
step phone-zh v2-phone-zh npx tsx scripts/promo/film.ts --plan phone --gamecam --lang zh --save "$S/after-o1.json" --out "$W/v2-phone-zh" --stills "$W/v2-stills" --prefix phone-zh
step phone-en v2-phone-en npx tsx scripts/promo/film.ts --plan phone --gamecam --lang en --save "$S/after-o1.json" --out "$W/v2-phone-en" --stills "$W/v2-stills" --prefix phone-en
step finale v2-finale npx tsx scripts/promo/film.ts --plan finale --save "$S/after-fw.json" --out "$W/v2-finale" --stills "$W/v2-stills" --prefix finale
step woven v2-woven node scripts/promo/woven.mjs --out "$W/v2-woven" --seconds 17
echo done

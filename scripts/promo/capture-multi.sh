#!/bin/bash
# Multiplayer scene in both languages (see capture-all.sh).
set -euo pipefail
W=${PROMO_WORK:-$(cd "$(dirname "$0")/../.." && pwd)/press/promo/work}
cd "$(dirname "$0")/../.."
for lang in zh en; do
  echo "== multi-$lang"
  npx tsx scripts/promo/multi.ts --lang $lang --save "$W/saves/after-finale.json" --out "$W/multi-$lang" --seconds 6 2>&1 | tail -1
done
echo done

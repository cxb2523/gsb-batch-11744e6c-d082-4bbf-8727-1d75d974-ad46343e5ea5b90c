#!/bin/bash
# Final renders: zh / en / clean at native 4K and a 1080p preview of each.
set -euo pipefail
OUT=${PROMO_OUT:-$(cd "$(dirname "$0")/../.." && pwd)/press/promo}
cd "$(dirname "$0")"
for v in zh en clean; do
  python3 compose.py timeline.json $v "$OUT/yarn-planet-promo-$v-4k.mp4"
  python3 compose.py timeline.json $v "$OUT/yarn-planet-promo-$v-1080p.mp4" --scale 1920
done
echo done

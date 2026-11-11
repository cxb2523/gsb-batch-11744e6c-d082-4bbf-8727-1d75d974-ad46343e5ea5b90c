#!/bin/bash
# v3 final renders: zh / en / clean at native 4K and 1080p.
set -euo pipefail
OUT=${PROMO_OUT:-$(cd "$(dirname "$0")/../.." && pwd)/press/promo/v3}
cd "$(dirname "$0")"
for v in zh en clean; do
  python3 compose.py timeline-v3.json $v "$OUT/yarn-planet-promo-v3-$v-4k.mp4"
  python3 compose.py timeline-v3.json $v "$OUT/yarn-planet-promo-v3-$v-1080p.mp4" --scale 1920
done
echo done

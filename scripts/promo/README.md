# Promo video pipeline

The 27.5 s trailer (final cut = **v5**: [YouTube](https://www.youtube.com/watch?v=EATwc16lWoM)) is rendered
from the real game. A virtual clock in `film.ts`, `multi.ts` and `woven.mjs` advances the game exactly
1/60 s per captured frame, so every 4K frame is sharp however slow the screenshot is. `compose.py` then
cuts the frame sequences, lays transparent caption PNGs on top and mixes music and sound effects in one
ffmpeg graph.

Earlier cuts (`timeline.json`, `-v2` … `-v4`) are kept because v5 reuses their captures and captions.
All paths below are relative to the repository root. Media goes to `press/promo/` (ignored by git).

## Needs

- `npm ci`, `npx playwright install chromium`, `ffmpeg` and `python3` on `PATH`.
- Music: “Carefree” by Kevin MacLeod ([incompetech.com](https://incompetech.com)), licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is **not** in this repository and not
  covered by its MIT license. Download it to `press/promo/music/carefree.mp3` or set `PROMO_MUSIC`.
  Credit it wherever the video is published.

## Steps (v5)

```sh
W=press/promo/work
npx vite --host 127.0.0.1 --port 4180 --strictPort &          # game + overlay page for capture
npx wrangler dev --port 8788 &                                # local Durable Object for the multiplayer shot

# 1. SIMULATED routes for the woven-planet shots (local only, never uploaded; captioned as illustrative)
npx tsx scripts/woven-sample.ts --count 900 --out public/woven/sample.json

# 2. Save states: an ordinary-keyboard playthrough dumps localStorage after each connection
npx tsx scripts/promo/bot.ts --url http://127.0.0.1:4180/ --out $W/saves

# 3. Frame captures used by v5: opening, v2-lay2, v2-woven, multi-zh / multi-en
npx tsx scripts/promo/film.ts --plan opening --out $W/opening
bash scripts/promo/capture-v2.sh      # also films v2 shots that v5 no longer uses
bash scripts/promo/capture-multi.sh   # four real clients greeting each other via wrangler dev

# 4. Sound effects (synthesized) and caption overlays (all into one folder)
python3 scripts/promo/sfx.py $W/sfx
for v in v2 v4 v5; do node scripts/promo/overlays-$v.mjs --out $W/overlays-v5 --url http://127.0.0.1:4180; done

# 5. Render zh / en / clean at 4K and 1080p into press/promo/v5
bash scripts/promo/render-v5.sh
```

Shots, cut points and captions are in `timeline-v5.json`. `qa.py` and `check-dir.py` sanity-check renders
and frame folders.

## Social-media copy

The archived copies (GitHub release assets) are 1080p H.264 at about 4 Mbit/s (≈ 14 MB):

```sh
ffmpeg -i press/promo/v5/yarn-planet-promo-v5-zh-4k.mp4 -vf scale=1920:-2:flags=lanczos -c:v libx264 -preset slow \
  -crf 23 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -profile:v high -c:a aac -b:a 160k \
  -movflags +faststart yarn-planet-promo-zh.mp4
```

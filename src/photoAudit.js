// Photo-to-chip diagnostics: a pure, explainable twin of mapImage (src/photo.js).
//
// mapImage can only run in a browser (it draws to a canvas and reads ImageData) and
// its output gives no reason for the chip each cell receives. This module never
// touches the DOM: the caller supplies a plain-data snapshot of the source image and
// the mapImage options, plus optionally the already-sampled pixels per target cell,
// and gets back a JSON-serialisable diagnosis of the crop window, the palette and
// every chosen chip. Numbers follow mapImage exactly:
//   - crop aspect: (w * (tileW + gapX)) / (h * (1 + gapY))
//   - distance: 0.3*dr^2 + 0.59*dg^2 + 0.11*db^2, a palette entry wins only on a
//     strictly smaller distance, so ties keep the earlier entry
//   - dither: Floyd-Steinberg in mapImage's order, right 7/16, lower-left 3/16,
//     below 5/16, lower-right 1/16, neighbours outside the grid skipped
// Nothing here creates a canvas, calls getImageData, reaches window/document or
// touches disk, and the returned object contains only JSON-safe plain data.

import { CHIPS } from './charset.js';
import { THEMES, GEOM } from './renderer.js';

const CHIP_KEYS = ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k'];
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Floyd-Steinberg in the exact order and with the exact bounds mapImage uses.
export const DIFFUSION = [
  { dx: 1, dy: 0, weight: 7 / 16 },
  { dx: -1, dy: 1, weight: 3 / 16 },
  { dx: 0, dy: 1, weight: 5 / 16 },
  { dx: 1, dy: 1, weight: 1 / 16 }
];

// The check names, in the order they are reported. Stable machine keys; the human-
// readable reason on a failed check carries the offending value.
export const CHECK_NAMES = ['target-size', 'source-size', 'zoom-range', 'px-range', 'py-range', 'sample-pixels'];

const check = (name, pass, reason = null) => ({ name, pass: !!pass, reason: pass ? reason : reason || 'check failed' });

// Weighted squared colour distance: the same expression as the nearest-colour loop
// in mapImage, factored out so the diagnosis and the test can name the number.
function colourDistance(r, g, b, [pr, pg, pb]) {
  const dr = r - pr, dg = g - pg, db = b - pb;
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
}

// Nearest palette entry by strict-less-than replacement, so on an exact tie the
// first entry (mapImage's pal[0]) stays selected.
function nearest(r, g, b, palette) {
  let best = palette[0], bd = Infinity, index = 0;
  for (let i = 0; i < palette.length; i++) {
    const dd = colourDistance(r, g, b, palette[i].rgb);
    if (dd < bd) { bd = dd; best = palette[i]; index = i; }
  }
  return { entry: best, distance: bd, index };
}

// The palette mapImage builds: eight chips in drum order, then the theme face as a
// blank candidate when o.blank is set. An unknown theme falls back to black exactly
// like mapImage's `THEMES[o.theme] || THEMES.black`.
function buildPalette(o) {
  const theme = THEMES[o.theme] ? o.theme : 'black';
  const T = THEMES[theme];
  const entries = CHIP_KEYS.map(k => ({ key: k, rgb: hex(CHIPS[k]) }));
  let blank = null;
  if (o.blank) {
    blank = { key: ' ', rgb: hex(T.face), source: 'theme', theme: T.id };
    entries.push({ key: ' ', rgb: blank.rgb.slice() });
  }
  return { keys: entries.map(e => e.key), entries, hasBlank: !!blank, blank };
}

// The crop window, line for line with mapImage: crop the source to the zone's real
// shape (gaps included), then shrink it by the zoom and place it by px/py. Returns
// nulls when the inputs cannot describe a crop. px/py default to 0.5, zoom to 1,
// matching mapImage's `o.zoom || 1` and `o.px == null ? 0.5 : o.px`.
function cropWindow(sourceW, sourceH, h, w, o) {
  const none = { aspect: null, sx: null, sy: null, cw: null, ch: null };
  if (![sourceW, sourceH, h, w].every(isNum) || h <= 0 || w <= 0 || sourceW <= 0 || sourceH <= 0) return none;
  const z = isNum(o.zoom) ? o.zoom : 1;
  const px = isNum(o.px) ? o.px : 0.5, py = isNum(o.py) ? o.py : 0.5;
  const aspect = (w * (GEOM.tileW + GEOM.gapX)) / (h * (1 + GEOM.gapY));
  let cw, ch;
  if (sourceW / sourceH > aspect) { ch = sourceH; cw = sourceH * aspect; } else { cw = sourceW; ch = sourceW / aspect; }
  cw /= z; ch /= z;
  return { aspect, sx: (sourceW - cw) * px, sy: (sourceH - ch) * py, cw, ch };
}

function validPixel(p) {
  return Array.isArray(p) && p.length >= 3 && isNum(p[0]) && isNum(p[1]) && isNum(p[2]);
}

// snapshot: { sourceW, sourceH, h, w, o: { theme, zoom, px, py, dither, blank } }
// samples: optional h rows of w entries, each an [r, g, b] triple or null (no data).
export function auditPhoto(snapshot, samples) {
  try {
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const o = snap.o && typeof snap.o === 'object' ? snap.o : {};
    const { sourceW, sourceH, h, w } = snap;
    const samplesProvided = samples != null;

    const sizeOk = Number.isInteger(h) && h > 0 && Number.isInteger(w) && w > 0;
    const sourceOk = isNum(sourceW) && sourceW > 0 && isNum(sourceH) && sourceH > 0;
    // An absent setting is fine: mapImage defaults zoom to 1 and px/py to 0.5. Only an
    // explicit value that is not a number or lies outside the range fails the check.
    const zoomOk = o.zoom == null || (isNum(o.zoom) && o.zoom >= 1 && o.zoom <= 3);
    const pxOk = o.px == null || (isNum(o.px) && o.px >= 0 && o.px <= 1);
    const pyOk = o.py == null || (isNum(o.py) && o.py >= 0 && o.py <= 1);

    const checks = [
      check('target-size', sizeOk, sizeOk ? null : `target h and w must be positive integers (h=${h}, w=${w})`),
      check('source-size', sourceOk, sourceOk ? null : `source width and height must be positive (sourceW=${sourceW}, sourceH=${sourceH})`),
      check('zoom-range', zoomOk, zoomOk ? null : `zoom must be between 1 and 3 (got ${o.zoom})`),
      check('px-range', pxOk, pxOk ? null : `px must be between 0 and 1 (got ${o.px})`),
      check('py-range', pyOk, pyOk ? null : `py must be between 0 and 1 (got ${o.py})`)
    ];

    const palette = buildPalette(o);
    const crop = cropWindow(sourceW, sourceH, h, w, o);
    const notes = [];
    const cells = [];
    const missingCells = [];
    let sampleShapeOk = true;

    if (samplesProvided && !Array.isArray(samples)) {
      sampleShapeOk = false;
      notes.push('samples must be an array of rows; no per-cell diagnosis was made');
    }

    if (sizeOk && samplesProvided && sampleShapeOk) {
      // The working buffer is a Float32Array exactly like mapImage's, so dither
      // accumulation rounds the same way and a near tie resolves to the same chip.
      // It never appears in the output; null cells remember their index instead.
      const buf = new Float32Array(h * w * 3);
      const nullSet = new Set();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = samples[y] && samples[y][x];
        if (!validPixel(p)) { nullSet.add(y * w + x); continue; }
        const i = (y * w + x) * 3;
        buf[i] = p[0]; buf[i + 1] = p[1]; buf[i + 2] = p[2];
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const idx = y * w + x, i = idx * 3;
        const p = samples[y] && samples[y][x];
        if (!validPixel(p)) {
          missingCells.push({ y, x });
          cells.push({ y, x, key: null, distance: null, missing: true, reason: 'no pixel data' });
          continue;   // never silently fall back to the first palette colour
        }
        const got = nearest(buf[i], buf[i + 1], buf[i + 2], palette.entries);
        cells.push({ y, x, key: got.entry.key, distance: got.distance, paletteIndex: got.index, missing: false, rgb: [p[0], p[1], p[2]] });
        if (o.dither) {
          const er = [buf[i] - got.entry.rgb[0], buf[i + 1] - got.entry.rgb[1], buf[i + 2] - got.entry.rgb[2]];
          for (const d of DIFFUSION) {
            const nx = x + d.dx, ny = y + d.dy;
            if (nx < 0 || nx >= w || ny >= h) continue;   // same bounds as mapImage
            if (nullSet.has(ny * w + nx)) continue;   // a cell without pixel data receives no diffusion
            const j = (ny * w + nx) * 3;
            for (let k = 0; k < 3; k++) buf[j + k] += er[k] * d.weight;
          }
        }
      }
      if (samples.some((row, y) => y < h && Array.isArray(row) && row.length > w)) {
        notes.push('samples carry extra columns beyond the target width; they were ignored');
      }
      if (Array.isArray(samples) && samples.length > h) notes.push('samples carry extra rows beyond the target height; they were ignored');
    } else if (samplesProvided && sampleShapeOk && !sizeOk) {
      notes.push('target size is invalid; sample pixels were not evaluated');
    }

    const samplePass = sampleShapeOk && missingCells.length === 0;
    let sampleReason = null;
    if (!sampleShapeOk) sampleReason = 'samples must be an array of rows of [r, g, b] triples or null';
    else if (missingCells.length) {
      const first = missingCells[0];
      sampleReason = `${missingCells.length} cell(s) have no pixel data; first at row ${first.y}, col ${first.x}`;
    } else if (samplesProvided && !sizeOk) sampleReason = 'target size is invalid; sample pixels were not evaluated';
    checks.push(check('sample-pixels', samplePass, sampleReason));

    const failed = checks.filter(c => !c.pass);
    return {
      ok: failed.length === 0,
      degraded: !sizeOk || !sourceOk || !sampleShapeOk,
      input: {
        sourceW: isNum(sourceW) ? sourceW : null,
        sourceH: isNum(sourceH) ? sourceH : null,
        h: Number.isInteger(h) ? h : null,
        w: Number.isInteger(w) ? w : null,
        samplesProvided,
        options: {
          theme: THEMES[o.theme] ? o.theme : 'black',
          zoom: isNum(o.zoom) ? o.zoom : 1,
          px: isNum(o.px) ? o.px : 0.5,
          py: isNum(o.py) ? o.py : 0.5,
          dither: !!o.dither,
          blank: !!o.blank
        }
      },
      crop,
      palette: {
        keys: palette.keys,
        entries: palette.entries,
        hasBlank: palette.hasBlank,
        blank: palette.blank
      },
      checks,
      failedChecks: failed.length,
      firstFailure: failed.length ? failed[0].reason : null,
      missingCells,
      cells,
      notes
    };
  } catch (err) {
    // Last-resort degradation: same shape, readable reason, never an uncaught throw.
    const reason = `diagnostics could not run: ${err && err.message ? err.message : String(err)}`;
    return {
      ok: false, degraded: true,
      input: { sourceW: null, sourceH: null, h: null, w: null, samplesProvided: samples != null, options: null },
      crop: { aspect: null, sx: null, sy: null, cw: null, ch: null },
      palette: { keys: CHIP_KEYS.slice(), entries: [], hasBlank: false, blank: null },
      checks: CHECK_NAMES.map(name => check(name, false, reason)),
      failedChecks: CHECK_NAMES.length, firstFailure: reason,
      missingCells: [], cells: [], notes: [reason]
    };
  }
}

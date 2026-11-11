// Photo-to-chip diagnostics (src/photoAudit.js). Expected values are worked out by
// hand from mapImage's documented formulas (src/photo.js), never copied from the
// implementation's own expressions. No canvas, no DOM, no network, no image files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditPhoto, DIFFUSION, CHECK_NAMES } from '../src/photoAudit.js';
import { CHIPS } from '../src/charset.js';
import { GEOM, THEMES } from '../src/renderer.js';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Independent restatement of mapImage's weighted squared distance.
const dist = (p, c) => { const dr = p[0] - c[0], dg = p[1] - c[1], db = p[2] - c[2]; return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db; };
// mapImage's palette order; strict less-than keeps the earlier entry on a tie.
function expectedKey(pixel, o) {
  const T = THEMES[o.theme] || THEMES.black;
  const pal = ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k'].map(k => [k, hex(CHIPS[k])]);
  if (o.blank) pal.push([' ', hex(T.face)]);
  let best = pal[0][0], bd = Infinity, bi = 0;
  for (let i = 0; i < pal.length; i++) { const dd = dist(pixel, pal[i][1]); if (dd < bd) { bd = dd; best = pal[i][0]; bi = i; } }
  return { key: best, distance: bd, index: bi };
}

test('happy path: crop window, palette and every chip match the mapImage formulas', () => {
  const sourceW = 400, sourceH = 300, h = 2, w = 3;
  const o = { theme: 'black', zoom: 2, px: 0.25, py: 0.75, dither: false, blank: true };
  const samples = [
    [hex(CHIPS.r), [20, 20, 20], [239, 236, 229]],
    [hex(CHIPS.b), hex(CHIPS.y), [130, 80, 200]]
  ];
  const a = auditPhoto({ sourceW, sourceH, h, w, o }, samples);

  assert.equal(a.ok, true);
  assert.equal(a.degraded, false);
  assert.equal(a.failedChecks, 0);
  assert.deepEqual(a.checks.map(c => c.pass), CHECK_NAMES.map(() => true));
  assert.deepEqual(a.checks.map(c => c.name), CHECK_NAMES);

  // crop, by hand from the photo.js expressions
  const aspect = (w * (GEOM.tileW + GEOM.gapX)) / (h * (1 + GEOM.gapY));
  let cw0, ch0; if (sourceW / sourceH > aspect) { ch0 = sourceH; cw0 = sourceH * aspect; } else { cw0 = sourceW; ch0 = sourceW / aspect; }
  const cw = cw0 / 2, ch = ch0 / 2;
  assert.ok(Math.abs(a.crop.aspect - aspect) < 1e-12);
  assert.ok(Math.abs(a.crop.cw - cw) < 1e-9);
  assert.ok(Math.abs(a.crop.ch - ch) < 1e-9);
  assert.ok(Math.abs(a.crop.sx - (sourceW - cw) * 0.25) < 1e-9);
  assert.ok(Math.abs(a.crop.sy - (sourceH - ch) * 0.75) < 1e-9);

  // palette: eight chips then the black theme face as the blank candidate
  assert.deepEqual(a.palette.keys, ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k', ' ']);
  assert.equal(a.palette.hasBlank, true);
  assert.deepEqual(a.palette.blank, { key: ' ', rgb: hex(THEMES.black.face), source: 'theme', theme: 'black' });

  // each cell: chip key, distance and palette index equal the hand-worked nearest colour
  assert.equal(a.cells.length, 6);
  for (const cell of a.cells) {
    const want = expectedKey(samples[cell.y][cell.x], o);
    assert.equal(cell.key, want.key, `cell ${cell.y},${cell.x}`);
    assert.equal(cell.paletteIndex, want.index, `cell ${cell.y},${cell.x}`);
    assert.ok(Math.abs(cell.distance - want.distance) < 1e-9, `cell ${cell.y},${cell.x}`);
    assert.equal(cell.missing, false);
  }
  // explicit spot checks, worked out directly: an exact chip gives zero distance,
  // and the near-white pixel is closer to the white chip than to the black theme face
  assert.equal(a.cells[0].key, 'r');
  assert.equal(a.cells[0].distance, 0);
  assert.equal(a.cells[2].key, 'w');
  assert.ok(a.cells[2].distance < dist([239, 236, 229], hex(THEMES.black.face)));
});

test('blank candidate uses the selected theme face and wins only on a strictly smaller distance', () => {
  // black theme blank is #1C1C1E: a very dark pixel must pick blank over k (#141415)
  const dark = [28, 28, 30];
  const a = auditPhoto({ sourceW: 10, sourceH: 10, h: 1, w: 1, o: { theme: 'black', blank: true } }, [[dark]]);
  const want = expectedKey(dark, { theme: 'black', blank: true });
  assert.equal(a.cells[0].key, want.key);
  assert.equal(a.cells[0].key, ' ');
  assert.equal(a.palette.blank.rgb.join(','), hex(THEMES.black.face).join(','));
  // without blank the same pixel picks k
  const a2 = auditPhoto({ sourceW: 10, sourceH: 10, h: 1, w: 1, o: { theme: 'black', blank: false } }, [[dark]]);
  assert.deepEqual(a2.palette.keys, ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k']);
  assert.equal(a2.palette.hasBlank, false);
  assert.equal(a2.cells[0].key, 'k');
  // an unknown theme falls back to black, as mapImage does
  const a3 = auditPhoto({ sourceW: 10, sourceH: 10, h: 1, w: 1, o: { theme: 'nope', blank: true } }, [[dark]]);
  assert.equal(a3.input.options.theme, 'black');
  assert.equal(a3.palette.blank.theme, 'black');

  // strict less-than replacement, mapImage's tie rule: a pixel that is exactly a
  // chip colour gives distance 0 to that chip, and no equal-distance later entry
  // (including the blank) can replace it
  const chipPixel = hex(CHIPS.k);
  const a4 = auditPhoto({ sourceW: 10, sourceH: 10, h: 1, w: 1, o: { theme: 'black', blank: true } }, [[chipPixel]]);
  assert.equal(a4.cells[0].key, 'k');
  assert.equal(a4.cells[0].distance, 0);
});

test('dither: Floyd-Steinberg order and weights match mapImage, and samples are not mutated', () => {
  assert.deepEqual(DIFFUSION.map(d => [d.dx, d.dy, d.weight]), [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]);
  const h = 2, w = 2, o = { theme: 'black', dither: true, blank: true };
  const dark = [60, 60, 60], grey = [130, 130, 130];
  const samples = [[dark, dark], [dark, grey]];
  const frozen = JSON.parse(JSON.stringify(samples));
  const a = auditPhoto({ sourceW: 20, sourceH: 20, h, w, o }, samples);
  assert.deepEqual(samples, frozen);   // the caller's array is untouched

  // recompute the diffusion by hand in the same raster order
  const T = THEMES.black;
  const pal = ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k'].map(k => [k, hex(CHIPS[k])]);
  pal.push([' ', hex(T.face)]);
  // mapImage keeps the working pixels in a Float32Array; the hand simulation does too
  const buf = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; buf[i] = samples[y][x][0]; buf[i + 1] = samples[y][x][1]; buf[i + 2] = samples[y][x][2]; }
  const out = blank2(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, p = [buf[i], buf[i + 1], buf[i + 2]];
    let best = pal[0], bd = Infinity;
    for (const c of pal) { const dd = dist(p, c[1]); if (dd < bd) { bd = dd; best = c; } }
    out[y][x] = best[0];
    const er = [p[0] - best[1][0], p[1] - best[1][1], p[2] - best[1][2]];
    for (const [dx, dy, f] of [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= w || ny >= h) continue;
      const j = (ny * w + nx) * 3;
      for (let k = 0; k < 3; k++) buf[j + k] += er[k] * f / 16;
    }
  }
  for (const cell of a.cells) assert.equal(cell.key, out[cell.y][cell.x], `${cell.y},${cell.x}`);

  // the bottom-right grey changes its chip because of the diffused error: plain
  // grey is nearest the violet chip, the error-darkened value lands on green
  const plain = auditPhoto({ sourceW: 20, sourceH: 20, h, w, o: { ...o, dither: false } }, samples);
  assert.notEqual(plain.cells[3].key, a.cells[3].key);
  assert.equal(plain.cells[3].key, 'v');
  assert.equal(a.cells[3].key, 'g');

  // edge neighbours out of bounds are simply skipped: a 1-wide grid must not throw
  const one = auditPhoto({ sourceW: 10, sourceH: 10, h: 1, w: 1, o: { dither: true } }, [[[100, 100, 100]]]);
  assert.equal(one.ok, true);
  assert.equal(one.cells[0].key, expectedKey([100, 100, 100], {}).key);
});

function blank2(h, w) { return Array.from({ length: h }, () => Array(w).fill(' ')); }

test('negative path: zoom 4 and px -0.2 fail named checks with reasons and never throw', () => {
  const snap = { sourceW: 100, sourceH: 80, h: 2, w: 2, o: { zoom: 4, px: -0.2, py: 0.5, dither: false, blank: false } };
  const a = auditPhoto(snap, [[[1, 2, 3], [4, 5, 6]], [[7, 8, 9], [10, 11, 12]]]);
  assert.equal(a.ok, false);
  const byName = Object.fromEntries(a.checks.map(c => [c.name, c]));
  assert.equal(byName['zoom-range'].pass, false);
  assert.match(byName['zoom-range'].reason, /zoom/);
  assert.match(byName['zoom-range'].reason, /4/);
  assert.equal(byName['px-range'].pass, false);
  assert.match(byName['px-range'].reason, /px/);
  assert.match(byName['px-range'].reason, /-0.2/);
  assert.equal(byName['py-range'].pass, true);
  assert.equal(a.failedChecks, 2);
  assert.match(a.firstFailure, /target h and w|source width|zoom|px|py/);
  // diagnostics still run on the supplied pixels rather than throwing
  assert.equal(a.cells.length, 4);
  assert.equal(a.degraded, false);

  // garbage input of every shape is caught by the outer guard
  const junk = [null, undefined, {}, { o: null }, 'nope', 42];
  for (const s of junk) {
    const r = auditPhoto(s, null);
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(JSON.parse(JSON.stringify(r)));
  }
  assert.doesNotThrow(() => auditPhoto(null, 'not-an-array'));
  assert.equal(auditPhoto(null, 'not-an-array').checks.find(c => c.name === 'sample-pixels').pass, false);
});

test('boundary path: zero h/w and null sample cells are reported, never defaulted to a chip', () => {
  const badSize = auditPhoto({ sourceW: 50, sourceH: 50, h: 0, w: 4, o: {} }, []);
  assert.equal(badSize.ok, false);
  assert.equal(badSize.checks.find(c => c.name === 'target-size').pass, false);
  assert.equal(badSize.crop.cw, null);
  assert.equal(badSize.cells.length, 0);
  assert.match(badSize.firstFailure, /positive integers/);
  assert.equal(badSize.degraded, true);

  const badW = auditPhoto({ sourceW: 50, sourceH: 50, h: 1, w: 0, o: {} });
  assert.equal(badW.checks.find(c => c.name === 'target-size').pass, false);

  const badSource = auditPhoto({ sourceW: 0, sourceH: 50, h: 2, w: 2, o: {} });
  assert.equal(badSource.checks.find(c => c.name === 'source-size').pass, false);
  assert.equal(badSource.crop.aspect, null);

  // null cells are marked "no pixel data" rather than silently taking palette[0]
  const samples = [[hex(CHIPS.r), null], [null, [255, 255, 255]]];
  const a = auditPhoto({ sourceW: 50, sourceH: 50, h: 2, w: 2, o: { dither: true } }, samples);
  assert.equal(a.checks.find(c => c.name === 'sample-pixels').pass, false);
  assert.match(a.checks.find(c => c.name === 'sample-pixels').reason, /no pixel data/);
  assert.equal(a.missingCells.length, 2);
  assert.deepEqual(a.missingCells[0], { y: 0, x: 1 });
  for (const m of a.missingCells) {
    const cell = a.cells.find(c => c.y === m.y && c.x === m.x);
    assert.equal(cell.key, null);
    assert.equal(cell.distance, null);
    assert.equal(cell.missing, true);
    assert.equal(cell.reason, 'no pixel data');
  }
  // the data-bearing cells are still diagnosed normally
  assert.equal(a.cells.find(c => c.y === 0 && c.x === 0).key, 'r');
  assert.equal(a.cells.find(c => c.y === 1 && c.x === 1).key, 'w');
  // null under dither must not break neighbours that do receive diffusion
  assert.equal(a.ok, false);
  assert.equal(a.cells.length, 4);

  // no samples at all is acceptable: the structural checks still pass
  const none = auditPhoto({ sourceW: 50, sourceH: 50, h: 2, w: 2, o: {} });
  assert.equal(none.input.samplesProvided, false);
  assert.equal(none.checks.find(c => c.name === 'sample-pixels').pass, true);
  assert.equal(none.cells.length, 0);
  assert.equal(none.ok, true);
});

test('random sweep: audited chips match an independent mapImage-formula reference, dither on and off', () => {
  // deterministic PRNG so the test stays reproducible without Math.random dependence
  let seed = 2463534242;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  // reference: the photo.js loops restated independently, same palette, same Float32 buffer
  const refMap = (samples, hh, ww, o) => {
    const T = THEMES[o.theme] || THEMES.black;
    const pal = ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k'].map(k => [k, hex(CHIPS[k])]);
    if (o.blank) pal.push([' ', hex(T.face)]);
    const buf = new Float32Array(hh * ww * 3);
    for (let i = 0; i < hh * ww; i++) { const p = samples[Math.floor(i / ww)][i % ww]; buf[i * 3] = p[0]; buf[i * 3 + 1] = p[1]; buf[i * 3 + 2] = p[2]; }
    const out = blank2(hh, ww);
    for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < ww; xx++) {
      const i = (yy * ww + xx) * 3, R = buf[i], G = buf[i + 1], B = buf[i + 2];
      let best = pal[0], bd = Infinity;
      for (const p of pal) { const dd = dist([R, G, B], p[1]); if (dd < bd) { bd = dd; best = p; } }
      out[yy][xx] = best[0];
      if (o.dither) {
        const er = [R - best[1][0], G - best[1][1], B - best[1][2]];
        for (const [dx, dy, f] of [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]]) {
          const nx = xx + dx, ny = yy + dy; if (nx < 0 || nx >= ww || ny >= hh) continue;
          const j = (ny * ww + nx) * 3; for (let k = 0; k < 3; k++) buf[j + k] += er[k] * f / 16;
        }
      }
    }
    return out;
  };
  for (let trial = 0; trial < 40; trial++) {
    const hh = 1 + Math.floor(rnd() * 5), ww = 1 + Math.floor(rnd() * 7);
    const o = { theme: ['black', 'white', 'solari'][Math.floor(rnd() * 3)], dither: rnd() > 0.5, blank: rnd() > 0.5 };
    const samples = Array.from({ length: hh }, () => Array.from({ length: ww }, () => [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)]));
    const want = refMap(samples, hh, ww, o);
    const a = auditPhoto({ sourceW: 33, sourceH: 21, h: hh, w: ww, o }, samples);
    assert.equal(a.cells.length, hh * ww);
    for (const cell of a.cells) assert.equal(cell.key, want[cell.y][cell.x], `trial ${trial} ${cell.y},${cell.x} ${JSON.stringify(o)}`);
    assert.deepEqual(a.palette.keys, o.blank ? ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k', ' '] : ['r', 'o', 'y', 'g', 'b', 'v', 'w', 'k']);
  }
});

test('the module source stays DOM-free and disk-free, so it can run anywhere', () => {
  const src = readFileSync(new URL('../src/photoAudit.js', import.meta.url), 'utf8')
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');   // comments may name what is avoided
  for (const banned of ['document', 'window', 'getImageData', 'createElement', 'ImageData', 'readFile', 'writeFile', 'fetch(']) {
    assert.equal(src.includes(banned), false, `${banned} must not appear in photoAudit.js code`);
  }
});

test('the whole diagnosis is JSON-serialisable with no functions, TypedArrays or ImageData', () => {
  const a = auditPhoto(
    { sourceW: 120, sourceH: 90, h: 3, w: 4, o: { theme: 'white', zoom: 1.5, px: 0.1, py: 0.9, dither: true, blank: true } },
    Array.from({ length: 3 }, (_, y) => Array.from({ length: 4 }, (_, x) => [10 * x + y, 120 - 10 * y, 60 + x]))
  );
  const text = JSON.stringify(a);
  assert.equal(typeof text, 'string');
  const back = JSON.parse(text);
  assert.deepEqual(back.cells.map(c => [c.y, c.x, c.key]), a.cells.map(c => [c.y, c.x, c.key]));
  assert.equal(back.palette.hasBlank, true);
  assert.equal(back.palette.blank.theme, 'white');
  const walk = v => {
    if (v === null || v === undefined) return;
    assert.equal(typeof v !== 'function', true);
    assert.ok(!ArrayBuffer.isView(v) || v.constructor === Array, 'no TypedArray views');
    assert.ok(typeof ImageData === 'undefined' || !(v instanceof ImageData), 'no ImageData');
    if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(a);
});

#!/usr/bin/env node
// v4 overlay layers: the cold-open line that frames the woven planet as what it
// becomes after many players (so no separate "illustrative" tag is needed), the
// title logo, the closing caption, and an end card that just says Maker Jackie.
// Captions shared with v2 (hook/lay/meet) are copied from overlays-v2.
//   node scripts/promo/overlays-v4.mjs --out DIR [--url http://localhost:4180]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'overlays-v4'));
const base = option('url', 'http://localhost:4180');
await mkdir(out, { recursive: true });

const COLD = { zh: '很多人走过之后，|这颗星球会变成这样', en: 'After many travelers pass through,|this is what the planet becomes' };
const WOVEN = { zh: '等你也来|走一圈', en: 'Come leave|your thread' };
const jobs = [];
for (const lang of ['zh', 'en']) {
  jobs.push([`cold4-${lang}`, { kind: 'caption', lang, text: COLD[lang] }]);
  jobs.push([`title4-${lang}`, { kind: 'title3', lang }]);
  jobs.push([`woven4-${lang}`, { kind: 'caption', lang, text: WOVEN[lang] }]);
  jobs.push([`end4-${lang}`, { kind: 'end2', lang, by: 'Maker Jackie' }]);
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
for (const [name, params] of jobs) {
  await page.goto(`${base}/scripts/promo/overlay.html?${new URLSearchParams(params)}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(out, `${name}.png`), omitBackground: true });
}
console.log(JSON.stringify({ rendered: jobs.length, out }));
await browser.close();

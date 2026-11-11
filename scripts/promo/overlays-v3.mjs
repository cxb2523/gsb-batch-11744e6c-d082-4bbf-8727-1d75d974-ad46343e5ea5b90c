#!/usr/bin/env node
// v3 overlay layers (transparent 3840×2160 PNG): the cold-open title logo, the
// illustrative note (same spot at both ends), the closing caption and end card
// without their own notes. Captions shared with v2 come from overlays-v2.
//   node scripts/promo/overlays-v3.mjs --out DIR [--url http://127.0.0.1:4180]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'overlays-v3'));
const base = option('url', 'http://127.0.0.1:4180');
await mkdir(out, { recursive: true });

const WOVEN = { zh: '等你也来|走一圈', en: 'Come leave|your thread' };
const jobs = [];
for (const lang of ['zh', 'en']) {
  jobs.push([`title3-${lang}`, { kind: 'title3', lang }]);
  jobs.push([`note3-${lang}`, { kind: 'note3', lang }]);
  jobs.push([`woven3-${lang}`, { kind: 'caption', lang, text: WOVEN[lang] }]);
  jobs.push([`end3-${lang}`, { kind: 'end2', lang }]);
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

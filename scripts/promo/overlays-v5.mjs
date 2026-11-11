#!/usr/bin/env node
// v5 = v4 + the play address on the end card (yarn.ynot.games above Maker Jackie).
//   node scripts/promo/overlays-v5.mjs --out DIR [--url http://localhost:4180]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'overlays-v5'));
const base = option('url', 'http://localhost:4180');
await mkdir(out, { recursive: true });
const jobs = ['zh', 'en'].map(lang => [`end5-${lang}`, { kind: 'end2', lang, by: 'Maker Jackie', url: 'yarn.ynot.games' }]);
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

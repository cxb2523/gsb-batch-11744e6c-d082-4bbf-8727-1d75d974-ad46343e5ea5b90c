#!/usr/bin/env node
// v2 overlay layers (transparent 3840×2160 PNG): captions, the illustrative
// note, the end card and the cover. No URL, platform names or handles on screen.
//   node scripts/promo/overlays-v2.mjs --out DIR [--url http://127.0.0.1:4180]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'overlays-v2'));
const base = option('url', 'http://127.0.0.1:4180');
await mkdir(out, { recursive: true });

const CAPTIONS = {
  zh: { hook: '接上线，|颜色就回来了', lay: '你走过的路，|就是那根线', phone: '「……那盘棋，|是你赢了。」', phone2: '「不，是你赢了。|我偷偷挪了一个子。」', meet: '还会遇见|别的旅人', woven: '等你也来|走一圈' },
  en: { hook: 'Plug in a thread,|and color comes back', lay: 'The path you walk|is the thread', phone: '“…You won that game,|you know.”', phone2: '“No. You did.|I moved a piece.”', meet: 'Meet other|travelers', woven: 'Come leave|your thread' },
};
const NOTE = { zh: '示意', en: 'Illustrative' };
const COVER = { zh: '走过的路，|会变成彩线', en: 'Your path|becomes a thread' };
const jobs = [];
for (const lang of ['zh', 'en']) {
  for (const [key, text] of Object.entries(CAPTIONS[lang])) {
    jobs.push([`${key}-${lang}`, { kind: 'caption', lang, text, ...(key === 'woven' ? { note: NOTE[lang] } : {}) }]);
  }
  jobs.push([`note-${lang}`, { kind: 'caption', lang, text: '', note: NOTE[lang] }]);
  jobs.push([`end-${lang}`, { kind: 'end2', lang, note: '1' }]);
  jobs.push([`cover-${lang}`, { kind: 'cover', lang, text: COVER[lang] }]);
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

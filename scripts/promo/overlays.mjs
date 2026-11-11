#!/usr/bin/env node
// Render every overlay layer of the promo as a transparent 3840×2160 PNG.
//   node scripts/promo/overlays.mjs --out DIR [--url http://127.0.0.1:4180]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'overlays'));
const base = option('url', 'http://127.0.0.1:4180');
await mkdir(out, { recursive: true });

export const CAPTIONS = {
  zh: ['背着线轴，|走过一颗小星球', '你走过的路，|会变成一根线', '接上它，|颜色就回来了', '还会遇见|别的旅人', '每个人走过的路，|都留在这颗星球上'],
  en: ['Carry a spool|across a tiny planet', 'The path you walk|becomes a thread', 'Plug it in,|and color comes back', 'Meet other|travelers', 'Every walk stays|on the planet'],
};
// The old neighbors' lines, quoted from src/chapter/script.ts (phone.2 / phone.3).
const PHONE = {
  zh: ['「……那盘棋，|是你赢了。」', '「不，是你赢了。|我偷偷挪了一个子。」'],
  en: ['“…You won that game,|you know.”', '“No. You did.|I moved a piece.”'],
};
const jobs = [];
for (const lang of ['zh', 'en']) {
  jobs.push([`corner-${lang}`, { kind: 'corner', lang }]);
  jobs.push([`corner-tag-${lang}`, { kind: 'corner', lang, tag: '1' }]);
  jobs.push([`tag-${lang}`, { kind: 'tag', lang }]);
  jobs.push([`hook-${lang}`, { kind: 'hook', lang }]);
  jobs.push([`end-${lang}`, { kind: 'end', lang }]);
  CAPTIONS[lang].forEach((text, i) => jobs.push([`cap${i + 1}-${lang}`, { kind: 'caption', lang, text }]));
  jobs.push([`cover-${lang}`, { kind: 'cover', lang, text: lang === 'zh' ? '走过的路，|会变成彩线' : 'Your path|becomes a thread' }]);
  PHONE[lang].forEach((text, i) => jobs.push([`phone${i + 1}-${lang}`, { kind: 'caption', lang, text }]));
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

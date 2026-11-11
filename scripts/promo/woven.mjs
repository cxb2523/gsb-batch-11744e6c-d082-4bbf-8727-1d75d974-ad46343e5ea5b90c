#!/usr/bin/env node
// Hook shot: the ?woven prototype (SIMULATED routes, must be labelled
// "画面示意 / Illustrative" in the edit), clean frames at native 4K with the
// page's own fixed-step advance (RAF loop stopped).
//   node scripts/promo/woven.mjs --out DIR [--seconds 6.5] [--n 900]
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'woven'));
const seconds = Number(option('seconds', '6.5'));
const n = option('n', '900');
const [width, height] = option('size', '1920x1080').split('x').map(Number);
const dsf = Number(option('dsf', '2'));
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dsf });
page.on('pageerror', e => console.error('pageerror', e.message));
const plain = args.includes('--plain');
// --plain: the real title (night planet, no simulated threads), slow title orbit.
if (plain) await page.addInitScript(() => {
  // no __woven helpers on the real title: a virtual clock drives the RAF loop instead
  localStorage.clear(); localStorage.setItem('unspool:language:v1', 'zh');
  const realRAF = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let virtual = false, vnow = 0, queue = [], id = 1;
  performance.now = () => virtual ? vnow : realNow();
  window.requestAnimationFrame = cb => { if (virtual) { queue.push(cb); return id++; } return realRAF(t => cb(virtual ? vnow : t)); };
  window.__film = {
    start() { if (!virtual) { vnow = realNow(); virtual = true; } },
    step(n) { for (let i = 0; i < n; i++) { vnow += 1000 / 60; const q = queue; queue = []; for (const cb of q) cb(vnow); } },
  };
});
await page.goto(`${option('url', 'http://127.0.0.1:4180/')}?${plain ? '' : `woven&n=${n}&`}dpr=${dsf}`);
await page.waitForFunction(() => { const b = document.querySelector('.begin-button'); return b && !b.disabled; }, null, { timeout: 180_000 });
await page.waitForTimeout(1500);
if (plain) await page.evaluate(() => { document.querySelector('#ui').style.display = 'none'; window.__film.start(); });
else await page.evaluate(() => { document.querySelector('#ui').style.display = 'none'; window.__woven.advance(0.0001, 1); window.__woven.film(); });
const total = Math.round(seconds * 30);
for (let i = 0; i < total; i++) {
  if (plain) await page.evaluate(() => window.__film.step(2)); else await page.evaluate(() => window.__woven.advance(1 / 30, 2));
  await page.screenshot({ path: resolve(out, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
}
console.log(JSON.stringify({ frames: total }));
await browser.close();

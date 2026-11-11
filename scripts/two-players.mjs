#!/usr/bin/env node
// Two browser players on one planet (presence + greeting check).
//   node scripts/two-players.mjs --url http://127.0.0.1:8787/ --out <dir>
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const url = option('url', 'http://127.0.0.1:8787/');
const out = resolve(option('out', 'two-players'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => { localStorage.setItem('unspool:language:v1', 'zh'); });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => { const b = document.querySelector('.begin-button'); return b && !b.disabled; }, null, { timeout: 120000 });
  return page;
}
const a = await join('A');
await a.waitForTimeout(2500);
await a.screenshot({ path: resolve(out, 'title.png') });
const b = await join('B');
await a.click('.begin-button'); await b.click('.begin-button');
await a.waitForTimeout(6000); await b.waitForTimeout(500);
for (const page of [a, b]) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
// A walks a little, then greets
await a.keyboard.down('w'); await a.waitForTimeout(1300); await a.keyboard.up('w');
await a.waitForTimeout(1500);
await a.keyboard.press('g'); await a.waitForTimeout(300);
await a.screenshot({ path: resolve(out, 'a-wheel.png') });
await a.keyboard.press('1');
await b.waitForTimeout(700);
await b.screenshot({ path: resolve(out, 'b-sees-a.png') });
await a.screenshot({ path: resolve(out, 'a-greeted.png') });
console.log(JSON.stringify({ online: await b.locator('.social-online').textContent(), bubble: await b.locator('.social-bubble').allTextContents(), errors }));
await browser.close();

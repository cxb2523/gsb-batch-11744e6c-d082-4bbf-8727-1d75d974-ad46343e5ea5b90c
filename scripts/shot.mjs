#!/usr/bin/env node
// Playtest helper: open the dev server, optionally start the game, run a
// small input script, take screenshots and print the DEV game state.
//   node scripts/shot.mjs --out /tmp/shots --start --steps "wait:1500;shot:arrive;key:w:1500;shot:walk"
// Steps: wait:<ms> | key:<keys+joined>:<ms> | tap:<key> | shot:<name> | eval:<js> | teleport:<lat>,<lon>[,<faceLat>,<faceLon>]
//        complete:<connectionId> | orbit:<dx>,<dy> | zoom:<delta> | state
// Debug helpers (teleport/complete) are for visual checks only, never gameplay evidence.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
const url = option('url', 'http://127.0.0.1:4173/');
const out = resolve(option('out', 'release/shots'));
const [width, height] = option('size', flag('mobile') ? '390x844' : '1280x800').split('x').map(Number);
const steps = (option('steps', 'wait:1000;shot:frame')).split(';').filter(Boolean);
const lang = option('lang', 'zh');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: !flag('headed'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: flag('mobile'), isMobile: flag('mobile') });
if (!flag('keep-save')) await context.addInitScript(language => { if (!sessionStorage.getItem('__shotInit')) { localStorage.clear(); localStorage.setItem('unspool:language:v1', language); sessionStorage.setItem('__shotInit', '1'); } }, lang);
const page = await context.newPage();
const logs = [];
page.on('console', message => { if (['error', 'warning'].includes(message.type())) logs.push(`${message.type()}: ${message.text()}`); });
page.on('pageerror', error => logs.push(`pageerror: ${error.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
const state = async () => JSON.parse(await page.locator('#world').getAttribute('data-game-state') ?? 'null');
if (flag('start')) {
  const start = page.locator('.begin-button, [data-action="start"]').first();
  await start.waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(() => { const b = document.querySelector('.begin-button, [data-action="start"]'); return b && !b.disabled; }, null, { timeout: 90_000 });
  await start.click();
}
for (const step of steps) {
  const [kind, ...rest] = step.split(':');
  const value = rest.join(':');
  if (kind === 'wait') await page.waitForTimeout(Number(value));
  else if (kind === 'shot') { await page.screenshot({ path: resolve(out, `${value}.png`) }); console.log(`shot ${resolve(out, `${value}.png`)}`); }
  else if (kind === 'key') {
    const [keys, ms] = value.split(':');
    const list = keys.split('+');
    for (const key of list) await page.keyboard.down(key);
    await page.waitForTimeout(Number(ms ?? 500));
    for (const key of list.reverse()) await page.keyboard.up(key);
  } else if (kind === 'tap') await page.keyboard.press(value);
  else if (kind === 'eval') console.log(JSON.stringify(await page.evaluate(value)));
  else if (kind === 'teleport') await page.evaluate(v => window.__unspoolDebug.teleport(...v.split(',').map(Number)), value);
  else if (kind === 'complete') await page.evaluate(v => window.__unspoolDebug.complete(v), value);
  else if (kind === 'orbit') await page.evaluate(v => window.__unspoolDebug.orbit(...v.split(',').map(Number)), value);
  else if (kind === 'zoom') await page.evaluate(v => window.__unspoolDebug.zoom(Number(v)), value);
  else if (kind === 'state') console.log(JSON.stringify(await state()));
}
const final = await state();
await writeFile(resolve(out, 'state.json'), JSON.stringify({ state: final, logs }, null, 2));
console.log(JSON.stringify({ fps: final?.fps, phase: final?.phase, objective: final?.objective, drawCalls: final?.renderStats?.calls, triangles: final?.renderStats?.triangles, logs: logs.slice(0, 20) }, null, 1));
await browser.close();

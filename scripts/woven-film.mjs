#!/usr/bin/env node
// PROTOTYPE (proto/woven): render the woven title film frame by frame with a
// fixed time step (the page's RAF loop is stopped), then encode with ffmpeg.
//   node scripts/woven-film.mjs --out <dir> [--size 1920x1080] [--fps 30] [--seconds 17] [--query "woven&n=900"]
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'woven-film'));
const [width, height] = option('size', '1920x1080').split('x').map(Number);
const fps = Number(option('fps', '30'));
const seconds = Number(option('seconds', '18'));
const query = option('query', 'woven&n=900');
const lang = option('lang', 'zh');
const frames = resolve(out, `frames-${width}x${height}`);
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', error => console.error('pageerror', error.message));
await page.goto(`http://127.0.0.1:4173/?${query}`);
await page.waitForFunction(() => { const b = document.querySelector('.begin-button'); return b && !b.disabled; }, null, { timeout: 120_000 });
await page.waitForTimeout(1500);
const portrait = height > width;
await page.evaluate(({ lang, portrait }) => {
  document.querySelector('#ui').style.display = 'none';
  const copy = lang === 'zh'
    ? { title: '牵星', sub: 'Unspool', line: '每一根线，都是一个人走过的路。', tag: '概念验证 · 线条为模拟路线' }
    : { title: 'Unspool', sub: '牵星', line: 'Every thread is someone’s walk.', tag: 'Concept test · simulated routes' };
  const overlay = document.createElement('div');
  overlay.id = 'film-overlay';
  overlay.innerHTML = `<div class="t"><div class="title">${copy.title}<span>${copy.sub}</span></div><div class="line">${copy.line}</div></div><div class="tag">${copy.tag}</div>`;
  const style = document.createElement('style');
  style.textContent = `
    #film-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 99; font-family: "Songti SC", "Noto Serif SC", Georgia, serif; color: #fff7e6; }
    #film-overlay .t { position: absolute; left: 0; right: 0; ${portrait ? 'top: 9%' : 'bottom: 9%'}; text-align: center; opacity: 0; text-shadow: 0 2px 18px rgba(10,12,40,.8); }
    #film-overlay .title { font-size: ${portrait ? 92 : 76}px; letter-spacing: .12em; }
    #film-overlay .title span { font-size: .32em; letter-spacing: .3em; margin-left: .8em; opacity: .75; font-family: Georgia, serif; }
    #film-overlay .line { margin-top: 14px; font-size: ${portrait ? 40 : 30}px; letter-spacing: .08em; opacity: .9; }
    #film-overlay .tag { position: absolute; right: 22px; top: 18px; font: 14px/1 -apple-system, sans-serif; color: rgba(255,255,255,.55); letter-spacing: .05em; }`;
  document.head.append(style); document.body.append(overlay);
}, { lang, portrait });
await page.evaluate(() => { window.__woven.advance(0.0001, 1); window.__woven.film(); });
const total = Math.round(seconds * fps);
for (let i = 0; i < total; i++) {
  const t = i / fps;
  // title fades in for the final pull-back
  const opacity = Math.min(1, Math.max(0, (t - 15.2) / 1.2));
  await page.evaluate(o => { document.querySelector('#film-overlay .t').style.opacity = String(o); }, opacity);
  await page.evaluate(step => window.__woven.advance(step, 2), 1 / fps);
  await page.screenshot({ path: resolve(frames, `${String(i).padStart(4, '0')}.png`) });
  if (i % 60 === 0) console.log(`frame ${i}/${total}`);
}
await browser.close();
const video = resolve(out, `woven-${width}x${height}.mp4`);
execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', resolve(frames, '%04d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
console.log(video);

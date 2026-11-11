#!/usr/bin/env -S npx tsx
// Multiplayer scene for the promo: one filming client plus N peers, all on
// virtual clocks stepped in lockstep, connected to a local `wrangler dev`
// Durable Object. Everything shown is the real presence/greeting feature.
//   npx tsx scripts/promo/multi.ts --out DIR --save save.json [--peers 3] [--size 1920x1080 --dsf 2]
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { createWorld } from '../../src/world/index.ts';
import { buildNav, nearestReachable } from '../../tests/world-nav.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option('url', 'http://127.0.0.1:4180/');
const online = option('online', 'http://127.0.0.1:8788');
const out = resolve(option('out', '/tmp/multi'));
const [width, height] = option('size', '1920x1080').split('x').map(Number);
const dsf = Number(option('dsf', '2'));
const peersCount = Number(option('peers', '3'));
const seconds = Number(option('seconds', '7'));
const quality = Number(option('jpeg', '90'));
const orbitArg = option('orbit', '');
const drift = Number(option('drift', '22'));
const save: Record<string, string> = JSON.parse(await readFile(option('save', ''), 'utf8'));
delete save['unspool:pose:v1'];
// Everyone starts around the open harbor square, facing its middle.
const world = await createWorld();
const nav = buildNav(world, world.anchors.spawn.position, 60000);
const place = option('place', 'tree');
const tree = world.anchors.greatTree;
const centerWant = place === 'tree'
  ? tree.position.clone().addScaledVector(new Vector3(0, 1, 0).projectOnPlane(tree.normal).normalize(), -Number(option('back', '4.2')))
  : world.anchors.sockets.hub_harbor.position.clone();
const centerIndex = nearestReachable(nav, centerWant).index;
const center = nav.points[centerIndex];
const ring = (k: number, n: number, r: number) => {
  const up = center.clone().normalize();
  const east = new Vector3(0, 1, 0).cross(up).normalize(), north = up.clone().cross(east);
  const a = k / n * Math.PI * 2 + 0.4;
  const want = center.clone().addScaledVector(east, Math.cos(a) * r).addScaledVector(north, Math.sin(a) * r);
  const p = nav.points[nearestReachable(nav, want).index];
  const forward = center.clone().sub(p).projectOnPlane(p.clone().normalize()).normalize();
  return { position: p.toArray(), forward: forward.toArray() };
};
const poseSave = (pose: { position: number[]; forward: number[] }) => ({ ...save, 'unspool:pose:v1': JSON.stringify({ version: 2, introCompleted: true, pose }) });
const up = center.clone().normalize();
const lat = Math.asin(up.y) * 180 / Math.PI, lon = Math.atan2(up.x, up.z) * 180 / Math.PI;
const orbit = orbitArg ? orbitArg.split(',').map(Number) : [lat, lon, Number(option('bearing', '180')), Number(option('distance', '4.7')), Number(option('elev', '22')), 0.9];
console.log('center', lat.toFixed(2), lon.toFixed(2));
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const lang = option('lang', 'zh');
const clock = ({ save, lang }: { save: Record<string, string>; lang: string }) => {
  if (!sessionStorage.getItem('__film')) {
    localStorage.clear();
    for (const [k, v] of Object.entries(save)) localStorage.setItem(k, v);
    localStorage.setItem('unspool:language:v1', lang);
    sessionStorage.setItem('__film', '1');
  }
  const realRAF = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let virtual = false, vnow = 0, queue: FrameRequestCallback[] = [], id = 1;
  performance.now = () => virtual ? vnow : realNow();
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    if (virtual) { queue.push(cb); return id++; }
    return realRAF(t => cb(virtual ? vnow : t));
  };
  (window as unknown as { __film: unknown }).__film = {
    start() { if (!virtual) { vnow = realNow(); virtual = true; } },
    step(n: number) { for (let i = 0; i < n; i++) { vnow += 1000 / 60; const q = queue; queue = []; for (const cb of q) cb(vnow); } },
  };
};

const browser: Browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors: string[] = [];
async function open(name: string, film: boolean, pose: { position: number[]; forward: number[] }): Promise<Page> {
  const context = await browser.newContext(film ? { viewport: { width, height }, deviceScaleFactor: dsf } : { viewport: { width: 480, height: 270 }, deviceScaleFactor: 1 });
  await context.addInitScript(clock, { save: poseSave(pose), lang });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  const query = new URLSearchParams({ online });
  if (film && dsf > 1) query.set('dpr', String(dsf));
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => { const b = document.querySelector<HTMLButtonElement>('.begin-button'); return b && !b.disabled; }, null, { timeout: 180_000 });
  await page.waitForTimeout(800);
  await page.click('.begin-button');
  return page;
}

const n = peersCount + 1;
const film = await open('film', true, ring(0, n, 1.7));
const peers: Page[] = [];
for (let i = 0; i < peersCount; i++) peers.push(await open(`peer${i}`, false, ring(i + 1, n, 1.7 + (i % 2) * 0.5)));
const all = [...peers, film];
// let everyone arrive and connect in real time
await film.waitForFunction(() => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').phase === 'playing', null, { timeout: 60_000 });
for (const page of all) {
  const open = await page.evaluate(() => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').dialogueOpen);
  if (open) await page.keyboard.press('Escape');
}
await film.waitForTimeout(3000);
await film.addStyleTag({ content: `.hud, .keyboard-hint, .icon-button, .objective-card, .social-button, .social-online, .social-wheel, .notice-paper, .caption, .interaction-prompt { visibility: hidden !important; }
  /* recording only: bubbles enlarged for phone-sized playback */
  .social-bubble { font-size: 30px !important; padding: 12px 22px !important; border-width: 4px !important; border-radius: 20px !important; max-width: none !important; }
  .social-bubble::after { width: 18px !important; height: 18px !important; bottom: -12px !important; margin-left: -9px !important; border-width: 4px !important; }` });
for (const page of all) await page.evaluate(() => (window as any).__film.start());

let frame = 0;
const step = async (n: number) => {
  for (const peer of peers) await peer.evaluate(n => (window as any).__film.step(n), n);
  await film.waitForTimeout(25);
  await film.evaluate(n => (window as any).__film.step(n), n);
};
const shoot = async () => film.screenshot({ path: resolve(out, `${String(frame++).padStart(5, '0')}.jpg`), type: 'jpeg', quality });
const setCamera = (t: number) => film.evaluate(([lat, lon, b, d, e, h]) => (window as any).__worldDebug.orbit(lat, lon, b, d, e, h), [orbit[0], orbit[1], orbit[2] + drift * t / seconds, orbit[3], orbit[4], orbit[5]]);

// Choreography (virtual seconds): peers stroll out in different directions,
// turn, and greet; the filmed player greets back.
const plan: { at: number; page: Page; action: () => Promise<unknown> }[] = [];
const hold = (page: Page, keys: string[]) => async () => { for (const k of ['w', 'a', 's', 'd']) await page.keyboard.up(k); for (const k of keys) await page.keyboard.down(k); };
const greet = (page: Page, n: number) => async () => { await page.keyboard.press('g'); await page.keyboard.press(String(n)); };
const moves = [[], ['d'], ['a']];
peers.forEach((peer, i) => {
  plan.push({ at: 0.2 + i * 0.35, page: peer, action: hold(peer, moves[i % moves.length]) });
  plan.push({ at: 0.75 + i * 0.35, page: peer, action: hold(peer, []) });
});
const greetings: [number, number, number][] = [[1.2, 0, 1], [2.1, 1, 2], [3.0, -1, 3], [3.9, 2, 1]];
for (const [at, who, n] of greetings) {
  const page = who < 0 ? film : peers[who % peers.length];
  if (page) plan.push({ at, page, action: greet(page, n) });
}
plan.sort((a, b) => a.at - b.at);

const total = Math.round(seconds * 30);
const events: { frame: number; at: number; kind: string }[] = [];
for (let i = 0; i < total; i++) {
  const t = i / 30;
  while (plan.length && plan[0].at <= t) {
    const item = plan.shift()!;
    await item.action();
    if (item.action.toString().includes("'g'")) events.push({ frame: i, at: t, kind: 'greet' });
  }
  await setCamera(t);
  await step(2);
  await shoot();
}
await writeFile(resolve(out, 'markers.json'), JSON.stringify({ frames: frame, events, errors }, null, 2));
console.log(JSON.stringify({ frames: frame, events, errors: errors.slice(0, 5), peersSeen: await film.locator('.social-online').textContent() }));
await browser.close();

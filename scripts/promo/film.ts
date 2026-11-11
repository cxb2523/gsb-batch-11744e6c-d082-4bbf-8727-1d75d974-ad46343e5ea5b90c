#!/usr/bin/env -S npx tsx
// Frame-exact capture for trailers: a virtual clock replaces requestAnimationFrame /
// performance.now, so the game advances exactly 1/60 s per step and every captured
// frame is sharp no matter how slow the screenshot is. Walking uses ordinary keys
// steered along the offline nav grid (same as scripts/playtest.ts).
//   npx tsx .capture/film.ts --plan opening|phone|finale --out DIR [--size 1920x1080] [--save save.json]
import { chromium, type Page } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { createWorld } from '../../src/world/index.ts';
import { CONNECTIONS, type ConnectionId } from '../../src/chapter/data.ts';
import { buildNav, nearestReachable, route, standingFor } from '../../tests/world-nav.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option('url', 'http://127.0.0.1:4180/');
const query = option('query', 'dpr=2');
const url = `${base}?${query}`;
const dsf = Number(option('dsf', '2'));
const out = resolve(option('out', '/tmp/unspool-film'));
const plan = option('plan', 'opening');
const savePath = option('save', '');
const lang = option('lang', 'zh');
const [width, height] = option('size', '1920x1080').split('x').map(Number);
const quality = Number(option('jpeg', '92'));
const stillsDir = resolve(option('stills', resolve(out, '..', 'stills')));
const prefix = option('prefix', plan);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await mkdir(stillsDir, { recursive: true });

const save: Record<string, string> = savePath ? JSON.parse(await readFile(savePath, 'utf8')) : {};
const world = await createWorld();
const nav = buildNav(world, world.anchors.spawn.position, 60000);
// --startat <socket>: begin standing next to that socket (pose save), skipping long real walks.
const startAt = option('startat', '');
if (startAt) {
  const anchor = world.anchors.sockets[startAt as keyof typeof world.anchors.sockets];
  const stand = standingFor(nav, anchor.position, anchor.normal, 1.25)!;
  const p = nav.points[stand.index];
  const forward = anchor.position.clone().sub(p).projectOnPlane(p.clone().normalize()).normalize();
  save['unspool:pose:v1'] = JSON.stringify({ version: 2, introCompleted: true, pose: { position: p.toArray(), forward: forward.toArray() } });
}
const target = (socket: keyof typeof world.anchors.sockets) => {
  const anchor = world.anchors.sockets[socket];
  const stand = standingFor(nav, anchor.position, anchor.normal, 1.25);
  if (!stand) throw new Error(`no standing spot for ${socket}`);
  return stand.index;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf });
await context.addInitScript(({ save, lang }) => {
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
    step(n: number) {
      for (let i = 0; i < n; i++) { vnow += 1000 / 60; const q = queue; queue = []; for (const cb of q) cb(vnow); }
    },
    stop() { virtual = false; const q = queue; queue = []; for (const cb of q) realRAF(cb); },
  };
}, { save, lang });
const page = await context.newPage();
const logs: string[] = [];
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', e => logs.push(e.message));
await page.goto(url);

interface State { phase: string; position: number[]; normal: number[]; forward: number[]; dialogueOpen: boolean; blocked: boolean;
  prompt: { kind: string; socket: string } | null; carrying: string | null; completed: string[]; fps: number; pixelRatio: number }
const state = async (): Promise<State> => JSON.parse(await page.locator('#world').getAttribute('data-game-state') ?? 'null');

// ---- frame capture -------------------------------------------------------
let frameNo = 0;
let virtual = false;
const step = async (n: number) => { await page.evaluate(n => (window as any).__film.step(n), n); };
const capture = async () => { await page.screenshot({ path: resolve(out, `${String(frameNo++).padStart(5, '0')}.jpg`), type: 'jpeg', quality }); };
const still = async (name: string) => { const path = resolve(stillsDir, `${prefix}-${name}.png`); await page.screenshot({ path }); console.log(`still ${path}`); };
const goVirtual = async () => { await page.evaluate(() => (window as any).__film.start()); virtual = true; };
const markers: Record<string, number> = {};
const mark = (name: string) => { markers[name] = frameNo; };

/** Advance `seconds` of game time; capture every `every` steps (2 = 30 fps real speed, 4 = 2× time-lapse). */
async function roll(seconds: number, opts: { every?: number; capture?: boolean; each?: (s: State) => Promise<boolean | void> } = {}) {
  const every = opts.every ?? 2;
  const shots = Math.round(seconds * 60 / every);
  for (let i = 0; i < shots; i++) {
    await step(every);
    if (opts.capture !== false) await capture();
    if (opts.each && await opts.each(await state())) return;
  }
}

const hidden = `
  #ui > *:not(.social), .social-button, .social-online, .social-wheel { visibility: hidden !important; }
  .social-bubble { font-size: 30px !important; padding: 12px 22px !important; border-width: 4px !important; border-radius: 20px !important; }
`;
let styleHandle: Awaited<ReturnType<Page['addStyleTag']>> | null = null;
const cleanUI = async (on: boolean) => {
  if (on && !styleHandle) styleHandle = await page.addStyleTag({ content: hidden });
  if (!on && styleHandle) { await styleHandle.evaluate(el => el.remove()); styleHandle = null; }
};

// ---- input -----------------------------------------------------------------
const held = new Set<string>();
const hold = async (keys: string[]) => {
  for (const key of [...held]) if (!keys.includes(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
};

/** Steering toward the next nav waypoint, like a player holding WASD. */
function steer(s: State, path: Vector3[], cursor: { index: number }): string[] | null {
  const position = new Vector3(...s.position), normal = new Vector3(...s.normal), forward = new Vector3(...s.forward);
  while (cursor.index < path.length - 1 && position.distanceTo(path[cursor.index]) < 0.55) cursor.index++;
  const goal = path[cursor.index];
  if (cursor.index === path.length - 1 && position.distanceTo(goal) < 0.35) return null;
  const desired = goal.clone().sub(position).projectOnPlane(normal).normalize();
  const right = forward.clone().cross(normal).normalize();
  const angle = Math.atan2(desired.dot(right), desired.dot(forward));
  const keys: string[] = [];
  if (Math.cos(angle) > 0.38) keys.push('w');
  if (Math.cos(angle) < -0.38) keys.push('s');
  if (Math.sin(angle) > 0.38) keys.push('d');
  if (Math.sin(angle) < -0.38) keys.push('a');
  return keys;
}

const planRoute = async (to: number) => {
  const s = await state();
  const here = nearestReachable(nav, new Vector3(...s.position)).index;
  return route(nav, here, to).map(i => nav.points[i]);
};

/** Real-time walk (not filmed). */
async function walkReal(to: number) {
  const path = await planRoute(to);
  const cursor = { index: 0 };
  let best = Infinity, lastProgress = Date.now(), stuck = 0;
  for (;;) {
    const s = await state();
    if (s.dialogueOpen) { await hold([]); await page.keyboard.press('Enter'); await page.waitForTimeout(150); continue; }
    const keys = steer(s, path, cursor);
    if (!keys) break;
    const d = new Vector3(...s.position).distanceTo(path[cursor.index]);
    if (d < best - 0.05) { best = d; lastProgress = Date.now(); }
    if (Date.now() - lastProgress > 2500) {
      if (++stuck > 6) throw new Error('stuck (real walk)');
      lastProgress = Date.now(); best = Infinity;
      await hold([stuck % 2 ? 'a' : 'd']); await page.waitForTimeout(380); await hold([]); await page.keyboard.press('Space');
    }
    await hold(keys);
    await page.waitForTimeout(60);
  }
  await hold([]);
}

/** Filmed walk in virtual time. */
async function walkFilmed(to: number, every: number) {
  const path = await planRoute(to);
  const cursor = { index: 0 };
  let best = Infinity, lastProgress = 0, t = 0, stuck = 0;
  for (;;) {
    const s = await state();
    const keys = steer(s, path, cursor);
    if (!keys) break;
    const d = new Vector3(...s.position).distanceTo(path[cursor.index]);
    if (d < best - 0.05) { best = d; lastProgress = t; }
    if (t - lastProgress > 3) {
      if (++stuck > 6) throw new Error('stuck (filmed walk)');
      lastProgress = t; best = Infinity;
      await hold([stuck % 2 ? 'a' : 'd']); await roll(0.4, { every }); await hold([]); await page.keyboard.press('Space');
    }
    await hold(keys);
    await step(every); await capture(); t += every / 60;
  }
  await hold([]);
}

async function waitPrompt(kind: string, filmed: boolean, limit = 4) {
  for (let t = 0; t < limit; t += 1 / 15) {
    const s = await state();
    if (s.prompt?.kind === kind) return true;
    if (filmed) { await step(4); await capture(); } else await page.waitForTimeout(70);
  }
  return false;
}

/** Show the first line of each dialogue beat for `show` seconds, then dismiss. */
async function handleDialogues(show: number, every = 2, maxSeconds = 20) {
  let t = 0;
  while (t < maxSeconds) {
    const s = await state();
    if (!s.dialogueOpen) return;
    await roll(show, { every }); t += show;
    await page.keyboard.press('Enter');
    await roll(0.25, { every }); t += 0.25;
    // finish typing / extra lines of the same beat without lingering
    const after = await state();
    if (after.dialogueOpen) continue;
  }
}

async function begin() {
  await page.waitForFunction(() => { const b = document.querySelector<HTMLButtonElement>('.begin-button'); return b && !b.disabled; }, null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
}

/** Instant follow-camera nudge (orbit dx/dy in pointer pixels, zoom in wheel units). */
async function camera(dx: number, dy: number, zoom: number) {
  await page.evaluate(([dx, dy, zoom]) => { const d = (window as any).__unspoolDebug; if (dx || dy) d.orbit(dx, dy); if (zoom) d.zoom(zoom); }, [dx, dy, zoom]);
}
/** Spread a camera move over `seconds` of filmed time. */
async function cameraOver(seconds: number, dx: number, dy: number, zoom: number, every = 2) {
  const n = Math.max(1, Math.round(seconds * 60 / every));
  for (let i = 0; i < n; i++) { await camera(dx / n, dy / n, zoom / n); await step(every); await capture(); }
}

const connection = (id: ConnectionId) => CONNECTIONS.find(c => c.id === id)!;

// ---- plans -----------------------------------------------------------------
if (plan === 'opening') {
  await begin();
  await goVirtual();
  mark('title');
  await roll(0.5, { capture: false });
  await still('title');
  await roll(3);
  mark('start');
  await page.click('.begin-button');
  await cleanUI(true);
  // arrival; Wick's greeting shows briefly
  await roll(4, { each: async s => s.dialogueOpen });
  mark('dialogue');
  if ((await state()).dialogueOpen) {
    await roll(1.4, { capture: false });
    await cleanUI(false); await still('arrival-dialogue'); await cleanUI(true);
    for (let i = 0; i < 14 && (await state()).dialogueOpen; i++) { await page.keyboard.press('Enter'); await roll(0.3, { capture: false }); }
    // let the camera settle back behind the courier before the cut lands
    await roll(1.2, { capture: false });
  }
  const h1 = connection('h1');
  mark('toSource');
  await walkFilmed(target(h1.from), 2);
  await waitPrompt('pickup', true);
  await cleanUI(false);
  await roll(0.3, { capture: false });
  await still('pickup-prompt');
  await cleanUI(true);
  await roll(0.6);
  mark('pickup');
  await page.keyboard.press('e');
  await roll(1.6);
  mark('laying');
  await camera(0, 40, 300);
  await walkFilmed(target(h1.to), 4);
  await waitPrompt('connect', true);
  // pull back so the pulse can be seen running along the laid thread
  await cameraOver(0.8, 0, 120, 200);
  mark('connect');
  await page.keyboard.press('e');
  await roll(1.2);
  await still('connect-pulse');
  await roll(1.4);
  await still('connect-wave');
  await cameraOver(4.5, 260, 40, 400);
  await still('connect-color');
  mark('end');
} else if (plan === 'lay') {
  // v2: pick up, lay and connect one thread, filmed from the follow camera with an offset.
  const c = connection(option('conn', 'w1') as ConnectionId);
  const [dx, dy, zoom] = option('cam', '0,40,300').split(',').map(Number);
  await begin();
  await page.click('.begin-button');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').phase === 'playing', null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await walkReal(target(c.from));
  if (!await waitPrompt('pickup', false)) throw new Error('no pickup prompt');
  await goVirtual();
  await cleanUI(true);
  await camera(dx, dy, zoom);
  await roll(0.8);
  mark('pickup');
  await page.keyboard.press('e');
  await roll(1.0);
  mark('laying');
  await walkFilmed(target(c.to), Number(option('every', '3')));
  await waitPrompt('connect', true);
  await roll(0.3);
  mark('connect');
  await page.keyboard.press('e');
  await roll(Number(option('after', '4')));
  mark('end');
} else if (plan === 'laying') {
  // Stills mid-walk: pick up a thread and stop partway along the route to its target.
  const c = connection(option('conn', 'w1') as ConnectionId);
  const fraction = Number(option('frac', '0.6'));
  await begin();
  await page.click('.begin-button');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').phase === 'playing', null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await walkReal(target(c.from));
  if (!await waitPrompt('pickup', false)) throw new Error('no pickup prompt');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  const full = await planRoute(target(c.to));
  const stop = full[Math.floor(full.length * fraction)];
  const stopIndex = nearestReachable(nav, stop).index;
  await walkReal(stopIndex);
  await hold(['w']); await page.waitForTimeout(250); await hold([]);
  await cleanUI(true);
  await page.waitForTimeout(900);
  await still('follow');
  const s = await state();
  const [x, y, z] = s.position; const r = Math.hypot(x, y, z);
  const lat = Math.asin(y / r) * 180 / Math.PI, lon = Math.atan2(x, z) * 180 / Math.PI;
  for (const [bearing, distance, elevation] of [[0, 6, 40], [90, 6, 40], [180, 6, 40], [270, 6, 40], [45, 9, 55], [225, 9, 55]]) {
    await page.evaluate(([lat, lon, b, d, e]) => (window as any).__worldDebug.orbit(lat, lon, b, d, e, 0.6), [lat, lon, bearing, distance, elevation]);
    await page.waitForTimeout(600);
    await still(`b${bearing}-d${distance}`);
  }
  console.log(JSON.stringify({ lat, lon }));
} else if (plan === 'postcard') {
  // Real-time finale (no virtual clock), then the chapter card's postcard button.
  const c = connection('fo');
  await begin();
  await page.click('.begin-button');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').phase === 'playing', null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await walkReal(target(c.from));
  if (!await waitPrompt('pickup', false)) throw new Error('no pickup prompt');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await walkReal(target(c.to));
  if (!await waitPrompt('connect', false)) throw new Error('no connect prompt');
  await page.keyboard.press('e');
  await page.locator('.chapter-postcard').waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForTimeout(1500);
  await page.locator('.chapter-postcard').click();
  await page.locator('.postcard-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(900);
  await still('postcard');
} else if (plan === 'phone' || plan === 'finale') {
  const id: ConnectionId = plan === 'phone' ? 'o2' : 'fo';
  await begin();
  await page.click('.begin-button');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').phase === 'playing', null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const c = connection(id);
  await walkReal(target(c.from));
  if (!await waitPrompt('pickup', false)) throw new Error('no pickup prompt');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await walkReal(target(c.to));
  if (!await waitPrompt('connect', false)) throw new Error('no connect prompt');
  await goVirtual();
  await cleanUI(true);
  await roll(0.5);
  mark('connect');
  await page.keyboard.press('e');
  if (plan === 'phone') {
    await roll(2.4);
    mark('phone');
    // The game's conversation camera gets boxed in by the window shutters here,
    // so film the phone call from the free debug camera above the alley.
    if (!args.includes('--gamecam')) await page.evaluate(() => (window as any).__worldDebug.orbit(25.5, -115, 210, 5.6, 36, 1.5));
    let quiet = 0, seen = false, beat = 0;
    while (quiet < 1.2 && beat < 14) {
      const s = await state();
      if (!s.dialogueOpen) { await roll(0.2); if (seen) quiet += 0.2; continue; }
      seen = true; quiet = 0;
      await roll(2.0);
      if (beat === 2) await still('phone-dialogue');
      await page.keyboard.press('Enter');
      await roll(0.25);
      beat++;
    }
    await roll(1.5);
    await still('phone-after');
    await page.evaluate(() => (window as any).__worldDebug.off());
  } else {
    for (let i = 0; i < 34; i++) {
      await roll(0.5);
      if (i === 8) await still('finale-overview');
      if (i === 16) await still('finale-around');
      if (i === 26) await still('finale-farhouse');
      if (await page.locator('.chapter-card').isVisible().catch(() => false)) { mark('card'); break; }
    }
    await cleanUI(false);
    await roll(1.5);
    await still('chapter-card');
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('.chapter-postcard')?.click());
    for (let i = 0; i < 24; i++) {
      await roll(0.25, { capture: false });
      await page.waitForTimeout(150);
      if (await page.locator('.postcard-preview canvas, .postcard-preview img').first().isVisible().catch(() => false)) break;
    }
    await roll(1, { capture: false });
    await page.waitForTimeout(600);
    await still('postcard');
  }
  mark('end');
}

await writeFile(resolve(out, 'markers.json'), JSON.stringify({ markers, frames: frameNo, logs }, null, 2));
console.log(JSON.stringify({ plan, frames: frameNo, markers, logs: logs.slice(0, 5), pixelRatio: (await state())?.pixelRatio }));
await browser.close();

#!/usr/bin/env -S npx tsx
// End-to-end chapter playtest with ordinary keyboard input.
// An offline nav grid (same physics rules) plans waypoints; the browser is
// driven only with W/A/S/D/E/Enter like a player would. No debug teleports.
//   npx tsx scripts/playtest.ts --url http://127.0.0.1:4173/ --out /tmp/unspool-play [--only h1,h2] [--shots]
import { chromium, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { createWorld } from '../../src/world/index.ts';
import { CONNECTIONS, type ConnectionId } from '../../src/chapter/data.ts';
import { buildNav, nearestReachable, route, standingFor } from '../../tests/world-nav.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const url = option('url', 'http://127.0.0.1:4173/');
const out = resolve(option('out', '/tmp/unspool-play'));
const only = option('only', '').split(',').filter(Boolean) as ConnectionId[];
const shots = args.includes('--shots');
await mkdir(out, { recursive: true });

console.log('building world + nav grid…');
const world = await createWorld();
const nav = buildNav(world, world.anchors.spawn.position, 60000);
const target = (socket: keyof typeof world.anchors.sockets) => {
  const anchor = world.anchors.sockets[socket];
  const stand = standingFor(nav, anchor.position, anchor.normal, 1.25);
  if (!stand) throw new Error(`no standing spot for ${socket}`);
  return stand.index;
};

interface State { phase: string; position: number[]; normal: number[]; forward: number[]; dialogueOpen: boolean; blocked: boolean;
  prompt: { kind: string; socket: string } | null; carrying: string | null; completed: string[]; taut: boolean; fps: number; remaining: number }

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const saveFile = option('save', '');
const save: Record<string, string> = saveFile ? JSON.parse(await (await import('node:fs/promises')).readFile(saveFile, 'utf8')) : {};
await context.addInitScript(save => { if (!sessionStorage.getItem('__play')) { localStorage.clear(); for (const [k, v] of Object.entries(save)) localStorage.setItem(k, v); localStorage.setItem('unspool:language:v1', 'zh'); sessionStorage.setItem('__play', '1'); } }, save);
const page = await context.newPage();
const logs: string[] = [];
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', e => logs.push(e.message));
await page.goto(url);
const state = async (): Promise<State> => JSON.parse(await page.locator('#world').getAttribute('data-game-state') ?? 'null');
await page.waitForFunction(() => { const b = document.querySelector<HTMLButtonElement>('.begin-button'); return b && !b.disabled; }, null, { timeout: 120_000 });
await page.click('.begin-button');
const started = Date.now();
const report: Record<string, unknown>[] = [];
const dump = async (name: string) => {
  const data = await page.evaluate(() => { const o: Record<string, string> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k)!; } return o; });
  await writeFile(resolve(out, `${name}.json`), JSON.stringify(data));
};
let shot = 0;
const snap = async (name: string) => { if (shots) await page.screenshot({ path: resolve(out, `${String(++shot).padStart(2, '0')}-${name}.png`) }); };

const held = new Set<string>();
const hold = async (keys: string[]) => {
  for (const key of [...held]) if (!keys.includes(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
};
async function closeDialogues(limit = 40) {
  for (let i = 0; i < limit; i++) {
    const s = await state();
    if (!s?.dialogueOpen) return;
    await hold([]);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(140);
  }
}

async function walk(to: number, label: string, expect?: string): Promise<{ seconds: number; length: number; stuck: number }> {
  const t0 = Date.now();
  let s = await state();
  const here = nearestReachable(nav, new Vector3(...s.position)).index;
  const path = route(nav, here, to).map(i => nav.points[i]);
  let length = 0; for (let i = 1; i < path.length; i++) length += path[i].distanceTo(path[i - 1]);
  let index = 0, stuck = 0, lastProgress = Date.now(), best = Infinity;
  while (index < path.length) {
    s = await state();
    if (s.dialogueOpen) { await closeDialogues(); continue; }
    const position = new Vector3(...s.position), normal = new Vector3(...s.normal), forward = new Vector3(...s.forward);
    // Skip ahead to the furthest waypoint within reach for smoother steering.
    while (index < path.length - 1 && position.distanceTo(path[index]) < 0.55) index++;
    const goal = path[index];
    const distance = position.distanceTo(goal);
    if (index === path.length - 1 && distance < 0.35) break;
    if (distance < best - 0.05) { best = distance; lastProgress = Date.now(); }
    if (Date.now() - lastProgress > 2500) {
      if (expect && s.prompt?.kind === expect) break;
      stuck++; lastProgress = Date.now(); best = Infinity;
      // Sidestep like a player would, then hop.
      await hold([stuck % 2 ? 'a' : 'd']); await page.waitForTimeout(380); await hold([]);
      await page.keyboard.press('Space');
      if (stuck > 6) {
        await hold([]);
        await page.screenshot({ path: resolve(out, `stuck-${label.replace(':', '-')}.png`) });
        throw new Error(`stuck walking to ${label} at ${s.position.map(n => n.toFixed(2))} (waypoint ${index}/${path.length}, goal ${goal.toArray().map(n => n.toFixed(2))})`);
      }
    }
    const desired = goal.clone().sub(position).projectOnPlane(normal).normalize();
    const right = forward.clone().cross(normal).normalize();
    const angle = Math.atan2(desired.dot(right), desired.dot(forward));
    const keys: string[] = [];
    if (Math.cos(angle) > 0.38) keys.push('w');
    if (Math.cos(angle) < -0.38) keys.push('s');
    if (Math.sin(angle) > 0.38) keys.push('d');
    if (Math.sin(angle) < -0.38) keys.push('a');
    await hold(keys);
    await page.waitForTimeout(60);
  }
  await hold([]);
  return { seconds: (Date.now() - t0) / 1000, length, stuck };
}

async function interact(kind: string, timeout = 4000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const s = await state();
    if (s.prompt?.kind === kind) { await page.keyboard.press('e'); return true; }
    await page.waitForTimeout(100);
  }
  return false;
}

await page.waitForFunction(() => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').phase === 'playing', null, { timeout: 30_000 });
await snap('arrive');
await closeDialogues();

for (const connection of CONNECTIONS) {
  if (only.length && !only.includes(connection.id)) continue;
  const entry: Record<string, unknown> = { id: connection.id };
  const toSource = await walk(target(connection.from), `${connection.id}:${connection.from}`, 'pickup');
  entry.toSource = toSource;
  const picked = await interact('pickup');
  if (!picked) { entry.error = 'no pickup prompt'; report.push(entry); console.log(JSON.stringify(entry)); break; }
  await page.waitForTimeout(300);
  const laying = walk(target(connection.to), `${connection.id}:${connection.to}`, 'connect');
  if (shots) setTimeout(() => void snap(`${connection.id}-laying`), 1500);
  entry.toTarget = await laying;
  const s = await state();
  entry.remaining = s.remaining; entry.taut = s.taut;
  const connected = await interact('connect');
  if (!connected) { entry.error = `no connect prompt (prompt=${JSON.stringify(s.prompt)}, carrying=${s.carrying})`; report.push(entry); console.log(JSON.stringify(entry)); break; }
  await page.waitForFunction(id => JSON.parse(document.querySelector('#world')!.getAttribute('data-game-state') ?? '{}').completed?.includes(id), connection.id, { timeout: 8000 });
  await page.waitForTimeout(1800);
  await snap(`${connection.id}-done`);
  await closeDialogues();
  entry.fps = (await state()).fps;
  await dump(`after-${connection.id}`);
  report.push(entry);
  console.log(JSON.stringify(entry));
}
await page.waitForTimeout(16000);
await snap('finale');
await dump('after-finale');
const final = await state();
const summary = { minutes: (Date.now() - started) / 60000, completed: final.completed, logs, report };
await writeFile(resolve(out, 'report.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ minutes: summary.minutes.toFixed(1), completed: final.completed, errors: logs.slice(0, 5) }));
await browser.close();

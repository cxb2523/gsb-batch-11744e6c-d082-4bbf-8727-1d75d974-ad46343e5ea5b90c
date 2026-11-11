#!/usr/bin/env -S npx tsx
// PROTOTYPE ONLY (proto/woven): simulated traveler routes for the "woven by
// everyone" title shot. These are NOT player data and must never be shipped
// or presented as real visitors.
//   npx tsx scripts/woven-sample.ts --count 300 --out public/woven/sample.json
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Vector3 } from 'three';
import { createWorld } from '../src/world/index.ts';
import { buildNav, nearestReachable, route, standingFor } from '../tests/world-nav.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const count = Number(option('count', '300'));
const out = resolve(option('out', 'public/woven/sample.json'));
let seed = Number(option('seed', '7'));
const wander = Number(option('wander', '0.12'));
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += random(); return (s - 2) / 0.577; };

console.log('building world + nav grid…');
const world = await createWorld();
const nav = buildNav(world, world.anchors.spawn.position, 60000);
const reachable = nav.points.map((_, i) => i).filter(i => nav.reachable[i]);

// Places people actually go: sockets, residents, the tree, the far house.
const poi: number[] = [];
for (const anchor of Object.values(world.anchors.sockets)) {
  const stand = standingFor(nav, anchor.position, anchor.normal, 1.3);
  if (stand) poi.push(stand.index);
}
for (const anchor of [...Object.values(world.anchors.npcs), world.anchors.greatTree, world.anchors.farHouseDoor]) {
  const near = nearestReachable(nav, anchor.position);
  if (near.distance < 3) poi.push(near.index);
}
console.log(`${reachable.length} reachable nodes, ${poi.length} points of interest`);

/** Chaikin-like smoothing on the sphere, then resampling at `step`. */
function smooth(points: Vector3[], passes: number): Vector3[] {
  let p = points;
  for (let k = 0; k < passes; k++) {
    const next = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const v = p[i - 1].clone().add(p[i]).add(p[i]).add(p[i + 1]).multiplyScalar(0.25);
      // keep the height of the original floor (decks, stairs)
      next.push(v.setLength(p[i].length()));
    }
    next.push(p[p.length - 1]);
    p = next;
  }
  return p;
}
function resample(points: Vector3[], step: number): Vector3[] {
  const result = [points[0].clone()];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = a.distanceTo(b);
    let t = step - carry;
    while (t <= length) { result.push(a.clone().lerp(b, t / length)); t += step; }
    carry = length - (t - step);
  }
  return result;
}

const travelers: { c: number; p: number[] }[] = [];
let total = 0;
for (let n = 0; n < count; n++) {
  let at = nav.start;
  const stops = 3 + Math.floor(random() * 7);
  const nodes: number[] = [at];
  for (let s = 0; s < stops; s++) {
    const to = random() > wander ? poi[Math.floor(random() * poi.length)] : reachable[Math.floor(random() * reachable.length)];
    const leg = route(nav, at, to);
    if (leg.length < 2) continue;
    nodes.push(...leg.slice(1));
    at = to;
  }
  if (nodes.length < 6) continue;
  const raw = nodes.map(i => nav.points[i].clone());
  const path = resample(smooth(raw, 6), 0.32);
  // Each traveler keeps to their own side of the road, drifting a little.
  const base = gauss() * 0.2, drift = 0.06 + random() * 0.08, phase = random() * 100;
  const out: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const up = p.clone().normalize();
    const tangent = path[Math.min(path.length - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).projectOnPlane(up).normalize();
    const side = tangent.clone().cross(up).normalize();
    const offset = base + Math.sin(i * 0.11 + phase) * drift + Math.sin(i * 0.37 + phase * 1.7) * drift * 0.4;
    const q = p.clone().addScaledVector(side, offset).addScaledVector(up, 0.045);
    out.push(+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3));
  }
  total += path.length;
  travelers.push({ c: Math.floor(random() * 6), p: out });
}
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ note: 'simulated prototype routes, not player data', travelers }));
console.log(`${travelers.length} travelers, ${total} points → ${out}`);

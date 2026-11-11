import { Vector3 } from 'three';
import { level } from './activation';
import { boat } from './boats';
import { house } from './buildings';
import { Kit, Part, frameRoot, type Ctx } from './context';
import type { Frame } from './frame';
import { shade, type ColorLike } from './kit';
import { GLOW } from './materials';
import { C } from './palette';
import { picto } from './pictos';
import { barrel, bench, buoy, crate, net, ropeCoil, sack, bucket, planter, fence, table, stool } from './props';

/** Pieces of the harbor: warehouse, fish stall, net rack, boat yard props. */

export function warehouse(ctx: Ctx, k: Kit): void {
  const w = 3.1, d = 2.0;
  house(k, {
    w, d, floors: [2.2], wall: '#9cc3bb', roofColor: '#c5604b', roof: 'gable', ridge: 'x', rise: 0.95, overhang: 0.3, front: [['v']], sides: [1], back: [2],
    plinth: 0.2, base: C.stoneDark, shutters: C.white, shingles: true, chimney: null,
  });
  const f = k.at(0, 0, d / 2);
  // big sliding door with X braces
  f.s.box(1.7, 1.75, 0.07, 0, 1.08, 0.02, C.white, { jitter: 0 });
  for (const sx of [-1, 1]) {
    f.d.box(0.8, 1.62, 0.06, sx * 0.41, 1.06, 0.06, C.plank, { jitter: 0.02 });
    f.s.rod(sx * 0.41 - 0.34, 0.3, 0.1, sx * 0.41 + 0.34, 1.8, 0.1, 0.03, C.woodDark, { seg: 4 });
    f.s.rod(sx * 0.41 + 0.34, 0.3, 0.1, sx * 0.41 - 0.34, 1.8, 0.1, 0.03, C.woodDark, { seg: 4 });
    for (let i = 0; i < 4; i++) f.s.box(0.78, 0.035, 0.07, sx * 0.41, 0.45 + i * 0.4, 0.1, C.woodDark, { jitter: 0 });
  }
  f.s.box(2.0, 0.06, 0.1, 0, 1.98, 0.1, C.iron, { jitter: 0 });
  f.d.ball(0.04, 0.05, 1.05, 0.12, C.brass, { detail: 0 });
  f.d.ball(0.04, -0.05, 1.05, 0.12, C.brass, { detail: 0 });
  // loft hatch + hoist beam
  f.d.box(0.5, 0.45, 0.04, 0, 2.55, 0.03, C.glass, { glow: GLOW.harborWindows, jitter: 0 });
  f.s.box(0.62, 0.57, 0.06, 0, 2.55, 0.02, C.white, { jitter: 0 });
  f.s.box(0.07, 0.07, 0.8, 0, 3.0, 0.4, C.woodDark, { jitter: 0 });
  f.s.rod(0, 3.0, 0.78, 0, 2.5, 0.78, 0.012, C.rope, { seg: 3 });
  f.s.ball(0.05, 0, 2.46, 0.78, C.iron, { detail: 0 });
  f.s.rod(0, 3.04, 0.1, 0, 3.04, 0.7, 0.025, C.woodDark, { seg: 4 });
  // lean-to
  k.s.box(0.9, 0.08, 1.7, 1.95, 1.55, 0, '#c5604b', { rot: [0, 0, 0.22], jitter: 0.02 });
  for (const z of [-0.8, 0.8]) k.s.box(0.08, 1.45, 0.08, 2.35, 0.8, z, C.woodDark, { jitter: 0 });
  k.c.box(0.9, 1.4, 1.7, 1.95, 0.7, 0);
  crate(k.at(1.8, 0, 0.6), 0.5, C.plank);
  crate(k.at(1.8, 0.5, 0.6), 0.4, C.woodLight, false);
  barrel(k.at(2.0, 0, -0.3), 0.6, 0.26, C.woodLight);
  sack(k.at(1.65, 0, -0.55), C.cloth);
  // outside: cart, crates, barrels
  crate(k.at(-1.15, 0, d / 2 + 0.55, 0.3), 0.55, C.plank);
  crate(k.at(-1.15, 0.55, d / 2 + 0.55, 0.1), 0.45, C.woodLight, false);
  barrel(k.at(-0.7, 0, d / 2 + 0.7), 0.62, 0.27, C.plank);
  barrel(k.at(-0.4, 0, d / 2 + 0.5), 0.6, 0.25, C.woodLight);
  crate(k.at(1.1, 0, d / 2 + 0.5, -0.2), 0.5, C.woodLight);
  sack(k.at(1.45, 0, d / 2 + 0.45), C.cloth);
  sack(k.at(1.6, 0, d / 2 + 0.6), shade(C.cloth, -0.1));
  ctx.ground.clear(k.frame.origin, 2.2);
}

/** Fish stall. Frame: +Z toward the customers. Awning flap opens on h2. */
export function fishStall(ctx: Ctx, frame: Frame): void {
  const { b } = ctx;
  const k = b.kit(frame);
  const W = 1.8;
  k.s.box(W, 0.1, 0.8, 0, 0.0, 0, C.plank, { jitter: 0.03 });
  // counter
  k.s.box(W - 0.1, 0.5, 0.45, 0, 0.35, 0.05, C.woodLight, { jitter: 0.03 });
  k.s.box(W, 0.06, 0.55, 0, 0.62, 0.05, C.wood, { jitter: 0.02 });
  for (const sx of [-1, 1]) k.s.box(0.08, 1.7, 0.08, sx * (W / 2 - 0.04), 0.9, -0.3, C.woodDark, { jitter: 0.02 });
  for (const sx of [-1, 1]) k.s.box(0.08, 1.5, 0.08, sx * (W / 2 - 0.04), 0.8, 0.38, C.woodDark, { jitter: 0.02 });
  k.s.box(W, 0.08, 0.08, 0, 1.62, 0.38, C.woodDark, { jitter: 0 });
  k.s.box(W + 0.1, 0.9, 0.05, 0, 1.2, -0.34, C.wallBlue, { jitter: 0.02 });
  // sign board
  k.s.box(0.8, 0.34, 0.06, 0, 1.55, 0.42, C.wallCream, { jitter: 0 });
  picto(k.d, 'fish', 0, 1.55, 0.46, 0.3, C.navy, C.white);
  // ice tray with fish
  k.s.box(1.35, 0.06, 0.38, 0, 0.67, 0.12, C.white, { rot: [-0.18, 0, 0], jitter: 0 });
  const fishColors = ['#9ab6c9', '#e9d49a', '#86a3b9', '#d98f7a', '#b8c9d6'];
  for (let i = 0; i < 7; i++) {
    const x = -0.55 + (i % 7) * 0.18;
    k.d.ball(0.09, x, 0.76 - 0.012 * i % 3, 0.14 + (i % 2) * 0.05, fishColors[i % fishColors.length], { detail: 0, scale: [0.6, 0.4, 1.7], rot: [0, (i % 3 - 1) * 0.25, 0] });
    k.s.cone(0.05, 0.1, x, 0.74, 0.3 + (i % 2) * 0.05, fishColors[(i + 2) % fishColors.length], { seg: 3, rot: [Math.PI / 2, 0, 0], jitter: 0 });
  }
  // scale and baskets
  k.s.box(0.22, 0.04, 0.22, 0.65, 0.68, 0.05, C.ironLight, { jitter: 0 });
  k.s.cyl(0.03, 0.14, 0.65, 0.7, 0.05, C.iron, { seg: 5 });
  k.s.ball(0.04, 0.65, 0.88, 0.05, C.iron, { detail: 0 });
  crate(k.at(-0.55, 0, 0.62, 0.2), 0.34, C.woodLight);
  crate(k.at(-0.15, 0, 0.7, -0.3), 0.3, C.plank);
  barrel(k.at(0.8, 0, 0.62), 0.5, 0.2, C.woodLight);
  bucket(k.at(0.45, 0, 0.7));
  k.c.box(W, 1.0, 0.6, 0, 0.5, 0.05);
  ctx.ground.clear(frame.origin, 1.7);

  // awning: a flap hinged at the top of the back, folded up until h2
  const root = frameRoot(ctx, frame);
  const flap = new Part(ctx, root, frame, new Vector3(0, 1.72, 0.45), 41);
  const a = flap.kit;
  const stripes = 9;
  const len = 1.25;
  for (let i = 0; i < stripes; i++) {
    const x = -W / 2 - 0.05 + (W + 0.1) * (i + 0.5) / stripes;
    a.s.box((W + 0.1) / stripes, 0.03, len, x, 0, -len / 2, i % 2 ? C.white : C.navy, { jitter: 0 });
    a.s.box((W + 0.1) / stripes, 0.12, 0.03, x, -0.06, -len - 0.01, i % 2 ? C.white : C.navy, { jitter: 0 });
  }
  // hanging fish under the front edge
  for (let i = 0; i < 4; i++) {
    const x = -0.65 + i * 0.43;
    a.s.rod(x, -0.02, -len + 0.1, x, -0.3, -len + 0.1, 0.006, C.rope, { seg: 3, jitter: 0 });
    a.d.ball(0.07, x, -0.42, -len + 0.1, fishColors[i], { detail: 0, scale: [0.45, 1.5, 0.45] });
  }
  flap.mount();
  flap.group.rotation.x = -1.35;
  const open = level(ctx, v => { flap.group.rotation.x = -1.35 + v * 1.55; }, 0.8);
  b.onActivate('h2', instant => open.set(1, instant));
}

export function netRack(k: Kit, len = 1.6): void {
  for (const sx of [-1, 1]) {
    k.s.cyl(0.04, 1.35, sx * len / 2, -0.05, 0, C.woodDark, { seg: 5, jitter: 0.03 });
    k.s.rod(sx * len / 2, 0.5, 0, sx * len / 2, 0.2, 0.25, 0.025, C.woodDark, { seg: 4 });
  }
  k.s.box(len + 0.2, 0.05, 0.05, 0, 1.28, 0, C.wood, { jitter: 0 });
  net(k.at(0, 0.45, 0.02), len - 0.15, 0.82, C.rope);
  k.c.box(len + 0.15, 1.2, 0.1, 0, 0.6, 0.0);
}

/** Beached rowboat, bottom up on trestles. */
export function upturnedBoat(k: Kit): void {
  boat(k.at(0, 0.38, 0, 0, 0, Math.PI), { len: 1.7, beam: 0.62, hull: C.roofTeal, stripe: C.white, seats: 0 });
  for (const z of [-0.5, 0.5]) {
    k.s.box(0.65, 0.07, 0.07, 0, 0.1, z, C.woodDark, { jitter: 0 });
    for (const sx of [-1, 1]) k.s.rod(sx * 0.28, 0.02, z, sx * 0.14, 0.34, z, 0.03, C.woodDark, { seg: 4 });
  }
  k.c.box(0.7, 0.6, 1.7, 0, 0.3, 0);
}

export function dinghyOnBeach(k: Kit, hull: ColorLike = C.roofTerracotta): void {
  boat(k.at(0, 0.28, 0), { len: 1.6, beam: 0.62, hull, stripe: C.white, seats: 2, oars: true });
  ropeCoil(k.at(-0.9, 0, 0.3), 0.12);
  k.c.box(0.65, 0.5, 1.6, 0, 0.3, 0);
}

export function driftwood(k: Kit): void {
  k.s.rod(-0.35, 0.05, 0, 0.35, 0.09, 0.1, 0.045, C.woodLight, { seg: 5, jitter: 0.04 });
  k.s.rod(0.05, 0.08, 0.05, 0.3, 0.16, -0.12, 0.025, C.woodLight, { seg: 4 });
}

export function beachSet(k: Kit): void {
  planter(k.at(0, 0, 0), true);
}

/** A cluster of dockside clutter. */
export function dockClutter(k: Kit): void {
  barrel(k.at(0, 0, 0), 0.6, 0.26, C.plank);
  crate(k.at(0.5, 0, 0.1, 0.4), 0.45, C.woodLight);
  buoy(k.at(-0.4, 0, 0.2), C.red);
  ropeCoil(k.at(-0.2, 0, -0.45));
}

export function pierEndFurniture(k: Kit): void {
  bench(k.at(0.3, 0, 0, Math.PI / 2));
  table(k.at(-0.2, 0, 0.3), 0.3, 0.3, 0.45);
  stool(k.at(-0.2, 0, 0.55));
}

void fence;

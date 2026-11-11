import { Vector3 } from 'three';
import { level } from './activation';
import { doorOn, gableRoof, windowOn } from './buildings';
import { Part, frameRoot, Kit, type Ctx } from './context';
import type { Flaps } from './flaps';
import { socketWall } from './fixtures';
import { shade, type ColorLike } from './kit';
import { GLOW } from './materials';
import { C } from './palette';
import type { SurfaceAnchor } from '../contracts';

/** Otto's and Ike's houses: hollow ground-floor rooms behind a real window
 * opening on the alley wall. The sill is 1.05 above the alley, the floor 0.8,
 * so the player can talk through the window but never get in. */

export const FLOOR = 0.8;
export const SILL = 1.05;
export const LINTEL = 2.3;
export const WALL_TOP = 3.0;
const T = 0.16;

export interface NeighborSpec {
  id: 'otto' | 'ike';
  w: number;
  d: number;
  /** -1: alley wall is local -X, +1: local +X */
  alley: -1 | 1;
  wall: ColorLike;
  roof: ColorLike;
  inside: ColorLike;
  floor: ColorLike;
  shutter: ColorLike;
  flaps: Flaps;
  socket: 'otto_window' | 'ike_window';
}

export interface NeighborResult {
  /** Standing point of the resident inside the room, facing the window. */
  npc: SurfaceAnchor;
  /** Kit on the alley wall outer face (z=0 at the wall surface, +Z into the alley). */
  face: Kit;
}

export function neighborHouse(ctx: Ctx, k: Kit, spec: NeighborSpec): NeighborResult {
  const { b } = ctx;
  const { w, d } = spec;
  const sx = spec.alley;
  const t = T;
  const wallH = WALL_TOP - FLOOR;
  const trim = C.white;
  const inner = spec.inside;
  // stone base up to the floor, planked floor on top
  k.s.block(-w / 2 - 0.04, -0.5, -d / 2 - 0.04, w / 2 + 0.04, FLOOR, d / 2 + 0.04, C.stone, { jitter: 0.035 });
  k.s.block(-w / 2 - 0.06, FLOOR - 0.06, -d / 2 - 0.06, w / 2 + 0.06, FLOOR, d / 2 + 0.06, C.stoneDark, { jitter: 0.02 });
  for (let i = 0; i < 7; i++) k.s.box(w - 2 * t, 0.03, (d - 2 * t) / 7 - 0.012, 0, FLOOR + 0.015, -d / 2 + t + (i + 0.5) * (d - 2 * t) / 7, i % 2 ? spec.floor : shade(spec.floor, -0.08), { jitter: 0.02 });
  // outer walls
  const wy = FLOOR + wallH / 2;
  k.s.box(w, wallH, t, 0, wy, -d / 2 + t / 2, spec.wall, { jitter: 0.015 });
  k.s.box(w, wallH, t, 0, wy, d / 2 - t / 2, spec.wall, { jitter: 0.015 });
  k.s.box(t, wallH, d - 2 * t, -sx * (w / 2 - t / 2), wy, 0, spec.wall, { jitter: 0.015 });
  // alley wall pieces around the opening (x = sx * (w/2 - t/2))
  const ax = sx * (w / 2 - t / 2);
  k.s.box(t, SILL - FLOOR, d - 2 * t, ax, (FLOOR + SILL) / 2, 0, spec.wall, { jitter: 0.015 });
  k.s.box(t, WALL_TOP - LINTEL, d - 2 * t, ax, (LINTEL + WALL_TOP) / 2, 0, spec.wall, { jitter: 0.015 });
  const jamb = (d - 2 * t - 1.0) / 2;
  for (const sz of [-1, 1]) k.s.box(t, LINTEL - SILL, jamb, ax, (SILL + LINTEL) / 2, sz * (0.5 + jamb / 2), spec.wall, { jitter: 0.015 });
  // inside lining, ceiling and corner posts
  const il = (x: number, y: number, z: number, sxs: number, sys: number, szs: number) => k.d.box(sxs, sys, szs, x, y, z, inner, { jitter: 0.01 });
  il(0, wy, -d / 2 + t + 0.01, w - 2 * t, wallH, 0.02);
  il(0, wy, d / 2 - t - 0.01, w - 2 * t, wallH, 0.02);
  il(-sx * (w / 2 - t - 0.01), wy, 0, 0.02, wallH, d - 2 * t);
  il(sx * (w / 2 - t - 0.01), (FLOOR + SILL) / 2, 0, 0.02, SILL - FLOOR, d - 2 * t);
  il(sx * (w / 2 - t - 0.01), (LINTEL + WALL_TOP) / 2, 0, 0.02, WALL_TOP - LINTEL, d - 2 * t);
  for (const sz of [-1, 1]) il(sx * (w / 2 - t - 0.01), (SILL + LINTEL) / 2, sz * (0.5 + jamb / 2), 0.02, LINTEL - SILL, jamb);
  k.s.box(w - 2 * t, 0.1, d - 2 * t, 0, WALL_TOP - 0.05, 0, shade(C.woodLight, -0.05), { jitter: 0.02 });
  for (let i = 0; i < 3; i++) k.d.box(w - 2 * t - 0.02, 0.1, 0.09, 0, WALL_TOP - 0.12, -d / 2 + t + (i + 0.5) * (d - 2 * t) / 3, C.woodDark, { jitter: 0 });
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.s.box(0.1, wallH, 0.1, x * (w / 2 - 0.02), wy, z * (d / 2 - 0.02), shade(spec.wall, -0.1), { jitter: 0 });
  // roof
  const rise = 0.95;
  gableRoof(k, w, d, WALL_TOP, rise, spec.roof, spec.wall, 0.26, true);
  k.s.box(w + 0.1, 0.07, d + 0.1, 0, WALL_TOP - 0.01, 0, trim, { jitter: 0 });
  k.s.box(0.26, 1.0, 0.26, -sx * 0.4, WALL_TOP + 0.65, -0.35, C.brick, { jitter: 0.03 });
  k.s.box(0.34, 0.07, 0.34, -sx * 0.4, WALL_TOP + 1.18, -0.35, shade(C.brick, -0.15), { jitter: 0 });
  // front: two windows, door with a stoop
  const front = k.at(0, 0, d / 2);
  for (const x of [-sx * 0.55]) windowOn(front, x, FLOOR + 1.0, { w: 0.46, h: 0.62, trim, glow: GLOW.neighbors, shutter: spec.shutter });
  doorOn(front.at(0, FLOOR, 0), sx * 0.45, { color: C.woodDark, trim, step: false });
  for (let i = 0; i < 3; i++) {
    const h = 0.27 * (3 - i);
    front.s.box(0.9, h, 0.3, sx * 0.45, h / 2 - 0.0, 0.26 + i * 0.3, C.stoneDark, { jitter: 0.04 });
    k.c.box(0.9, h, 0.3, sx * 0.45, h / 2, d / 2 + 0.26 + i * 0.3);
  }
  // alley face with the window opening
  const face = k.at(sx * w / 2, 0, 0, sx * Math.PI / 2);
  const oy = (SILL + LINTEL) / 2;
  const ow = 1.0, oh = LINTEL - SILL;
  face.s.box(ow + 0.2, 0.07, 0.07, 0, LINTEL + 0.035, 0.03, trim, { jitter: 0 });
  face.s.box(0.07, oh, 0.07, -ow / 2 - 0.035, oy, 0.03, trim, { jitter: 0 });
  face.s.box(0.07, oh, 0.07, ow / 2 + 0.035, oy, 0.03, trim, { jitter: 0 });
  face.s.box(ow + 0.3, 0.07, 0.22, 0, SILL - 0.01, 0.1, shade(trim, -0.08), { jitter: 0 });
  face.s.box(ow + 0.25, 0.16, 0.12, 0, SILL - 0.13, 0.08, C.woodDark, { jitter: 0 });
  face.s.box(ow + 0.12, 0.06, 0.18, 0, FLOOR + 0.02, 0.09, C.stone, { jitter: 0 });
  const leaves = { flaps: spec.flaps, tag: 'o2', color: spec.shutter, rest: 0.55, open: 2.9 };
  spec.flaps.add(face, -ow / 2 - 0.07, oy, ow / 2 + 0.07, oh + 0.04, leaves.color, 1, 'o2', leaves.open, leaves.rest);
  spec.flaps.add(face, ow / 2 + 0.07, oy, ow / 2 + 0.07, oh + 0.04, leaves.color, -1, 'o2', leaves.open, leaves.rest);
  // socket fixture: tin-can phone below the sill, beside the opening
  const socketKit = face.at(0.85, 0, 0.0);
  socketWall(b, spec.socket, socketKit, 0.72, { can: true });
  socketKit.c.box(0.4, 0.5, 0.4, 0, 0.72, 0.16);

  // colliders: base, walls, roof; the window opening stays clear for line of sight
  k.c.block(-w / 2 - 0.04, -0.6, -d / 2 - 0.04, w / 2 + 0.04, SILL, d / 2 + 0.04);
  k.c.block(-w / 2 - 0.04, SILL, -d / 2, w / 2 + 0.04, WALL_TOP + 0.05, -d / 2 + t);
  k.c.block(-w / 2 - 0.04, SILL, d / 2 - t, w / 2 + 0.04, WALL_TOP + 0.05, d / 2 + 0.04);
  k.c.block(-sx * (w / 2 + 0.04), SILL, -d / 2, -sx * (w / 2 - t - 0.02), WALL_TOP + 0.05, d / 2);
  k.c.block(sx * (w / 2 - t - 0.02), LINTEL, -d / 2, sx * (w / 2 + 0.04), WALL_TOP + 0.05, d / 2);
  for (const sz of [-1, 1]) k.c.block(sx * (w / 2 - t - 0.02), SILL, sz === -1 ? -d / 2 : 0.5, sx * (w / 2 + 0.04), LINTEL, sz === -1 ? -0.5 : d / 2);
  k.c.gable(w + 0.5, rise, d + 0.5, 0, WALL_TOP, 0);

  // lamp inside lights with the connection
  const lamp = level(ctx, v => ctx.mats.setGlow(GLOW.neighbors, [1.1, 0.85, 0.45], v), 0.7);
  ctx.b.onActivate('o2', instant => lamp.set(1, instant));
  ctx.b.onFinale(a => { if (a > 0.5) lamp.set(1); });

  // resident stands inside facing the window
  // close to the sill, so the window frame does not cut them off in the phone-call shots
  const inX = sx * (w / 2 - t - 0.36);
  const npc = k.anchor(inX, FLOOR + 0.03, 0.05, sx, 0);

  // flower pots that appear on the sill at o2
  const frame = k.frame;
  void frame;
  const root = frameRoot(ctx, k.frame);
  const potsPart = new Part(ctx, root, k.frame, new Vector3(0, 0, 0), spec.id === 'otto' ? 71 : 72);
  const pk = potsPart.kit;
  // pots in the house frame, on the sill (alley side)
  const sillX = sx * (w / 2 + 0.1);
  const pots = pk.at(sillX, SILL, 0, sx * Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const px = -0.32 + i * 0.32;
    pots.s.cyl(0.07, 0.11, px, 0, 0.02, [C.brick, C.roofTeal, C.roofMustard][i], { seg: 6, rTop: 0.085, jitter: 0 });
    pots.f.ball(0.09, px, 0.17, 0.02, i === 1 ? C.tulip : C.leafMid, { sway: 0.5, swayHeight: 0.3, detail: 1, scale: [1, 0.85, 1] });
    pots.f.ball(0.045, px + 0.03, 0.27, 0.03, [C.yellow, C.white, C.violet][i], { sway: 0.6, swayHeight: 0.3, detail: 0 });
  }
  potsPart.mount();
  potsPart.group.scale.setScalar(0.001);
  potsPart.group.visible = false;
  const grow = level(ctx, v => { potsPart.group.scale.setScalar(Math.max(0.001, v)); potsPart.group.visible = v > 0.01; }, 0.9);
  ctx.b.onActivate('o2', instant => grow.set(1, instant));

  return { npc, face };
}

export function interiorProps(k: Kit, who: 'otto' | 'ike', w: number, d: number, alley: -1 | 1): void {
  const sx = alley;
  const y0 = FLOOR + 0.03;
  const back = -d / 2 + T + 0.02;
  const far = -sx * (w / 2 - T - 0.02);
  // rug
  k.d.box(0.9, 0.012, 0.7, sx * 0.15, y0 + 0.006, 0.1, who === 'otto' ? C.red : C.navy, { jitter: 0 });
  k.d.box(0.7, 0.014, 0.5, sx * 0.15, y0 + 0.008, 0.1, who === 'otto' ? C.wallPink : C.wallBlue, { jitter: 0 });
  // framed picture and a small shelf at the back
  k.d.box(0.4, 0.3, 0.025, -sx * 0.2, FLOOR + 1.5, back + 0.015, C.woodDark, { jitter: 0 });
  k.d.box(0.32, 0.22, 0.02, -sx * 0.2, FLOOR + 1.5, back + 0.03, who === 'otto' ? C.sky : C.butter, { jitter: 0 });
  k.d.box(0.8, 0.04, 0.2, sx * 0.1, FLOOR + 1.25, back + 0.1, C.wood, { jitter: 0 });
  for (let i = 0; i < 5; i++) k.d.box(0.07, 0.17 + (i % 3) * 0.03, 0.14, sx * 0.1 - 0.3 + i * 0.1, FLOOR + 1.35 + (i % 3) * 0.015, back + 0.1, [C.red, C.navy, C.leafMid, C.roofMustard, C.violet][i], { jitter: 0.03 });
  // hanging lamp (glows with o2)
  k.s.rod(0.0, WALL_TOP - 0.1, 0.05, 0.0, WALL_TOP - 0.45, 0.05, 0.008, C.iron, { seg: 3 });
  k.d.ball(0.12, 0.0, WALL_TOP - 0.55, 0.05, C.glassWarm, { glow: GLOW.neighbors, scale: [1, 1.15, 1], jitter: 0 });
  if (who === 'otto') {
    // bed along the far wall, chess table by the window
    k.d.box(0.8, 0.22, 1.35, far * 0.8 + sx * 0.0, y0 + 0.11, -0.05, C.woodLight, { jitter: 0.02 });
    k.d.box(0.76, 0.12, 1.3, far * 0.8, y0 + 0.26, -0.05, C.cloth, { jitter: 0 });
    k.d.box(0.78, 0.07, 0.8, far * 0.8, y0 + 0.33, 0.15, C.red, { jitter: 0.02 });
    k.d.box(0.4, 0.1, 0.22, far * 0.8, y0 + 0.37, -0.52, C.white, { jitter: 0 });
    k.d.box(0.08, 0.5, 0.08, far * 0.8, y0 + 0.5, 0.65, C.woodDark, { jitter: 0 });
    // chess table
    const tx = sx * (w / 2 - T - 0.25);
    k.d.box(0.42, 0.04, 0.42, tx, y0 + 0.5, 0.45, C.woodLight, { jitter: 0 });
    k.d.cyl(0.04, 0.5, tx, y0, 0.45, C.woodDark, { seg: 5, jitter: 0 });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) k.d.box(0.09, 0.012, 0.09, tx - 0.14 + i * 0.094, y0 + 0.526, 0.45 - 0.14 + j * 0.094, C.coal, { jitter: 0 });
    k.d.ball(0.025, tx + 0.02, y0 + 0.55, 0.43, C.white, { detail: 0, jitter: 0 });
    k.d.ball(0.025, tx - 0.05, y0 + 0.55, 0.5, C.coal, { detail: 0, jitter: 0 });
  } else {
    // armchair, knitting basket, record player
    k.d.box(0.55, 0.28, 0.5, far * 0.75, y0 + 0.14, -0.35, C.roofTerracotta, { jitter: 0.02 });
    k.d.box(0.55, 0.5, 0.12, far * 0.75, y0 + 0.4, -0.55, shade(C.roofTerracotta, -0.1), { jitter: 0 });
    for (const s of [-1, 1]) k.d.box(0.1, 0.22, 0.46, far * 0.75 + s * 0.3, y0 + 0.28, -0.35, shade(C.roofTerracotta, 0.06), { jitter: 0 });
    k.d.box(0.5, 0.06, 0.4, far * 0.75, y0 + 0.31, -0.3, C.wallBlue, { jitter: 0 });
    k.d.cyl(0.14, 0.18, sx * 0.35, y0, 0.55, C.woodLight, { seg: 8, rTop: 0.16, jitter: 0 });
    for (let i = 0; i < 3; i++) k.d.ball(0.07, sx * 0.35 + (i - 1) * 0.1, y0 + 0.24, 0.55, [C.tulip, C.yellow, C.mint][i], { detail: 1, jitter: 0 });
    // record player and horn
    k.d.box(0.4, 0.3, 0.3, far * 0.8, y0 + 0.15, 0.5, C.woodDark, { jitter: 0 });
    k.d.cyl(0.13, 0.015, far * 0.8, y0 + 0.31, 0.5, C.coal, { seg: 10, jitter: 0 });
    k.d.cone(0.15, 0.3, far * 0.8 + 0.05, y0 + 0.5, 0.5, C.brass, { seg: 8, rot: [0, 0, 0.5], jitter: 0 });
  }
}

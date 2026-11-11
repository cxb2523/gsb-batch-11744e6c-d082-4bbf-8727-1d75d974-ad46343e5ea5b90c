import { Vector3 } from 'three';
import type { ColorLike } from './kit';
import { shade } from './kit';
import { Kit } from './context';
import { C, FLOWERS } from './palette';
import { GLOW } from './materials';
import { addHalo } from './halos';

/** Small believable things: crates, barrels, benches, posts, poles, fences,
 * pots, laundry, nets, buoys, stools. Each takes a kit standing on the
 * ground at its own origin (y up, +Z front). */

export function crate(k: Kit, s = 0.5, color: ColorLike = C.plank, collide = true): void {
  k.s.box(s, s, s, 0, s / 2, 0, color, { jitter: 0.04 });
  const dark = shade(color, -0.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.s.box(s * 0.1, s * 1.01, s * 0.1, sx * s * 0.45, s / 2, sz * s * 0.45, dark, { jitter: 0 });
  k.s.box(s * 1.02, s * 0.09, s * 1.02, 0, s * 0.96, 0, dark, { jitter: 0 });
  k.s.box(s * 1.02, s * 0.09, s * 1.02, 0, s * 0.04, 0, dark, { jitter: 0 });
  k.s.box(s * 0.7, s * 0.08, s * 1.02, 0, s * 0.5, 0, shade(color, 0.1), { rot: [0, 0, 0.6], jitter: 0 });
  if (collide) k.c.box(s, s, s, 0, s / 2, 0);
}

export function barrel(k: Kit, h = 0.6, r = 0.26, color: ColorLike = C.woodLight, collide = true): void {
  k.s.cyl(r * 0.9, h * 0.5, 0, 0, 0, color, { seg: 8, rTop: r });
  k.s.cyl(r, h * 0.5, 0, h * 0.5, 0, color, { seg: 8, rTop: r * 0.9 });
  for (const y of [0.14, 0.5, 0.86]) k.s.cyl(r * (1.03 - Math.abs(y - 0.5) * 0.18), 0.045, 0, h * y - 0.02, 0, C.iron, { seg: 8, jitter: 0 });
  k.s.cyl(r * 0.88, 0.02, 0, h, 0, shade(color, 0.12), { seg: 8, jitter: 0 });
  if (collide) k.c.cyl(r, h, 0, 0, 0, undefined, { seg: 8 });
}

export function bench(k: Kit, len = 1.1, color: ColorLike = C.wood): void {
  k.s.box(len, 0.06, 0.3, 0, 0.42, 0, color, { jitter: 0.03 });
  k.s.box(len, 0.28, 0.05, 0, 0.62, -0.14, color, { rot: [-0.12, 0, 0], jitter: 0.03 });
  for (const sx of [-1, 1]) {
    k.s.box(0.06, 0.4, 0.28, sx * (len / 2 - 0.1), 0.2, 0, C.woodDark, { jitter: 0 });
  }
  k.c.box(len, 0.45, 0.32, 0, 0.225, 0);
}

export function stool(k: Kit, color: ColorLike = C.woodLight, h = 0.32): void {
  k.s.cyl(0.14, 0.05, 0, h - 0.05, 0, color, { seg: 8, jitter: 0.03 });
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    k.s.rod(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, Math.cos(a) * 0.05, h - 0.05, Math.sin(a) * 0.05, 0.018, C.woodDark, { seg: 4 });
  }
}

export function table(k: Kit, w = 0.8, d = 0.5, h = 0.5, color: ColorLike = C.woodLight): void {
  k.s.box(w, 0.05, d, 0, h, 0, color, { jitter: 0.03 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.s.box(0.05, h, 0.05, sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06), C.woodDark, { jitter: 0 });
}

/** Round bucket / planter with greenery. */
export function planter(k: Kit, flowers = true, r = 0.18, h = 0.2, color: ColorLike = C.brick): void {
  k.s.cyl(r, h, 0, 0, 0, color, { seg: 7, rTop: r * 1.18, jitter: 0.03 });
  k.s.cyl(r * 1.22, 0.03, 0, h - 0.01, 0, shade(color, -0.12), { seg: 7, jitter: 0 });
  k.f.ball(r * 1.0, 0, h + 0.07, 0, C.leafMid, { sway: 0.5, swayHeight: 0.5, detail: 1, scale: [1, 0.8, 1] });
  if (flowers) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      k.f.ball(0.05, Math.cos(a) * r * 0.55, h + 0.19 + (i % 2) * 0.02, Math.sin(a) * r * 0.55, FLOWERS[i % FLOWERS.length], { sway: 0.7, swayHeight: 0.5, detail: 0 });
    }
  }
}

export function lampPost(k: Kit, h = 2.2, glow: number = GLOW.finale, color: ColorLike = C.iron, bulb: ColorLike = C.glassWarm, collide = true): void {
  k.s.cyl(0.11, 0.18, 0, 0, 0, C.stoneDark, { seg: 6, rTop: 0.09, jitter: 0 });
  k.s.cyl(0.04, h, 0, 0.18, 0, color, { seg: 6, rTop: 0.032, jitter: 0 });
  k.s.cyl(0.07, 0.05, 0, 0.5, 0, color, { seg: 6, rTop: 0.05, jitter: 0 });
  k.s.box(0.3, 0.025, 0.025, 0.12, h + 0.02, 0, color, { jitter: 0 });
  // lantern cage
  k.s.cyl(0.14, 0.04, 0.0, h + 0.04, 0, color, { seg: 6, jitter: 0 });
  k.d.cyl(0.095, 0.22, 0, h + 0.07, 0, bulb, { seg: 6, rTop: 0.115, glow, jitter: 0 });
  k.s.cone(0.17, 0.14, 0, h + 0.29, 0, color, { seg: 6, jitter: 0 });
  k.s.ball(0.03, 0, h + 0.45, 0, C.brass, { detail: 0, jitter: 0 });
  addHalo(k.p(0, h + 0.18, 0), 0.75, glow);
  if (collide) k.c.cyl(0.1, h + 0.3, 0, 0, 0, undefined, { seg: 6 });
}

/** Wooden electric pole with crossarm and insulators; returns local wire attach points. */
export function pole(k: Kit, h = 2.9, lean = 0): { tops: Vector3[] } {
  k.s.cyl(0.07, h, 0, -0.1, 0, C.woodDark, { seg: 6, rTop: 0.05, jitter: 0.03, rot: [lean, 0, 0] });
  const arm = h - 0.18;
  k.s.box(0.9, 0.07, 0.07, 0, arm, 0, C.wood, { jitter: 0 });
  k.s.rod(-0.18, arm - 0.3, 0, -0.34, arm - 0.04, 0, 0.018, C.wood, { seg: 4 });
  k.s.rod(0.18, arm - 0.3, 0, 0.34, arm - 0.04, 0, 0.018, C.wood, { seg: 4 });
  const tops: Vector3[] = [];
  for (const x of [-0.36, 0, 0.36]) {
    k.s.cyl(0.03, 0.09, x, arm + 0.03, 0, C.ironLight, { seg: 5, rTop: 0.02, jitter: 0 });
    tops.push(new Vector3(x, arm + 0.14, 0));
  }
  k.c.cyl(0.08, h, 0, 0, 0, undefined, { seg: 6 });
  return { tops };
}

export function sign_post(k: Kit, arrows = 2): void {
  k.s.cyl(0.05, 1.2, 0, 0, 0, C.woodDark, { seg: 6, jitter: 0 });
  for (let i = 0; i < arrows; i++) {
    k.s.box(0.52, 0.16, 0.035, 0.18, 0.95 - i * 0.22, 0.05, C.woodLight, { rot: [0, (i - 0.5) * 0.35, 0], jitter: 0.03 });
    k.s.box(0.1, 0.16, 0.036, 0.46, 0.95 - i * 0.22, 0.05, C.woodLight, { rot: [0, (i - 0.5) * 0.35, 0.78], jitter: 0 });
  }
}

export function mailbox(k: Kit, color: ColorLike = C.red): void {
  k.s.cyl(0.03, 0.8, 0, 0, 0, C.woodDark, { seg: 5, jitter: 0 });
  k.s.box(0.26, 0.2, 0.4, 0, 0.92, 0, color, { jitter: 0 });
  k.s.box(0.27, 0.05, 0.41, 0, 1.03, 0, shade(color, -0.2), { jitter: 0 });
  k.s.box(0.03, 0.14, 0.03, 0.15, 1.0, 0.05, C.yellow, { jitter: 0 });
}

export function buoy(k: Kit, color: ColorLike = C.red, r = 0.14): void {
  k.s.ball(r, 0, r, 0, color, { scale: [1, 1.1, 1], jitter: 0 });
  k.s.cyl(r * 1.02, 0.06, 0, r * 0.95, 0, C.white, { seg: 8, jitter: 0 });
  k.s.cyl(0.02, 0.12, 0, r * 2.0, 0, C.iron, { seg: 4, jitter: 0 });
  k.s.ball(0.03, 0, r * 2.15, 0, C.iron, { detail: 0, jitter: 0 });
}

export function ropeCoil(k: Kit, r = 0.16): void {
  for (let layer = 0; layer < 2; layer++) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      k.s.rod(Math.cos(a0) * r, 0.025 + layer * 0.04, Math.sin(a0) * r, Math.cos(a1) * r, 0.025 + layer * 0.04, Math.sin(a1) * r, 0.026, C.rope, { seg: 4, jitter: 0.04 });
    }
  }
}

/** Fishing net draped over a frame: crossing cords plus floats. */
export function net(k: Kit, w = 0.9, h = 0.7, color: ColorLike = C.rope): void {
  const nx = 7, ny = 6;
  const point = (i: number, j: number) => {
    const x = (i / nx - 0.5) * w, y = (1 - j / ny) * h;
    const sag = Math.sin(i / nx * Math.PI) * 0.06;
    return [x, y + 0.04, sag + j / ny * 0.12] as const;
  };
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) {
    const a = point(i, j), b = point(i, j + 1);
    k.s.rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.008, color, { seg: 3, jitter: 0 });
  }
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
    const a = point(i, j), b = point(i + 1, j);
    k.s.rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.008, color, { seg: 3, jitter: 0 });
  }
  for (let i = 0; i <= nx; i += 2) {
    const p = point(i, 0);
    k.s.ball(0.04, p[0], p[1], p[2], i % 4 === 0 ? C.red : C.white, { detail: 0, jitter: 0 });
  }
}

/** Two posts and a line with cloth hanging from it. */
export function laundry(k: Kit, span = 1.6, h = 1.7): void {
  for (const s of [-1, 1]) {
    k.s.cyl(0.035, h, s * span / 2, 0, 0, C.woodDark, { seg: 5, jitter: 0 });
    k.c.cyl(0.05, h, s * span / 2, 0, 0, undefined, { seg: 5 });
  }
  k.s.cable(-span / 2, h - 0.04, 0, span / 2, h - 0.04, 0, 0.1, 0.008, C.iron, 6);
  const colors = [C.wallPink, C.wallBlue, C.butter, C.white, C.mint];
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.7) / 5.6;
    const x = -span / 2 + t * span;
    const sag = 0.1 * 4 * t * (1 - t);
    const hang = i % 2 ? 0.5 : 0.36;
    k.s.box(0.24, hang, 0.012, x, h - 0.06 - sag - hang / 2, 0, colors[i % colors.length], { rot: [0, 0, (i - 2) * 0.02], jitter: 0.02 });
  }
}

/** A short run of picket fence along local +X from 0 to len. */
export function fence(k: Kit, len: number, color: ColorLike = C.white, h = 0.55, solid = false): void {
  const n = Math.max(2, Math.round(len / 0.2));
  for (let i = 0; i <= n; i++) {
    const x = i / n * len;
    k.s.box(0.06, h, 0.035, x, h / 2, 0, color, { jitter: 0.02 });
    k.s.cone(0.045, 0.07, x, h, 0, color, { seg: 4, rot: [0, 0.785, 0], jitter: 0 });
  }
  k.s.box(len, 0.045, 0.04, len / 2, h * 0.32, -0.03, shade(color, -0.1), { jitter: 0 });
  k.s.box(len, 0.045, 0.04, len / 2, h * 0.72, -0.03, shade(color, -0.1), { jitter: 0 });
  if (solid) k.c.box(len, h, 0.1, len / 2, h / 2, 0);
}

/** Low stone wall segment along +X. */
export function stoneWall(k: Kit, len: number, h = 0.5, t = 0.26, color: ColorLike = C.stone): void {
  const n = Math.max(1, Math.round(len / 0.5));
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * len;
    k.s.box(len / n * 0.96, h * (0.92 + (i % 3) * 0.04), t, x, h / 2, 0, shade(color, ((i * 37) % 7 - 3) * 0.012), { jitter: 0.025 });
  }
  k.s.box(len, 0.06, t + 0.06, len / 2, h + 0.02, 0, shade(color, 0.08), { jitter: 0 });
  k.c.box(len, h + 0.05, t, len / 2, h / 2, 0);
}

export function haybale(k: Kit): void {
  k.s.cyl(0.26, 0.4, 0, 0, 0, C.butter, { seg: 8, rot: [0, 0, 0], jitter: 0.03 });
  k.s.cyl(0.265, 0.025, 0, 0.1, 0, C.autumn, { seg: 8, jitter: 0 });
  k.s.cyl(0.265, 0.025, 0, 0.28, 0, C.autumn, { seg: 8, jitter: 0 });
  k.c.cyl(0.26, 0.4, 0, 0, 0, undefined, { seg: 8 });
}

export function sack(k: Kit, color: ColorLike = C.cloth): void {
  k.s.ball(0.16, 0, 0.15, 0, color, { scale: [1, 1.0, 0.85], detail: 1 });
  k.s.cone(0.07, 0.1, 0, 0.27, 0, color, { seg: 5 });
}

export function milkCan(k: Kit): void {
  k.s.cyl(0.11, 0.3, 0, 0, 0, C.ironLight, { seg: 8, rTop: 0.09, jitter: 0 });
  k.s.cyl(0.07, 0.06, 0, 0.3, 0, C.ironLight, { seg: 8, jitter: 0 });
  k.s.cyl(0.095, 0.03, 0, 0.35, 0, C.iron, { seg: 8, jitter: 0 });
}

export function bucket(k: Kit, color: ColorLike = C.ironLight): void {
  k.s.cyl(0.09, 0.2, 0, 0, 0, color, { seg: 7, rTop: 0.12, jitter: 0 });
  k.s.rod(-0.11, 0.2, 0, 0.11, 0.2, 0, 0.008, C.iron, { seg: 3 });
}

/** Flat stepping stones along a ground path given as world points. */
export function steppingStones(k: Kit, points: Vector3[], color: ColorLike = C.stone): void {
  points.forEach((p, i) => {
    const up = p.clone().normalize();
    // build in world space with a basis aligned to the surface
    const r = 0.12 + (i % 3) * 0.03;
    k.s.cyl(r, 0.05, p.x, p.y, p.z, color, { seg: 6, jitter: 0.05, rot: tilt(up) });
  });
}
function tilt(up: Vector3): [number, number, number] {
  // rotate a +Y cylinder so that its axis follows `up`
  const x = Math.atan2(up.z, up.y), z = -Math.atan2(up.x, Math.hypot(up.y, up.z));
  return [x, 0, z];
}

import type { ColorLike } from './kit';
import { mix, shade } from './kit';
import { Kit } from './context';
import { C, FLOWERS } from './palette';

/** Trees, bushes, flowers, grass and rocks. Trunks and stones are rigid
 * (solid collector); leaves go to the sway collector with height-weighted
 * wind. Every function draws at the origin of the given kit. */

type Rand = () => number;
const range = (r: Rand, a: number, b: number) => a + (b - a) * r();

export interface TreeOptions {
  scale?: number;
  leaf?: ColorLike;
  leafAlt?: ColorLike;
  trunk?: ColorLike;
  lean?: number;
  collide?: boolean;
}

export function roundTree(k: Kit, r: Rand, o: TreeOptions = {}): number {
  const s = (o.scale ?? 1) * range(r, 0.85, 1.2);
  const trunkH = 1.05 * s;
  const leaf = o.leaf ?? C.leafMid, alt = o.leafAlt ?? C.leafLight;
  const lean = o.lean ?? range(r, -0.06, 0.06);
  k.s.cyl(0.15 * s, trunkH + 0.1, 0, -0.05, 0, o.trunk ?? C.trunk, { seg: 6, rTop: 0.07 * s, rot: [lean, 0, -lean * 0.7], jitter: 0.03 });
  const cy = trunkH + 0.5 * s;
  const sway = { sway: 1, swayHeight: cy + 0.9 * s };
  k.f.ball(0.78 * s, 0, cy, 0, leaf, { ...sway, detail: 1, scale: [1, 0.92, 1] });
  const n = 2;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + r() * 2;
    const d = 0.55 * s;
    k.f.ball(range(r, 0.36, 0.46) * s, Math.cos(a) * d, cy + range(r, -0.1, 0.25) * s, Math.sin(a) * d, i % 2 ? alt : mix(leaf, alt, 0.5), { ...sway, detail: 0 });
  }
  k.f.ball(0.42 * s, range(r, -0.1, 0.1) * s, cy + 0.62 * s, range(r, -0.1, 0.1) * s, alt, { ...sway, detail: 0 });
  if (o.collide !== false) k.c.cyl(0.18 * s, 1.4 * s, 0, 0, 0, undefined, { seg: 6 });
  return trunkH + 1.4 * s;
}

export function pineTree(k: Kit, r: Rand, o: TreeOptions = {}): number {
  const s = (o.scale ?? 1) * range(r, 0.85, 1.25);
  k.s.cyl(0.16 * s, 0.55 * s, 0, -0.05, 0, o.trunk ?? C.woodDark, { seg: 5, rTop: 0.1 * s, jitter: 0.03 });
  const leaf = o.leaf ?? C.pine, alt = o.leafAlt ?? C.pineLight;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const rad = (0.78 - t * 0.38) * s, h = (0.9 - t * 0.14) * s;
    k.f.cone(rad, h, 0, (0.45 + t * 0.78) * s, 0, i % 2 ? alt : leaf, { seg: 7, sway: 1, swayHeight: 3 * s });
  }
  k.f.cone(0.2 * s, 0.4 * s, 0, 2.55 * s, 0, alt, { seg: 5, sway: 1, swayHeight: 3 * s });
  if (o.collide !== false) k.c.cyl(0.16 * s, 1.2 * s, 0, 0, 0, undefined, { seg: 5 });
  return 2.9 * s;
}

export function poplar(k: Kit, r: Rand, o: TreeOptions = {}): number {
  const s = (o.scale ?? 1) * range(r, 0.9, 1.2);
  k.s.cyl(0.12 * s, 0.7 * s, 0, -0.05, 0, C.trunkLight, { seg: 6, rTop: 0.08 * s, jitter: 0.03 });
  const leaf = o.leaf ?? C.leafDark;
  k.f.ball(0.5 * s, 0, 1.1 * s, 0, leaf, { sway: 1, swayHeight: 3 * s, detail: 1, scale: [1, 1.5, 1] });
  k.f.ball(0.34 * s, 0, 2.05 * s, 0, o.leafAlt ?? C.leafMid, { sway: 1, swayHeight: 3 * s, detail: 0, scale: [1, 1.5, 1] });
  if (o.collide !== false) k.c.cyl(0.12 * s, 1.0 * s, 0, 0, 0, undefined, { seg: 6 });
  return 2.8 * s;
}

/** The big pink blossom tree of the old street. */
export function blossomTree(k: Kit, r: Rand, scale = 1.4): void {
  const s = scale;
  k.s.cyl(0.3 * s, 0.35 * s, 0, -0.1, 0, C.trunk, { seg: 7, rTop: 0.2 * s, jitter: 0.03 });
  k.s.cyl(0.19 * s, 1.1 * s, 0, 0.2 * s, 0, C.trunk, { seg: 7, rTop: 0.11 * s, rot: [0.1, 0, -0.18], jitter: 0.03 });
  k.s.rod(0.05, 1.0 * s, 0, 0.7 * s, 1.55 * s, 0.1 * s, 0.07 * s, C.trunk, { seg: 5 });
  k.s.rod(-0.02, 1.1 * s, 0, -0.62 * s, 1.6 * s, -0.2 * s, 0.06 * s, C.trunk, { seg: 5 });
  const cy = 1.75 * s;
  const sway = { sway: 1, swayHeight: cy + 1.1 * s };
  const pinks = [C.blossom, shade(C.blossom, 0.12), mix(C.blossom, C.wallPink, 0.5), shade(C.blossom, -0.08)];
  k.f.ball(0.95 * s, 0, cy, 0, pinks[0], { ...sway, detail: 1, scale: [1.1, 0.9, 1.1] });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + 0.4;
    k.f.ball(range(r, 0.42, 0.55) * s, Math.cos(a) * 0.82 * s, cy + range(r, -0.2, 0.35) * s, Math.sin(a) * 0.82 * s, pinks[i % pinks.length], { ...sway, detail: 1 });
  }
  k.f.ball(0.52 * s, 0.1 * s, cy + 0.85 * s, 0, pinks[1], { ...sway, detail: 1 });
  // petals on the ground
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = range(r, 0.3, 1.9) * s;
    k.s.box(0.07, 0.012, 0.05, Math.cos(a) * d, 0.02, Math.sin(a) * d, pinks[i % 3], { rot: [0, r() * 3, 0], jitter: 0.03 });
  }
  k.c.cyl(0.26 * s, 1.5, 0, 0, 0, undefined, { seg: 7 });
}

export function palm(k: Kit, r: Rand, scale = 1): void {
  const s = scale * range(r, 0.9, 1.15);
  const dirA = r() * Math.PI * 2;
  const bend = 0.09;
  let x = 0, y = 0, z = 0;
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const nx = x + Math.cos(dirA) * bend * s, nz = z + Math.sin(dirA) * bend * s, ny = y + 0.36 * s;
    k.s.rod(x, y, z, nx, ny, nz, (0.085 - i * 0.008) * s, i % 2 ? C.trunkLight : C.trunk, { seg: 6 });
    x = nx; y = ny; z = nz;
  }
  const kk = k.at(x, y, z);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + r() * 0.3;
    const dx = Math.sin(a), dz = Math.cos(a);
    const f = range(r, 0.85, 1.1) * s;
    const mid = [dx * 0.45 * f, 0.18 * f, dz * 0.45 * f], end = [dx * 0.95 * f, -0.12 * f, dz * 0.95 * f];
    kk.f.rod(0, 0.02, 0, mid[0], mid[1], mid[2], 0.025 * s, C.leafDark, { seg: 3, sway: 1, swayHeight: 1 });
    kk.f.rod(mid[0], mid[1], mid[2], end[0], end[1], end[2], 0.02 * s, C.leafDark, { seg: 3, sway: 1, swayHeight: 1 });
    kk.f.box(0.2 * s, 0.015, 0.52 * f, mid[0] * 1.05, mid[1] - 0.02, mid[2] * 1.05, C.leafMid, { rot: [0.15, a, 0], sway: 1, swayHeight: 1 });
    kk.f.box(0.18 * s, 0.015, 0.5 * f, (mid[0] + end[0]) * 0.52, (mid[1] + end[1]) * 0.5 - 0.02, (mid[2] + end[2]) * 0.52, C.leafLight, { rot: [0.55, a, 0], sway: 1, swayHeight: 1 });
  }
  kk.s.ball(0.08 * s, 0.02, 0, 0.02, C.woodDark, { detail: 0 });
  kk.s.ball(0.06 * s, 0.08, -0.06, 0.0, C.woodDark, { detail: 0 });
  k.c.cyl(0.1 * s, 1.5 * s, 0, 0, 0, undefined, { seg: 6 });
}

export function bush(k: Kit, r: Rand, o: { scale?: number; color?: ColorLike; berries?: ColorLike | null } = {}): void {
  const s = (o.scale ?? 1) * range(r, 0.8, 1.2);
  const base = o.color ?? C.leafMid;
  k.f.ball(0.3 * s, 0, 0.2 * s, 0, base, { sway: 1, swayHeight: 0.6 * s, detail: 1, scale: [1.2, 0.85, 1.1] });
  k.f.ball(0.22 * s, 0.26 * s, 0.14 * s, 0.08 * s, mix(base, C.leafLight, 0.5), { sway: 1, swayHeight: 0.6 * s, detail: 0 });
  if (o.berries) {
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      k.f.octa(0.035, Math.cos(a) * 0.3 * s, 0.22 * s + r() * 0.2 * s, Math.sin(a) * 0.3 * s, o.berries, { sway: 1, swayHeight: 0.6 * s });
    }
  }
}

export function grassTuft(k: Kit, r: Rand, color: ColorLike = C.leafLight): void {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI + r() * 0.5;
    const h = range(r, 0.14, 0.26);
    k.g.blade(range(r, 0.05, 0.08), h, Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03, i % 2 ? color : mix(color, C.leafDark, 0.3),
      { rot: [(r() - 0.5) * 0.3, a, (r() - 0.5) * 0.3], sway: 1, swayHeight: h, jitter: 0.06 });
  }
}

export function flowerPatch(k: Kit, r: Rand, count: number, spread: number, colors: ColorLike[] = FLOWERS): void {
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = range(r, 0.13, 0.22);
    k.g.blade(0.035, h, x, 0, z, C.leafMid, { rot: [0, r() * 6, 0], sway: 1, swayHeight: h + 0.05, jitter: 0.05 });
    k.g.blade(0.07, 0.07, x, 0.02, z, C.leafLight, { rot: [0, r() * 6, 0.6], sway: 1, swayHeight: h, jitter: 0.04 });
    k.g.octa(range(r, 0.035, 0.05), x, h + 0.02, z, colors[Math.floor(r() * colors.length) % colors.length], { sway: 1, swayHeight: h + 0.05, jitter: 0.04 });
  }
}

export function reeds(k: Kit, r: Rand, count = 6): void {
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.25;
    const h = range(r, 0.45, 0.8);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    k.g.blade(0.05, h, x, 0, z, C.moss, { rot: [(r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3], sway: 1, swayHeight: h, jitter: 0.05 });
    if (i % 3 === 0) k.g.cyl(0.022, 0.13, x, h - 0.02, z, C.woodDark, { seg: 4, sway: 1, swayHeight: h + 0.1 });
  }
}

export function rock(k: Kit, r: Rand, size = 0.4, color: ColorLike = C.rock, collide = size > 0.38): void {
  const c = mix(color, shade(color, -0.12), r());
  k.s.ball(size, 0, size * 0.55, 0, c, { detail: 0, scale: [range(r, 0.9, 1.3), range(r, 0.6, 0.85), range(r, 0.9, 1.25)], rot: [r() * 3, r() * 6, r() * 3] });
  if (size > 0.3) k.s.ball(size * 0.55, size * 0.7, size * 0.3, size * 0.4, shade(c, 0.06), { detail: 0, scale: [1, 0.8, 1], rot: [r() * 3, r() * 6, 0] });
  if (size > 0.45) k.s.ball(size * 0.7, 0, size * 0.78, 0, mix(c, C.moss, 0.35), { detail: 0, scale: [0.8, 0.35, 0.8] });
  if (collide) k.c.cyl(size * 0.9, size * 1.0, 0, -0.05, 0, undefined, { seg: 7 });
}

export function rockCluster(k: Kit, r: Rand, count: number, spread: number, size = 0.35, color: ColorLike = C.rock): void {
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    const kk = k.at(Math.cos(a) * d, 0, Math.sin(a) * d);
    rock(kk, r, size * range(r, 0.55, 1.1), color, false);
  }
}

export function stump(k: Kit, r: Rand): void {
  k.s.cyl(0.17, 0.22, 0, 0, 0, C.trunk, { seg: 7, rTop: 0.15, jitter: 0.03 });
  k.s.cyl(0.14, 0.02, 0, 0.21, 0, C.woodLight, { seg: 7, jitter: 0 });
  if (r() > 0.4) k.s.ball(0.06, 0.12, 0.23, 0.04, C.tulip, { detail: 0 });
}

export function mushroom(k: Kit, r: Rand, color: ColorLike = C.tulip): void {
  const h = range(r, 0.06, 0.1);
  k.s.cyl(0.015, h, 0, 0, 0, C.white, { seg: 4, jitter: 0, caps: 'none' });
  k.s.cone(0.05, 0.05, 0, h, 0, color, { seg: 5, jitter: 0.03 });
}

/** Decorative wild-flower meadow patch for the south: several colors mixed. */
export function meadowPatch(k: Kit, r: Rand, spread = 0.7): void {
  flowerPatch(k, r, 6, spread, [C.white, C.yellow, C.tulip, C.violet]);
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2, d = r() * spread;
    grassTuft(k.at(Math.cos(a) * d, 0, Math.sin(a) * d), r);
  }
}

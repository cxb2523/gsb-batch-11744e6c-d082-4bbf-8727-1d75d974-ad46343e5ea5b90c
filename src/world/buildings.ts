import type { ColorLike } from './kit';
import { mix, shade } from './kit';
import { Kit } from './context';
import { C } from './palette';
import { picto, type PictoKind } from './pictos';
import { GLOW } from './materials';
import { addHalo } from './halos';
import type { Flaps } from './flaps';

export interface ShutterLeaves { flaps: Flaps; tag: string; color: ColorLike; rest?: number; open?: number }

/** The building kit: walls, roofs, windows, doors, awnings, signs, chimneys.
 * Everything is authored in a house frame: origin at the center of the
 * ground footprint, +Z toward the front face, +Y up. */

export interface SignSpec {
  kind: PictoKind;
  board?: ColorLike;
  a?: ColorLike;
  b?: ColorLike;
  /** 'wall' = flat board above the shopfront; 'hang' = projecting bracket sign. */
  style?: 'wall' | 'hang';
  x?: number;
}

export type Slot = 'w' | 'W' | 'd' | 's' | 'b' | 'v' | 'a';

export interface HouseSpec {
  w: number;
  d: number;
  floors?: number[];
  wall: ColorLike;
  trim?: ColorLike;
  base?: ColorLike | null;
  roofColor: ColorLike;
  roof?: 'gable' | 'hip' | 'flat' | 'shed';
  ridge?: 'x' | 'z';
  rise?: number;
  overhang?: number;
  plinth?: number;
  /** Per floor, left to right across the front. */
  front?: Slot[][];
  /** Side/back windows per floor (count). */
  sides?: number[];
  back?: number[];
  doorColor?: ColorLike;
  shutters?: ColorLike | null;
  /** Animated shutter leaves (instanced) instead of static shutter boards. */
  leaves?: ShutterLeaves;
  chimney?: { x: number; z: number; color?: ColorLike } | null;
  awning?: { colors: [ColorLike, ColorLike]; slot?: number; width?: number } | null;
  sign?: SignSpec | null;
  lanterns?: number;
  flowerBoxes?: boolean;
  glow?: number;
  glass?: ColorLike;
  collide?: boolean;
  curtains?: ColorLike | null;
  doorStep?: boolean;
  /** Door frame glow (e.g. warm lamp over the door). */
  doorLamp?: boolean;
  chimneySmoke?: boolean;
  shingles?: boolean;
}

export interface HouseInfo {
  wallTop: number;
  top: number;
  /** Local door position (x) and the front z. */
  doorX: number;
  frontZ: number;
  windows: { floor: number; x: number; y: number; face: 'front' | 'left' | 'right' | 'back'; z: number; w: number; h: number }[];
  chimneyTop?: { x: number; y: number; z: number };
}

const GLASS = C.glass;

function slotsX(n: number, w: number, margin = 0.22): number[] {
  const usable = w - margin * 2;
  return Array.from({ length: n }, (_, i) => (-usable / 2) + usable * (i + 0.5) / n);
}

/** Window on a face (face frame: +Z outward, z=0 on the wall surface). */
export function windowOn(k: Kit, x: number, y: number, o: {
  w?: number; h?: number; shutter?: ColorLike | null; trim?: ColorLike; glow?: number; box?: boolean; curtains?: ColorLike | null;
  flowers?: ColorLike[]; arch?: boolean; mullions?: boolean; lit?: boolean; leaves?: ShutterLeaves; glass?: ColorLike;
} = {}): void {
  const w = o.w ?? 0.5, h = o.h ?? 0.62;
  const trim = o.trim ?? C.white;
  k.d.box(w - 0.09, h - 0.09, 0.02, x, y, 0.036, o.lit ? C.glassWarm : (o.glass ?? GLASS), { glow: o.glow ?? GLOW.none, jitter: 0 });
  if (o.curtains) {
    k.d.box((w - 0.09) * 0.36, (h - 0.09) * 0.8, 0.02, x - (w - 0.09) * 0.32, y + 0.04, 0.05, o.curtains, { jitter: 0 });
    k.d.box((w - 0.09) * 0.36, (h - 0.09) * 0.8, 0.02, x + (w - 0.09) * 0.32, y + 0.04, 0.05, o.curtains, { jitter: 0 });
  }
  // frame (one open picture-frame prism instead of four boxes)
  k.s.frame(w + 0.1, h + 0.1, 0.07, 0.05, x, y, -0.005, trim, { jitter: 0 });
  if (o.mullions !== false) {
    k.s.box(0.03, h - 0.04, 0.055, x, y, 0.04, trim, { jitter: 0 });
    k.s.box(w - 0.04, 0.03, 0.055, x, y + 0.04, 0.04, trim, { jitter: 0 });
  }
  // sill
  k.s.box(w + 0.2, 0.05, 0.14, x, y - h / 2 - 0.045, 0.06, shade(trim, -0.08), { jitter: 0 });
  if (o.leaves) {
    const lw = w / 2 + 0.05;
    o.leaves.flaps.add(k, x - w / 2 - 0.05, y, lw, h + 0.06, o.leaves.color, 1, o.leaves.tag, o.leaves.open ?? 2.9, o.leaves.rest ?? 0);
    o.leaves.flaps.add(k, x + w / 2 + 0.05, y, lw, h + 0.06, o.leaves.color, -1, o.leaves.tag, o.leaves.open ?? 2.9, o.leaves.rest ?? 0);
  } else if (o.shutter) {
    const sw = w * 0.5;
    for (const side of [-1, 1]) {
      const sx = x + side * (w / 2 + sw / 2 + 0.06);
      k.s.box(sw, h + 0.04, 0.035, sx, y, 0.035, o.shutter, { jitter: 0 });
      k.s.box(sw - 0.06, 0.02, 0.045, sx, y, 0.035, shade(o.shutter, -0.16), { jitter: 0 });
    }
  }
  if (o.box) {
    k.s.box(w + 0.16, 0.14, 0.15, x, y - h / 2 - 0.16, 0.12, C.woodDark, { jitter: 0 });
    const colors = o.flowers ?? [C.tulip, C.yellow, C.white];
    for (let i = 0; i < 5; i++) {
      const fx = x + (i - 2) * (w + 0.08) / 5;
      k.f.octa(0.065, fx, y - h / 2 - 0.05, 0.13, C.leafMid, { sway: 0.5, swayHeight: 0.3 });
      k.f.octa(0.045, fx + 0.02, y - h / 2 + 0.02, 0.15, colors[i % colors.length], { sway: 0.6, swayHeight: 0.3 });
    }
  }
}

/** Door on a face. */
export function doorOn(k: Kit, x: number, o: {
  w?: number; h?: number; color?: ColorLike; trim?: ColorLike; step?: boolean; lamp?: boolean; arch?: boolean; glow?: number;
} = {}): void {
  const w = o.w ?? 0.56, h = o.h ?? 1.2;
  const trim = o.trim ?? C.white;
  const color = o.color ?? C.woodDark;
  k.s.box(w + 0.16, h + 0.08, 0.06, x, h / 2 + 0.02, 0.03, trim, { jitter: 0 });
  k.d.box(w, h, 0.05, x, h / 2, 0.045, color, { jitter: 0 });
  // panels
  k.d.box(w * 0.7, h * 0.34, 0.03, x, h * 0.28, 0.075, shade(color, 0.12), { jitter: 0 });
  k.d.box(w * 0.7, h * 0.34, 0.03, x, h * 0.72, 0.075, shade(color, 0.12), { jitter: 0 });
  k.d.ball(0.035, x + w * 0.32, h * 0.5, 0.085, C.brass, { detail: 0, jitter: 0 });
  // threshold
  k.s.box(w + 0.3, 0.06, 0.28, x, 0.03, 0.14, C.stone, { jitter: 0.04 });
  if (o.step) k.s.box(w + 0.5, 0.09, 0.2, x, 0.045, 0.34, C.stoneDark, { jitter: 0.04 });
  if (o.lamp) {
    k.s.box(0.04, 0.04, 0.12, x, h + 0.18, 0.08, C.iron, { jitter: 0 });
    k.d.ball(0.07, x, h + 0.14, 0.15, C.lantern, { glow: o.glow ?? GLOW.finale, jitter: 0, detail: 0 });
    addHalo(k.p(x, h + 0.14, 0.15), 0.45, o.glow ?? GLOW.finale);
  }
}

export function awningOn(k: Kit, x: number, y: number, width: number, colors: [ColorLike, ColorLike], depth = 0.62, drop = 0.28): void {
  const n = Math.max(4, Math.round(width / 0.2));
  const sw = width / n;
  const angle = Math.atan2(drop, depth);
  const len = Math.hypot(depth, drop);
  for (let i = 0; i < n; i++) {
    const c = colors[i % 2];
    const sx = x - width / 2 + sw * (i + 0.5);
    k.s.box(sw, 0.03, len, sx, y - drop / 2, depth / 2, c, { rot: [angle, 0, 0], jitter: 0 });
    k.s.box(sw, 0.11, 0.025, sx, y - drop - 0.04, depth - 0.01, c, { jitter: 0 });
  }
  for (const sx of [x - width / 2 + 0.04, x + width / 2 - 0.04]) {
    k.s.rod(sx, y - drop, depth - 0.04, sx, 0.0, depth - 0.04, 0.022, C.woodDark, { seg: 5 });
  }
  k.s.box(width + 0.04, 0.05, 0.05, x, y + 0.005, 0.03, C.woodDark, { jitter: 0 });
}

export function signOn(k: Kit, x: number, y: number, sign: SignSpec, glow?: number): void {
  const board = sign.board ?? C.woodLight;
  const a = sign.a ?? C.red, b = sign.b ?? C.white;
  if (sign.style === 'hang') {
    k.s.rod(x, y + 0.34, 0.0, x, y + 0.34, 0.58, 0.02, C.iron, { seg: 5 });
    const side = k.at(x, y, 0.45, Math.PI / 2);
    side.s.box(0.46, 0.46, 0.04, 0, 0, 0, board, { jitter: 0 });
    side.s.box(0.5, 0.5, 0.025, 0, 0, -0.012, C.woodDark, { jitter: 0 });
    side.d.box(0.46, 0.46, 0.04, 0, 0, 0, board, { jitter: 0 });
    picto(side.d, sign.kind, 0, 0, 0.022, 0.34, a, b);
    const back = k.at(x, y, 0.45, -Math.PI / 2);
    picto(back.d, sign.kind, 0, 0, 0.022, 0.34, a, b);
    k.s.rod(x, y + 0.22, 0.45, x, y + 0.34, 0.45, 0.012, C.iron, { seg: 4 });
    void glow;
    return;
  }
  const w = 0.92, h = 0.4;
  k.s.box(w + 0.1, h + 0.1, 0.05, x, y, 0.03, C.woodDark, { jitter: 0 });
  k.s.box(w, h, 0.05, x, y, 0.05, board, { jitter: 0 });
  picto(k.d, sign.kind, x, y, 0.075, h * 0.82, a, b);
  for (const sx of [-1, 1]) k.s.rod(x + sx * (w / 2 - 0.05), y + h / 2, 0.04, x + sx * (w / 2 - 0.05), y + h / 2 + 0.12, 0.04, 0.012, C.iron, { seg: 4 });
}

/** Tile courses on one roof slab, running along the ridge. */
function tileCourses(k: Kit, side: number, slope: number, run: number, eaveY: number, length: number, color: ColorLike, courses: number): void {
  const dark = shade(color, -0.12);
  for (let i = 1; i < courses; i++) {
    const t = i / courses;
    const px = side * (run * (1 - t));
    const py = eaveY + slope * run * t;
    k.s.box(0.05, 0.04, length - 0.04, px, py + 0.052, 0, dark, { rot: [0, 0, -side * Math.atan(slope)], jitter: 0 });
  }
}

export function gableRoof(k: Kit, w: number, d: number, wallTop: number, rise: number, color: ColorLike, wallColor: ColorLike, overhang: number, shingles = true): void {
  const ov = overhang;
  const half = w / 2;
  const slope = rise / half;
  const theta = Math.atan(slope);
  const slabRun = (half + ov) / Math.cos(theta) + 0.02;
  const length = d + ov * 1.6;
  // gable ends in wall color
  k.s.gable(w - 0.02, rise, d - 0.04, 0, wallTop, 0, wallColor, { jitter: 0 });
  for (const side of [-1, 1]) {
    const px = side * (half + ov) / 2;
    const py = wallTop + rise - (rise + ov * slope) / 2 - 0.0;
    k.s.box(slabRun, 0.075, length, px * 1.0, py + (side === 1 ? 0 : 0), 0, color, { rot: [0, 0, -side * theta], jitter: 0.02 });
  }
  // ridge cap
  k.s.box(0.12, 0.08, length + 0.03, 0, wallTop + rise + 0.045, 0, shade(color, -0.2), { jitter: 0 });
  if (shingles) {
    const c = Math.max(2, Math.round((half + ov) / 0.34));
    for (const side of [-1, 1]) tileCourses(k, side, slope, half, wallTop, length, color, c);
  }
  // fascia boards on the gable ends
  for (const z of [-1, 1]) {
    for (const side of [-1, 1]) {
      const px = side * (half + ov) / 2;
      const py = wallTop + rise - (rise + ov * slope) / 2;
      k.s.box(slabRun, 0.12, 0.04, px, py - 0.045, z * (length / 2 - 0.01), shade(color, -0.22), { rot: [0, 0, -side * theta], jitter: 0 });
    }
  }
}

function chimneyOn(k: Kit, x: number, z: number, from: number, to: number, color: ColorLike): void {
  k.s.box(0.26, to - from, 0.26, x, (from + to) / 2, z, color, { jitter: 0.03 });
  k.s.box(0.34, 0.07, 0.34, x, to + 0.03, z, shade(color, -0.15), { jitter: 0 });
  k.s.cyl(0.07, 0.12, x, to + 0.06, z, C.coal, { seg: 6, jitter: 0 });
}

/** Build a complete house. Returns anchor-relevant measurements. */
export function house(k: Kit, spec: HouseSpec): HouseInfo {
  const { w, d } = spec;
  const floors = spec.floors ?? [1.9];
  const plinth = spec.plinth ?? 0.18;
  const trim = spec.trim ?? C.white;
  const wallColor = spec.wall;
  const overhang = spec.overhang ?? 0.22;
  const roofKind = spec.roof ?? 'gable';
  const total = floors.reduce((s, f) => s + f, 0);
  const wallTop = plinth + total;
  const info: HouseInfo = { wallTop, top: wallTop, doorX: 0, frontZ: d / 2, windows: [] };

  // foundation and plinth
  k.s.block(-w / 2 - 0.04, -0.45, -d / 2 - 0.04, w / 2 + 0.04, plinth, d / 2 + 0.04, spec.base === null ? wallColor : (spec.base ?? C.stone), { jitter: 0.03 });
  // walls
  let y = plinth;
  floors.forEach((fh, i) => {
    k.s.box(w, fh, d, 0, y + fh / 2, 0, wallColor, { jitter: 0.015 });
    if (i < floors.length - 1) k.s.box(w + 0.1, 0.09, d + 0.1, 0, y + fh, 0, trim, { jitter: 0 });
    y += fh;
  });
  // corner posts
  const post = shade(wallColor, -0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.s.box(0.09, total, 0.09, sx * (w / 2), plinth + total / 2, sz * (d / 2), post, { jitter: 0 });
  k.s.box(w + 0.08, 0.07, d + 0.08, 0, wallTop - 0.02, 0, trim, { jitter: 0 });

  // roof
  let top = wallTop;
  if (roofKind === 'gable') {
    const alongX = spec.ridge === 'x';
    const rise = spec.rise ?? Math.min(w, alongX ? d : w) * 0.42 + 0.1;
    if (alongX) {
      // ridge along x: build in a yawed child frame with swapped dims
      const kk = k.at(0, 0, 0, Math.PI / 2);
      gableRoof(kk, d, w, wallTop, rise, spec.roofColor, wallColor, overhang, spec.shingles ?? true);
    } else gableRoof(k, w, d, wallTop, rise, spec.roofColor, wallColor, overhang, spec.shingles ?? true);
    top = wallTop + rise;
  } else if (roofKind === 'hip') {
    const rise = spec.rise ?? Math.min(w, d) * 0.5;
    k.s.hip(w + overhang * 2, rise, d + overhang * 2, Math.max(0, (d - w) / 2 / (d + overhang * 2)), 0, wallTop, 0, spec.roofColor, { jitter: 0.02 });
    k.s.box(w + overhang * 2 + 0.02, 0.07, d + overhang * 2 + 0.02, 0, wallTop + 0.02, 0, shade(spec.roofColor, -0.18), { jitter: 0 });
    top = wallTop + rise;
  } else if (roofKind === 'shed') {
    const rise = spec.rise ?? 0.5;
    k.s.box(w + overhang * 2, 0.07, d + overhang * 2, 0, wallTop + rise / 2, 0, spec.roofColor, { rot: [-Math.atan2(rise, d), 0, 0], jitter: 0.02 });
    top = wallTop + rise;
  } else {
    k.s.box(w + 0.2, 0.12, d + 0.2, 0, wallTop + 0.05, 0, spec.roofColor, { jitter: 0.02 });
    k.s.box(w + 0.2, 0.18, 0.06, 0, wallTop + 0.15, d / 2 + 0.07, shade(spec.roofColor, -0.1), { jitter: 0 });
    k.s.box(w + 0.2, 0.18, 0.06, 0, wallTop + 0.15, -d / 2 - 0.07, shade(spec.roofColor, -0.1), { jitter: 0 });
    top = wallTop + 0.2;
  }
  info.top = top;
  if (spec.chimney) {
    chimneyOn(k, spec.chimney.x, spec.chimney.z, wallTop - 0.1, top + 0.45, spec.chimney.color ?? C.brick);
    info.chimneyTop = { x: spec.chimney.x, y: top + 0.55, z: spec.chimney.z };
  }

  // faces
  const front = k.at(0, 0, d / 2);
  const back = k.at(0, 0, -d / 2, Math.PI);
  const right = k.at(w / 2, 0, 0, Math.PI / 2);
  const left = k.at(-w / 2, 0, 0, -Math.PI / 2);
  const shutter = spec.shutters === undefined ? null : spec.shutters;
  const glow = spec.glow ?? GLOW.none;
  let floorBase = plinth;
  floors.forEach((fh, fi) => {
    const slots = spec.front?.[fi] ?? (fi === 0 ? ['w', 'd', 'w'] : ['w', 'w', 'w']) as Slot[];
    const xs = slotsX(slots.length, w);
    slots.forEach((slot, si) => {
      const x = xs[si];
      if (slot === 'd') {
        doorOn(front, x, { color: spec.doorColor, trim, step: spec.doorStep ?? true, lamp: spec.doorLamp, h: Math.min(1.25, fh - 0.4) });
        info.doorX = x;
      } else if (slot === 'w' || slot === 'W') {
        const wy = floorBase + fh * 0.56;
        windowOn(front, x, wy, { shutter: slot === 'w' ? shutter : null, leaves: slot === 'w' ? spec.leaves : undefined, trim, glow, glass: spec.glass, box: !!spec.flowerBoxes && fi > 0, curtains: spec.curtains });
        info.windows.push({ floor: fi, x, y: wy, face: 'front', z: d / 2, w: 0.5, h: 0.62 });
      } else if (slot === 's') {
        const ww = Math.min(1.05, w / slots.length - 0.25);
        windowOn(front, x, floorBase + 0.78, { w: ww, h: 0.72, trim: shade(trim, -0.1), glow, mullions: true });
        front.s.box(ww + 0.22, 0.3, 0.1, x, floorBase + 0.28, 0.05, shade(wallColor, -0.12), { jitter: 0 });
        info.windows.push({ floor: fi, x, y: floorBase + 0.78, face: 'front', z: d / 2, w: ww, h: 0.72 });
      } else if (slot === 'b') {
        // balcony door window with a rail and pots
        windowOn(front, x, floorBase + fh * 0.5, { w: 0.5, h: 0.95, trim, glow, shutter, leaves: spec.leaves });
        front.s.box(0.95, 0.06, 0.42, x, floorBase + 0.02, 0.2, C.woodDark, { jitter: 0 });
        for (let i = 0; i < 6; i++) front.s.box(0.025, 0.36, 0.025, x - 0.4 + i * 0.16, floorBase + 0.23, 0.39, C.woodDark, { jitter: 0 });
        front.s.box(0.95, 0.04, 0.04, x, floorBase + 0.42, 0.39, trim, { jitter: 0 });
        for (let i = 0; i < 3; i++) {
          front.s.cyl(0.07, 0.1, x - 0.28 + i * 0.28, floorBase + 0.05, 0.3, C.brick, { seg: 6, rTop: 0.085, jitter: 0 });
          front.f.octa(0.09, x - 0.28 + i * 0.28, floorBase + 0.2, 0.3, i === 1 ? C.tulip : C.leafMid, { sway: 0.5, swayHeight: 0.3 });
        }
        info.windows.push({ floor: fi, x, y: floorBase + fh * 0.5, face: 'front', z: d / 2, w: 0.5, h: 0.95 });
      }
    });
    const sideFaces: [Kit, number, 'left' | 'right' | 'back'][] = [[right, w, 'right'], [left, w, 'left'], [back, w, 'back']];
    sideFaces.forEach(([face, , name]) => {
      const n = name === 'back' ? (spec.back?.[fi] ?? 2) : (spec.sides?.[fi] ?? 1);
      const span = name === 'back' ? w : d;
      const px = slotsX(n, span, 0.4);
      px.forEach(x => {
        const wy = floorBase + fh * 0.56;
        windowOn(face, x, wy, { shutter: shutter ?? (spec.leaves ? spec.leaves.color : null), trim, glow, glass: spec.glass });
        info.windows.push({ floor: fi, x, y: wy, face: name, z: 0, w: 0.5, h: 0.62 });
      });
    });
    floorBase += fh;
  });

  if (spec.awning) {
    const slots = spec.front?.[0] ?? ['w', 'd', 'w'];
    const xs = slotsX(slots.length, w);
    const index = spec.awning.slot ?? Math.max(0, slots.findIndex(s => s === 'd' || s === 's'));
    const ax = spec.awning.slot === undefined ? 0 : xs[index];
    const aw = spec.awning.width ?? Math.min(w - 0.2, 1.8);
    awningOn(front, ax, plinth + Math.min(1.55, floors[0] - 0.25), aw, spec.awning.colors);
  }
  if (spec.sign) {
    const sx = spec.sign.x ?? 0;
    if (spec.sign.style === 'hang') signOn(front, sx + w / 2 - 0.35, plinth + floors[0] - 0.55, spec.sign, glow);
    else signOn(front, sx, plinth + floors[0] + (floors.length > 1 ? -0.2 : 0) - 0.08, spec.sign, glow);
  }
  for (let i = 0; i < (spec.lanterns ?? 0); i++) {
    const lx = (i - ((spec.lanterns ?? 1) - 1) / 2) * 0.9;
    front.s.rod(lx, plinth + 1.75, 0.02, lx, plinth + 1.75, 0.3, 0.015, C.iron, { seg: 4 });
    front.s.rod(lx, plinth + 1.75, 0.3, lx, plinth + 1.66, 0.3, 0.008, C.iron, { seg: 3 });
    front.d.ball(0.11, lx, plinth + 1.55, 0.3, C.lantern, { glow: GLOW.oldLanterns, scale: [1, 1.25, 1], jitter: 0, detail: 0 });
    front.s.cyl(0.05, 0.03, lx, plinth + 1.69, 0.3, C.iron, { seg: 6, jitter: 0 });
    addHalo(front.p(lx, plinth + 1.55, 0.3), 0.55, GLOW.oldLanterns);
  }

  if (spec.collide !== false) {
    k.c.block(-w / 2 - 0.04, -0.6, -d / 2 - 0.04, w / 2 + 0.04, wallTop + 0.05, d / 2 + 0.04);
    if (roofKind === 'gable') {
      const alongX = spec.ridge === 'x';
      const rise = top - wallTop;
      if (alongX) k.c.gable(d + overhang * 2, rise, w + overhang * 2, 0, wallTop, 0, undefined, { rot: [0, Math.PI / 2, 0] });
      else k.c.gable(w + overhang * 2, rise, d + overhang * 2, 0, wallTop, 0);
    } else if (roofKind === 'hip') k.c.hip(w + overhang * 2, top - wallTop, d + overhang * 2, 0.2, 0, wallTop, 0);
    else k.c.block(-w / 2 - 0.1, wallTop, -d / 2 - 0.1, w / 2 + 0.1, top + 0.1, d / 2 + 0.1);
  }
  void mix;
  return info;
}

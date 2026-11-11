import { Kit } from './context';
import type { ColorLike, Prim } from './kit';
import { cached, polyPrim, shade } from './kit';
import { C } from './palette';
import { GLOW } from './materials';
import { addHalo } from './halos';
import { crate, ropeCoil, buoy } from './props';

/** Little wooden boats lofted from a handful of cross sections. Boat frame:
 * origin at the waterline center, +Z toward the bow, +Y up. */

interface Station { z: number; hw: number; top: number; bot: number }
type V = [number, number, number];

function section(s: Station): V[] {
  const mid = s.bot + (s.top - s.bot) * 0.5;
  return [
    [-s.hw, s.top, s.z], [-s.hw * 0.94, mid, s.z], [-s.hw * 0.5, s.bot, s.z],
    [s.hw * 0.5, s.bot, s.z], [s.hw * 0.94, mid, s.z], [s.hw, s.top, s.z],
  ];
}

function outward(face: V[], ref: V): V[] {
  const [a, b, c] = face;
  const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  const cx = face.reduce((s, v) => s + v[0], 0) / face.length - ref[0];
  const cy = face.reduce((s, v) => s + v[1], 0) / face.length - ref[1];
  const cz = face.reduce((s, v) => s + v[2], 0) / face.length - ref[2];
  return n[0] * cx + n[1] * cy + n[2] * cz >= 0 ? face : face.slice().reverse();
}

function hullSides(key: string, stations: Station[]): Prim {
  return cached(`hull:${key}`, () => {
    const faces: V[][] = [];
    for (let i = 0; i + 1 < stations.length; i++) {
      const a = section(stations[i]), b = section(stations[i + 1]);
      const ref: V = [0, (stations[i].top + stations[i].bot) / 2, (stations[i].z + stations[i + 1].z) / 2];
      for (let j = 0; j < 5; j++) faces.push(outward([a[j], a[j + 1], b[j + 1], b[j]], ref));
    }
    const first = section(stations[0]), last = section(stations[stations.length - 1]);
    faces.push(outward(first, [0, 0, stations[0].z + 1]).slice());
    faces.push(outward(last, [0, 0, stations[stations.length - 1].z - 1]));
    return polyPrim(faces);
  });
}

function hullDeck(key: string, stations: Station[], inset = 0.0): Prim {
  return cached(`deck:${key}`, () => {
    const faces: V[][] = [];
    for (let i = 0; i + 1 < stations.length; i++) {
      const a = stations[i], b = stations[i + 1];
      faces.push(outward([[-a.hw + inset, a.top - 0.02, a.z], [a.hw - inset, a.top - 0.02, a.z], [b.hw - inset, b.top - 0.02, b.z], [-b.hw + inset, b.top - 0.02, b.z]], [0, -1, a.z]));
    }
    return polyPrim(faces);
  });
}

export interface BoatSpec {
  len: number;
  beam: number;
  hull: ColorLike;
  stripe?: ColorLike;
  inner?: ColorLike;
  cabin?: { color: ColorLike; roof: ColorLike } | null;
  mast?: ColorLike | null;
  lantern?: boolean;
  halo?: boolean;
  cargo?: 'crates' | 'net' | 'none';
  seats?: number;
  oars?: boolean;
  flag?: ColorLike | null;
  /** collider for beached/moored boats */
  collide?: boolean;
}

export function boat(k: Kit, spec: BoatSpec): void {
  const L = spec.len, B = spec.beam;
  const stations: Station[] = [
    { z: -0.5 * L, hw: 0.4 * B, top: 0.3, bot: -0.28 },
    { z: -0.3 * L, hw: 0.5 * B, top: 0.28, bot: -0.3 },
    { z: 0.0, hw: 0.5 * B, top: 0.27, bot: -0.3 },
    { z: 0.3 * L, hw: 0.44 * B, top: 0.3, bot: -0.28 },
    { z: 0.45 * L, hw: 0.2 * B, top: 0.38, bot: -0.2 },
    { z: 0.5 * L, hw: 0.03 * B, top: 0.46, bot: -0.12 },
  ];
  const key = `${L.toFixed(2)}:${B.toFixed(2)}`;
  const stripe = spec.stripe ?? C.white;
  const inner = spec.inner ?? C.woodLight;
  k.s.shape(hullSides(key, stations), 1, 1, 1, 0, 0, 0, spec.hull, { jitter: 0.02 });
  k.s.shape(hullDeck(key, stations), 1, 1, 1, 0, 0, 0, inner, { jitter: 0.02 });
  // gunwale rails and stripe along the top edge
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i], b = stations[i + 1];
    for (const sx of [-1, 1]) {
      k.s.rod(sx * a.hw, a.top + 0.02, a.z, sx * b.hw, b.top + 0.02, b.z, 0.045, stripe, { seg: 4, jitter: 0 });
      k.s.rod(sx * (a.hw - 0.02), a.top + 0.1, a.z, sx * (b.hw - 0.02), b.top + 0.1, b.z, 0.03, shade(spec.hull, -0.1), { seg: 4, jitter: 0 });
    }
  }
  k.s.rod(-stations[0].hw, stations[0].top + 0.02, stations[0].z, stations[0].hw, stations[0].top + 0.02, stations[0].z, 0.045, stripe, { seg: 4, jitter: 0 });
  // seats
  const seats = spec.seats ?? 2;
  for (let i = 0; i < seats; i++) {
    const z = (i - (seats - 1) / 2) * L * 0.28 - 0.05 * L;
    k.s.box(B * 0.86, 0.04, 0.16, 0, 0.14, z, C.wood, { jitter: 0.03 });
  }
  if (spec.oars) {
    for (const sx of [-1, 1]) {
      k.s.rod(sx * (B * 0.5 + 0.02), 0.28, 0.1, sx * (B * 0.5 + 0.55), 0.1, 0.45, 0.022, C.woodLight, { seg: 4 });
      k.s.box(0.1, 0.02, 0.28, sx * (B * 0.5 + 0.62), 0.1, 0.52, C.woodLight, { jitter: 0 });
    }
  }
  if (spec.cabin) {
    const cz = -0.12 * L;
    k.s.box(B * 0.78, 0.62, L * 0.28, 0, 0.55, cz, spec.cabin.color, { jitter: 0.02 });
    k.s.box(B * 0.9, 0.06, L * 0.32, 0, 0.88, cz, spec.cabin.roof, { jitter: 0 });
    for (const sx of [-1, 1]) k.d.box(0.03, 0.2, L * 0.14, sx * B * 0.39, 0.62, cz, C.glass, { jitter: 0 });
    k.d.box(B * 0.42, 0.2, 0.03, 0, 0.62, cz + L * 0.14, C.glass, { jitter: 0 });
    k.s.box(B * 0.3, 0.38, 0.03, 0, 0.42, cz + L * 0.141, C.woodDark, { jitter: 0 });
  }
  if (spec.mast) {
    const mz = L * 0.18;
    k.s.cyl(0.035, 1.5, 0, 0.1, mz, C.woodDark, { seg: 5, rTop: 0.025 });
    k.s.box(0.025, 0.025, L * 0.35, 0, 0.55, mz - L * 0.17, C.woodDark, { jitter: 0 });
    if (spec.flag) k.s.box(0.22, 0.12, 0.015, 0.12, 1.5, mz, spec.flag, { jitter: 0 });
  }
  if (spec.lantern) {
    k.s.rod(0, 0.34, L * 0.5 - 0.02, 0, 0.6, L * 0.5 - 0.02, 0.018, C.iron, { seg: 4 });
    k.d.ball(0.065, 0, 0.64, L * 0.5 - 0.02, C.lantern, { glow: GLOW.finale, detail: 0, jitter: 0 });
    if (spec.halo) addHalo(k.p(0, 0.64, L * 0.5 - 0.02), 0.5, GLOW.finale);
  }
  if (spec.cargo === 'crates') {
    crate(k.at(B * 0.1, 0.12, L * 0.28), 0.32, C.plank, false);
    crate(k.at(-B * 0.12, 0.12, L * 0.34), 0.26, C.woodLight, false);
    buoy(k.at(B * 0.2, 0.12, -L * 0.3), C.red, 0.1);
  } else if (spec.cargo === 'net') {
    ropeCoil(k.at(0, 0.12, -L * 0.34), 0.14);
    buoy(k.at(-B * 0.2, 0.12, L * 0.26), C.yellow, 0.1);
  }
  if (spec.collide) k.c.box(B, 0.8, L, 0, 0.1, 0);
}

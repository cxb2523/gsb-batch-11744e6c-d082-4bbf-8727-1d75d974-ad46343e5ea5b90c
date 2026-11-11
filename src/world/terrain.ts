import { Vector3 } from 'three';
import { dir, PLANET_RADIUS, SEA_RADIUS } from '../chapter/data';
import { DEG, eastAt, northAt } from './frame';

/** Analytic planet surface. Every other module derives ground heights from
 * `terrainHeight`, so buildings, paths and the collision mesh always agree. */

export const BASE = PLANET_RADIUS;
/** Deepest point the player may wade to; blockers wall off anything deeper. */
export const WADE_DEPTH = 0.42;

interface Blob { lat: number; lon: number; rx: number; ry: number; rot?: number }

function localXY(n: Vector3, c: Vector3, rot = 0): [number, number] {
  const dot = Math.min(1, Math.max(-1, n.dot(c)));
  if (dot < -0.2) return [1e3, 1e3];
  const angle = Math.acos(dot);
  if (angle < 1e-7) return [0, 0];
  const tx = n.x - c.x * dot, ty = n.y - c.y * dot, tz = n.z - c.z * dot;
  const len = Math.hypot(tx, ty, tz);
  const e = eastAt(c), nn = northAt(c);
  const x = (tx * e.x + ty * e.y + tz * e.z) / len * angle * PLANET_RADIUS;
  const y = (tx * nn.x + ty * nn.y + tz * nn.z) / len * angle * PLANET_RADIUS;
  if (!rot) return [x, y];
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return [x * cs + y * sn, -x * sn + y * cs];
}

const cacheDirs = new Map<Blob, Vector3>();
function blobDir(b: Blob): Vector3 {
  let d = cacheDirs.get(b);
  if (!d) { d = dir(b.lat, b.lon); cacheDirs.set(b, d); }
  return d;
}
/** Positive inside the ellipse; value is roughly the distance to its edge in world units. */
function blobInside(n: Vector3, b: Blob): number {
  const [x, y] = localXY(n, blobDir(b), b.rot);
  const g = Math.hypot(x / b.rx, y / b.ry);
  return (1 - g) * Math.min(b.rx, b.ry);
}

/** Water bodies (union) and land carve-outs (capes/islands) in world units. */
const SEAS: Blob[] = [
  { lat: -30, lon: -19, rx: 8.3, ry: 8.1 },      // harbor bay, west half
  { lat: -25, lon: 14, rx: 6.85, ry: 6.85 },     // harbor bay, east half
  { lat: -24, lon: 72, rx: 3.6, ry: 3.1 },       // southern cove
  { lat: -46, lon: 128, rx: 3.0, ry: 2.5 },      // lake in the southern meadows
  { lat: -38, lon: -104, rx: 3.2, ry: 2.6 },     // lake south-west
];
const CAPES: Blob[] = [
  { lat: -3, lon: -27.5, rx: 2.7, ry: 3.8, rot: 0 },  // lighthouse cape
];

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function noise(n: Vector3): number {
  return 0.5 * Math.sin(n.x * 5.1 + 1.3) * Math.sin(n.y * 4.7 + n.z * 2.2)
    + 0.3 * Math.sin(n.z * 9.3 + n.x * 3.1 + 0.7) * Math.sin(n.y * 8.1 - n.x * 2.0)
    + 0.2 * Math.sin(n.x * 17.0 + n.y * 11.0) * Math.sin(n.z * 13.0 - 0.5);
}

/** Positive into water (world units from the shoreline). */
export function seaDepthField(n: Vector3): number {
  let u = -1e3;
  for (const blob of SEAS) u = Math.max(u, blobInside(n, blob));
  if (u > -4) {
    for (const cape of CAPES) u = Math.min(u, -blobInside(n, cape));
    u += 0.22 * noise(n) * 1.6;
  }
  return u;
}

const HILLS: { lat: number; lon: number; sigma: number; amp: number }[] = [
  { lat: 38.2, lon: 131.5, sigma: 7.5, amp: 1.9 },  // workshop hill with the spring on top
  { lat: 6, lon: 132, sigma: 7.5, amp: 0.95 },   // terraces slope
  { lat: 72, lon: 0, sigma: 8, amp: 0.7 },       // great tree mound
  { lat: -58, lon: 180, sigma: 8, amp: 0.7 },    // far house knoll
  { lat: -38, lon: 100, sigma: 9, amp: 1.0 },
  { lat: -50, lon: -80, sigma: 10, amp: 1.3 },
  { lat: 32, lon: -40, sigma: 7, amp: 0.6 },
  { lat: 48, lon: 62, sigma: 8, amp: 0.8 },
  { lat: -8, lon: 150, sigma: 7, amp: 0.9 },
  { lat: 38, lon: -150, sigma: 9, amp: 1.0 },
  { lat: -78, lon: 30, sigma: 10, amp: 0.9 },
  { lat: 12, lon: 178, sigma: 8, amp: 0.8 },
  { lat: 45, lon: -85, sigma: 8, amp: 0.7 },
  { lat: -20, lon: -150, sigma: 8, amp: 0.8 },
];

/** Areas kept level for streets and plazas: center, flat radius, blend radius (world units). */
const FLATS: { lat: number; lon: number; r0: number; r1: number }[] = [
  { lat: 10, lon: 0, r0: 6.6, r1: 9.6 },        // harbor
  { lat: 15.07, lon: 106.92, r0: 3.4, r1: 5.0 }, // workshop yard
  { lat: 15, lon: -118, r0: 6.8, r1: 9.8 },     // old street
  { lat: -1.53, lon: 136.91, r0: 3.3, r1: 5.0 }, // flower terraces
  { lat: 72, lon: 0, r0: 2.2, r1: 4.2 },        // great tree plateau
  { lat: -58, lon: 180, r0: 1.8, r1: 4.4 },     // far house yard
];
const flatDirs = FLATS.map(f => dir(f.lat, f.lon));
const hillDirs = HILLS.map(h => dir(h.lat, h.lon));

/** Weight (0..1) and index of the dominant level area at a direction. */
function flatInfo(n: Vector3): [number, number] {
  let w = 0, k = -1;
  for (let i = 0; i < FLATS.length; i++) {
    const f = FLATS[i];
    const d = Math.acos(Math.min(1, Math.max(-1, n.dot(flatDirs[i])))) * PLANET_RADIUS;
    const wi = 1 - smoothstep(f.r0, f.r1, d);
    if (wi > w) { w = wi; k = i; }
  }
  return [w, k];
}
export function flatness(n: Vector3): number { return flatInfo(n)[0]; }

/** Profile of the sea floor / beach as a function of u (world units into the water). */
function shoreProfile(u: number): number {
  return -1.55 * smoothstep(-1.5, 3.8, u);
}

function hillsAt(n: Vector3): number {
  let h = 0;
  for (let i = 0; i < HILLS.length; i++) {
    const hill = HILLS[i];
    const a = Math.acos(Math.min(1, Math.max(-1, n.dot(hillDirs[i])))) / DEG;
    h += hill.amp * Math.exp(-(a * a) / (2 * hill.sigma * hill.sigma));
  }
  return h;
}

/** Land height above the base radius: hills plus gentle noise. Level areas hold the
 * hill height of their center (so a yard on a hill's skirt is flat, not cut) and lose the noise. */
export function landOffset(n: Vector3): number {
  const [w, k] = flatInfo(n);
  const hills = hillsAt(n);
  const anchorHeight = k >= 0 ? hillsAt(flatDirs[k]) : 0;
  const rough = 0.11 * noise(n) + 0.05 * Math.sin(n.x * 23 + n.z * 19) * Math.sin(n.y * 21 - n.x * 7);
  return hills * (1 - w) + anchorHeight * w + rough * (1 - 0.92 * w);
}

export function terrainHeight(normal: Vector3): number {
  const n = normal;
  const u = seaDepthField(n);
  const landMask = 1 - smoothstep(-2.4, 0.2, u);
  let h = BASE + landOffset(n) * landMask + shoreProfile(u);
  // Gentle bump so the shoreline never exactly coincides with the water shell.
  if (h > SEA_RADIUS - 0.012 && h < SEA_RADIUS + 0.012) h += 0.02;
  return h;
}

/** Ground point for a unit direction. */
export function groundPoint(normal: Vector3): Vector3 {
  const n = normal.clone().normalize();
  return n.multiplyScalar(terrainHeight(n));
}

export function isLandDirection(n: Vector3, margin = 0.1): boolean {
  return terrainHeight(n) > SEA_RADIUS + margin;
}

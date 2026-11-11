/** Pure thread-path math: recording, simplification, smoothing, sag and the
 * tension limiter. No rendering here so it is unit-testable in plain Node. All
 * hot paths work on typed arrays and scalars (no per-call allocation). */

/** How far above the surface the cord's centre line is laid (cord radius is ~0.036). */
export const THREAD_LIFT = 0.046;
/** Minimum distance between recorded control points. */
export const RECORD_SPACING = 0.22;
/** Bigger gaps than this (landing after a jump) are bridged with draped points. */
export const GAP_BRIDGE = 0.6;
/** Distance between tube rings along the smoothed curve. */
export const RING_SPACING = 0.12;
/** Thread laid per music-box note. */
export const STEP_DISTANCE = 0.9;

export type Drape = (t: number, gap: number, point: Float32Array) => void;

/** Records the player's grounded route as control points, bounded by a spool capacity. */
export class PathRecorder {
  readonly capacity: number;
  readonly spacing: number;
  readonly points: Float32Array;
  count = 0;
  /** Polyline length laid so far (counts toward the spool capacity). */
  length = 0;
  private readonly scratch = new Float32Array(3);

  constructor(capacity: number, spacing = RECORD_SPACING) {
    this.capacity = capacity;
    this.spacing = spacing;
    this.points = new Float32Array((Math.ceil(capacity / spacing) + 32) * 3);
  }

  get full(): boolean { return this.length >= this.capacity - 1e-4; }
  /** 0..1 spool left. */
  get remaining(): number { return Math.max(0, 1 - this.length / this.capacity); }

  begin(x: number, y: number, z: number): void {
    this.count = 1; this.length = 0;
    this.points[0] = x; this.points[1] = y; this.points[2] = z;
  }

  clear(): void { this.count = 0; this.length = 0; }

  lastX(): number { return this.points[(this.count - 1) * 3]; }
  lastY(): number { return this.points[(this.count - 1) * 3 + 1]; }
  lastZ(): number { return this.points[(this.count - 1) * 3 + 2]; }

  private push(x: number, y: number, z: number): boolean {
    if (this.count * 3 + 3 > this.points.length) return false;
    const i = this.count * 3;
    const lx = this.points[i - 3], ly = this.points[i - 2], lz = this.points[i - 1];
    const step = Math.hypot(x - lx, y - ly, z - lz);
    const room = this.capacity - this.length;
    if (step > room) {
      // Spool runs out mid-step: stop exactly at capacity along the chord.
      const k = step > 1e-9 ? Math.max(0, room) / step : 0;
      this.points[i] = lx + (x - lx) * k; this.points[i + 1] = ly + (y - ly) * k; this.points[i + 2] = lz + (z - lz) * k;
      this.length = this.capacity;
      this.count++;
      return false;
    }
    this.points[i] = x; this.points[i + 1] = y; this.points[i + 2] = z;
    this.length += step;
    this.count++;
    return true;
  }

  /** Would `record` accept a point here (far enough from the last one, spool not empty)? */
  ready(x: number, y: number, z: number): boolean {
    if (this.count === 0 || this.full) return false;
    return Math.hypot(x - this.lastX(), y - this.lastY(), z - this.lastZ()) >= this.spacing;
  }

  /** Offer a grounded, already lifted point. Returns the control points added
   * (0 when too close or the spool is empty). `drape` bends the points of a
   * bridged gap (landing after a jump) so the cord settles instead of floating. */
  record(x: number, y: number, z: number, drape?: Drape): number {
    if (this.count === 0 || this.full) return 0;
    const lx = this.lastX(), ly = this.lastY(), lz = this.lastZ();
    const dx = x - lx, dy = y - ly, dz = z - lz;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < this.spacing) return 0;
    const parts = Math.max(1, Math.floor(distance / this.spacing));
    const before = this.count;
    for (let i = 1; i <= parts; i++) {
      const t = i / parts;
      this.scratch[0] = lx + dx * t; this.scratch[1] = ly + dy * t; this.scratch[2] = lz + dz * t;
      if (i < parts && drape && distance > GAP_BRIDGE) drape(t, distance, this.scratch);
      if (!this.push(this.scratch[0], this.scratch[1], this.scratch[2])) break;
    }
    return this.count - before;
  }
}

/** Douglas–Peucker style simplification that also caps the longest straight
 * piece so the smoothed curve cannot cut corners. Returns flat xyz. */
export function simplifyPath(points: ArrayLike<number>, count: number, tolerance = 0.012, maxSegment = 1.2): number[] {
  if (count <= 2) return Array.from({ length: count * 3 }, (_, i) => points[i]);
  const keep = new Uint8Array(count);
  keep[0] = keep[count - 1] = 1;
  const stack: number[] = [0, count - 1];
  while (stack.length) {
    const j = stack.pop()!, i = stack.pop()!;
    if (j <= i + 1) continue;
    const ax = points[i * 3], ay = points[i * 3 + 1], az = points[i * 3 + 2];
    const bx = points[j * 3], by = points[j * 3 + 1], bz = points[j * 3 + 2];
    const chord = Math.hypot(bx - ax, by - ay, bz - az);
    let worst = -1, worstDistance = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segmentDistance(points[k * 3], points[k * 3 + 1], points[k * 3 + 2], ax, ay, az, bx, by, bz);
      if (d > worstDistance) { worstDistance = d; worst = k; }
    }
    if (worstDistance <= tolerance && chord <= maxSegment) continue;
    if (worstDistance <= tolerance) worst = (i + j) >> 1;
    keep[worst] = 1;
    stack.push(i, worst, worst, j);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
  return out;
}

function segmentDistance(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const lengthSq = abx * abx + aby * aby + abz * abz;
  let t = lengthSq > 1e-12 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lengthSq : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t), pz - (az + abz * t));
}

/** Round to the save resolution (0.01 world units). */
export function quantize(values: ArrayLike<number>): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) out[i] = Math.round(values[i] * 100) / 100 + 0; // + 0 folds -0 into 0
  return out;
}

export function polylineLength(points: ArrayLike<number>, count: number): number {
  let total = 0;
  for (let i = 1; i < count; i++) total += Math.hypot(points[i * 3] - points[i * 3 - 3], points[i * 3 + 1] - points[i * 3 - 2], points[i * 3 + 2] - points[i * 3 - 1]);
  return total;
}

/** One Hermite span between two control points; tangents are the averaged unit
 * chords scaled by the span length (C1, no overshoot with uneven spacing). */
export interface Seg {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  m1x: number; m1y: number; m1z: number;
  m2x: number; m2y: number; m2z: number;
  len: number;
}
export const makeSeg = (): Seg => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, m1x: 0, m1y: 0, m1z: 0, m2x: 0, m2y: 0, m2z: 0, len: 0 });

/** Point indices into `c` (xyz triples); i0/i3 may be -1 for "no neighbour".
 * With no previous point the cord leaves the first point sagging toward the
 * planet (`drop` = weight), like a thread hanging from a knob. */
export function setupSegment(seg: Seg, c: ArrayLike<number>, i0: number, i1: number, i2: number, i3: number, drop = 0): void {
  const a = i1 * 3, b = i2 * 3;
  const ax = c[a], ay = c[a + 1], az = c[a + 2], bx = c[b], by = c[b + 1], bz = c[b + 2];
  seg.ax = ax; seg.ay = ay; seg.az = az; seg.bx = bx; seg.by = by; seg.bz = bz;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  seg.len = len;
  if (len < 1e-7) { seg.m1x = seg.m1y = seg.m1z = seg.m2x = seg.m2y = seg.m2z = 0; return; }
  const ux = dx / len, uy = dy / len, uz = dz / len;
  let tx = ux, ty = uy, tz = uz;
  if (i0 >= 0) {
    const px = ax - c[i0 * 3], py = ay - c[i0 * 3 + 1], pz = az - c[i0 * 3 + 2];
    const pl = Math.hypot(px, py, pz);
    if (pl > 1e-7) { tx += px / pl; ty += py / pl; tz += pz / pl; }
  } else if (drop > 0) {
    const nl = Math.hypot(ax, ay, az) || 1;
    tx -= ax / nl * drop; ty -= ay / nl * drop; tz -= az / nl * drop;
  }
  let tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-6) { tx = ux; ty = uy; tz = uz; tl = 1; }
  seg.m1x = tx / tl * len; seg.m1y = ty / tl * len; seg.m1z = tz / tl * len;
  tx = ux; ty = uy; tz = uz;
  if (i3 >= 0) {
    const qx = c[i3 * 3] - bx, qy = c[i3 * 3 + 1] - by, qz = c[i3 * 3 + 2] - bz;
    const ql = Math.hypot(qx, qy, qz);
    if (ql > 1e-7) { tx += qx / ql; ty += qy / ql; tz += qz / ql; }
  }
  tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-6) { tx = ux; ty = uy; tz = uz; tl = 1; }
  seg.m2x = tx / tl * len; seg.m2y = ty / tl * len; seg.m2z = tz / tl * len;
}

export function hermiteAt(seg: Seg, t: number, out: Float32Array | number[], o = 0): void {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  out[o] = h00 * seg.ax + h10 * seg.m1x + h01 * seg.bx + h11 * seg.m2x;
  out[o + 1] = h00 * seg.ay + h10 * seg.m1y + h01 * seg.by + h11 * seg.m2y;
  out[o + 2] = h00 * seg.az + h10 * seg.m1z + h01 * seg.bz + h11 * seg.m2z;
}

/** Samples a smoothed curve through flat xyz control points at ~`spacing`.
 * Convenience for tests and one-off builds; the cord uses the same segments. */
export function sampleSpline(points: ArrayLike<number>, count: number, spacing = RING_SPACING, drop = 0.9): { xyz: number[]; along: number[] } {
  const xyz: number[] = [], along: number[] = [];
  const seg = makeSeg();
  const tmp = new Float32Array(3);
  let travelled = 0;
  for (let i = 0; i < count - 1; i++) {
    setupSegment(seg, points, i > 0 ? i - 1 : -1, i, i + 1, i + 2 < count ? i + 2 : -1, drop);
    const m = Math.max(1, Math.ceil(seg.len / spacing));
    const last = i === count - 2 ? m : m - 1;
    for (let j = 0; j <= last; j++) {
      hermiteAt(seg, j / m, tmp);
      if (xyz.length) travelled += Math.hypot(tmp[0] - xyz[xyz.length - 3], tmp[1] - xyz[xyz.length - 2], tmp[2] - xyz[xyz.length - 1]);
      xyz.push(tmp[0], tmp[1], tmp[2]);
      along.push(travelled);
    }
  }
  return { xyz, along };
}

/** Where along a sampled curve is arc length `distance` (linear interpolation).
 * Writes position into `out` and the unit tangent into `tangent`. */
export function pointAlong(xyz: ArrayLike<number>, along: ArrayLike<number>, rings: number, distance: number, out: Float32Array | number[], tangent?: Float32Array | number[]): void {
  if (rings < 2) { out[0] = xyz[0]; out[1] = xyz[1]; out[2] = xyz[2]; if (tangent) { tangent[0] = 1; tangent[1] = 0; tangent[2] = 0; } return; }
  let lo = 0, hi = rings - 1;
  const d = Math.min(Math.max(distance, 0), along[hi]);
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (along[mid] <= d) lo = mid; else hi = mid; }
  const span = along[hi] - along[lo];
  const t = span > 1e-9 ? (d - along[lo]) / span : 0;
  const ax = xyz[lo * 3], ay = xyz[lo * 3 + 1], az = xyz[lo * 3 + 2];
  const bx = xyz[hi * 3], by = xyz[hi * 3 + 1], bz = xyz[hi * 3 + 2];
  out[0] = ax + (bx - ax) * t; out[1] = ay + (by - ay) * t; out[2] = az + (bz - az) * t;
  if (tangent) {
    const l = Math.hypot(bx - ax, by - ay, bz - az) || 1;
    tangent[0] = (bx - ax) / l; tangent[1] = (by - ay) / l; tangent[2] = (bz - az) / l;
  }
}

/** Sag depth (world units) of the live span from the last laid point to the
 * spool. It tightens as the spool empties and vanishes when taut. */
export function liveSag(span: number, remaining: number, taut: boolean): number {
  if (taut) return 0;
  const loose = Math.min(1, Math.max(0, remaining / 0.12));
  return Math.min(1.1, span * 0.22 * loose * loose);
}

/** Movement limiter while the spool is empty: 1 when stepping back toward the
 * last laid point or sideways, falling to 0 for stepping further away once the
 * player is more than `start` from the anchor (fully held at `end`). */
export function tetherScale(
  px: number, py: number, pz: number, ax: number, ay: number, az: number,
  dx: number, dy: number, dz: number, start = 0.7, end = 1.5,
): number {
  const ox = px - ax, oy = py - ay, oz = pz - az;
  const distance = Math.hypot(ox, oy, oz);
  if (distance <= start) return 1;
  const pl = Math.hypot(px, py, pz) || 1;
  const nx = px / pl, ny = py / pl, nz = pz / pl;
  const normal = ox * nx + oy * ny + oz * nz;
  const tx = ox - nx * normal, ty = oy - ny * normal, tz = oz - nz * normal;
  const tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-4) return 1;
  const away = (dx * tx + dy * ty + dz * tz) / tl;
  if (away <= 0) return 1;
  const pull = smoothstep(start, end, distance);
  return 1 - pull * smoothstep(0.05, 0.4, away);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Light pulse duration for a cord of `length` (≈12 u/s, clamped 1..3 s). */
export function pulseDuration(length: number, speed = 12): number {
  return Math.min(3, Math.max(1, length / speed));
}

/** Reel-in duration: snappy, longer cords take a touch more. */
export function reelDuration(length: number): number {
  return Math.min(1, Math.max(0.6, 0.45 + length / 70));
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeOutBack = (t: number): number => {
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + 2.4 * u * u * u + 1.4 * u * u;
};

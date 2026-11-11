import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Sphere, type ShaderMaterial } from 'three';
import type { ThreadKind } from '../chapter/data';
import { createCordMaterial } from './shaders';
import {
  RING_SPACING, hermiteAt, makeSeg, pointAlong, setupSegment,
} from './path';

export const RADIAL = 6;
const RV = RADIAL + 1;
/** Ring budget per cord: ~(1.15 × spool + a few units) / RING_SPACING plus the live span. */
export const MAX_RINGS = 640;
const COS = Array.from({ length: RV }, (_, k) => Math.cos(k / RADIAL * Math.PI * 2));
const SIN = Array.from({ length: RV }, (_, k) => Math.sin(k / RADIAL * Math.PI * 2));
const START_DROP = 0.9;

export const CORD_RADIUS: Record<ThreadKind, number> = { power: 0.036, water: 0.043, lights: 0.036, voice: 0.034, root: 0.038 };

/** One thread's tube: preallocated buffers, ring-by-ring incremental writes
 * and a single draw call. Rings before `committed` never change; the tail
 * (last control segment + the live span to the spool) is rewritten each frame. */
export class Cord {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly geometry = new BufferGeometry();
  rings = 0;
  committed = 0;
  committedSegments = 0;
  /** Rings whose vertices are final (everything before the last committed ring). */
  private written = 0;
  radius: number;
  readonly centers = new Float32Array(MAX_RINGS * 3);
  readonly along = new Float32Array(MAX_RINGS);
  private readonly frames = new Float32Array(MAX_RINGS * 3);
  private readonly position = new Float32Array(MAX_RINGS * RV * 3);
  private readonly normal = new Float32Array(MAX_RINGS * RV * 3);
  private readonly alongAttribute = new Float32Array(MAX_RINGS * RV);
  private readonly positionAttribute: BufferAttribute;
  private readonly normalAttribute: BufferAttribute;
  private readonly alongBuffer: BufferAttribute;
  private readonly seg = makeSeg();
  private readonly segLive = makeSeg();
  private readonly tmp = new Float32Array(3);
  private readonly tail = new Float32Array(12);

  constructor(readonly kind: ThreadKind, seed: number) {
    this.radius = CORD_RADIUS[kind];
    this.material = createCordMaterial(kind, seed);
    const angle = new Float32Array(MAX_RINGS * RV);
    for (let r = 0; r < MAX_RINGS; r++) for (let k = 0; k < RV; k++) angle[r * RV + k] = k / RADIAL;
    const index = new Uint16Array((MAX_RINGS - 1) * RADIAL * 6);
    let o = 0;
    for (let r = 0; r < MAX_RINGS - 1; r++) {
      for (let k = 0; k < RADIAL; k++) {
        const a = r * RV + k, b = a + 1, c = a + RV, d = c + 1;
        index[o++] = a; index[o++] = b; index[o++] = c;
        index[o++] = b; index[o++] = d; index[o++] = c;
      }
    }
    this.positionAttribute = new BufferAttribute(this.position, 3).setUsage(DynamicDrawUsage);
    this.normalAttribute = new BufferAttribute(this.normal, 3).setUsage(DynamicDrawUsage);
    this.alongBuffer = new BufferAttribute(this.alongAttribute, 1).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('normal', this.normalAttribute);
    this.geometry.setAttribute('aAlong', this.alongBuffer);
    this.geometry.setAttribute('aAngle', new BufferAttribute(angle, 1));
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = `Thread:${kind}`;
    // Thin cords stay out of the water's depth prepass (render.ts opt-out).
    this.mesh.userData.ignoreDepthPrepass = true;
    // The bounding sphere is refreshed on every write, so ordinary frustum
    // culling applies (off-screen threads cost no draw call).
    this.geometry.boundingSphere = new Sphere();
  }

  get length(): number { return this.rings > 0 ? this.along[this.rings - 1] : 0; }

  clear(): void {
    this.rings = this.committed = this.committedSegments = this.written = 0;
    this.geometry.setDrawRange(0, 0);
    this.updateBounds();
    const uniforms = this.material.uniforms;
    uniforms.uPulse.value = -1; uniforms.uFlash.value = 0; uniforms.uClip.value = 1e5; uniforms.uReel.value = 0;
  }

  private pushCenter(x: number, y: number, z: number): void {
    if (this.rings >= MAX_RINGS) return;
    const r = this.rings++;
    this.centers[r * 3] = x; this.centers[r * 3 + 1] = y; this.centers[r * 3 + 2] = z;
    this.along[r] = r === 0 ? 0 : this.along[r - 1] + Math.hypot(x - this.centers[r * 3 - 3], y - this.centers[r * 3 - 2], z - this.centers[r * 3 - 1]);
  }

  private emitSegment(c: ArrayLike<number>, i0: number, i1: number, i2: number, i3: number, includeEnd: boolean): void {
    const seg = this.seg;
    setupSegment(seg, c, i0, i1, i2, i3, START_DROP);
    const m = Math.max(1, Math.ceil(seg.len / RING_SPACING));
    const last = includeEnd ? m : m - 1;
    for (let j = 0; j <= last; j++) {
      hermiteAt(seg, j / m, this.tmp);
      this.pushCenter(this.tmp[0], this.tmp[1], this.tmp[2]);
    }
  }

  /** Finalize every control segment whose neighbours are all known. */
  commit(ctrl: ArrayLike<number>, count: number): void {
    this.rings = this.committed;
    while (this.committedSegments + 2 <= count - 1) {
      const i = this.committedSegments;
      this.emitSegment(ctrl, i > 0 ? i - 1 : -1, i, i + 1, i + 2, false);
      this.committedSegments++;
    }
    this.committed = this.rings;
  }

  /** Rewrite the tail: the last control segment (looking ahead to the tip) and
   * the live span from the last laid point to the tip, sagging or trembling. */
  setTail(ctrl: ArrayLike<number>, count: number, tx: number, ty: number, tz: number, sag: number, tremble: number, time: number): void {
    this.rings = this.committed;
    const n = count - 1;
    const t = this.tail;
    // slots: 0 = C(n-2), 1 = C(n-1), 2 = C(n), 3 = tip
    const hasPrev2 = n >= 2, hasPrev = n >= 1;
    if (hasPrev2) for (let k = 0; k < 3; k++) t[k] = ctrl[(n - 2) * 3 + k];
    if (hasPrev) for (let k = 0; k < 3; k++) t[3 + k] = ctrl[(n - 1) * 3 + k];
    for (let k = 0; k < 3; k++) t[6 + k] = ctrl[n * 3 + k];
    t[9] = tx; t[10] = ty; t[11] = tz;
    if (hasPrev) this.emitSegment(t, hasPrev2 ? 0 : -1, 1, 2, 3, false);

    const live = this.segLive;
    setupSegment(live, t, hasPrev ? 1 : -1, 2, 3, -1, START_DROP);
    const span = live.len;
    const m = Math.min(70, Math.max(2, Math.ceil(span / 0.1)));
    // Sag direction: the planet-ward component perpendicular to the chord.
    let sx = 0, sy = 0, sz = 0, px = 0, py = 0, pz = 0;
    if (span > 1e-5 && (sag > 1e-4 || tremble > 1e-5)) {
      const cx = (t[6] + t[9]) * 0.5, cy = (t[7] + t[10]) * 0.5, cz = (t[8] + t[11]) * 0.5;
      const ul = Math.hypot(cx, cy, cz) || 1;
      const ux = cx / ul, uy = cy / ul, uz = cz / ul;
      const dx = (t[9] - t[6]) / span, dy = (t[10] - t[7]) / span, dz = (t[11] - t[8]) / span;
      const along = dx * ux + dy * uy + dz * uz;
      sx = -ux + dx * along; sy = -uy + dy * along; sz = -uz + dz * along;
      const sl = Math.hypot(sx, sy, sz);
      if (sl > 1e-5) { const k = sag * (1 - 0.6 * Math.abs(along)) / sl; sx *= k; sy *= k; sz *= k; } else { sx = sy = sz = 0; }
      // side axis for trembling
      px = dy * uz - dz * uy; py = dz * ux - dx * uz; pz = dx * uy - dy * ux;
      const pl = Math.hypot(px, py, pz);
      if (pl > 1e-5) { px /= pl; py /= pl; pz /= pl; } else { px = py = pz = 0; }
    }
    for (let j = 0; j <= m; j++) {
      const s = j / m;
      hermiteAt(live, s, this.tmp);
      const w = 4 * s * (1 - s);
      let x = this.tmp[0], y = this.tmp[1], z = this.tmp[2];
      if (w > 0) {
        x += sx * w; y += sy * w; z += sz * w;
        if (tremble > 0) {
          const shake = Math.sin(time * 61 + s * 27) * tremble * w;
          const bob = Math.cos(time * 47 + s * 19) * tremble * 0.6 * w;
          const ul = Math.hypot(x, y, z) || 1;
          x += px * shake + x / ul * bob; y += py * shake + y / ul * bob; z += pz * shake + z / ul * bob;
        }
      }
      this.pushCenter(x, y, z);
    }
    this.flush();
  }

  /** Rebuild the whole cord from final control points (saved or simplified). */
  settle(ctrl: ArrayLike<number>, count: number): void {
    this.rings = 0; this.committed = 0; this.committedSegments = 0; this.written = 0;
    if (count >= 2) {
      for (let i = 0; i < count - 1; i++) this.emitSegment(ctrl, i > 0 ? i - 1 : -1, i, i + 1, i + 2 < count ? i + 2 : -1, i === count - 2);
    }
    this.committed = this.rings;
    this.committedSegments = Math.max(0, count - 1);
    this.flush(true);
    this.written = this.rings;
  }

  private flush(full = false): void {
    const rings = this.rings;
    const from = full ? 0 : Math.max(0, Math.min(this.written, rings));
    this.writeRings(from, rings);
    // Rings up to the last committed one only change via their tangent, which
    // depends on the first tail ring: keep that one dirty.
    this.written = Math.max(this.written, Math.max(0, this.committed - 1));
    this.geometry.setDrawRange(0, rings >= 2 ? (rings - 1) * RADIAL * 6 : 0);
    this.upload(from, rings, full);
    this.updateBounds();
  }

  private updateBounds(): void {
    const c = this.centers;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let r = 0; r < this.rings; r++) {
      const x = c[r * 3], y = c[r * 3 + 1], z = c[r * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const sphere = this.geometry.boundingSphere!;
    if (this.rings === 0) { sphere.center.set(0, 0, 0); sphere.radius = 0; return; }
    sphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    // margin: tube radius, pulse swell, hum and tremble
    sphere.radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 0.25;
  }

  private writeRings(from: number, to: number): void {
    const c = this.centers, f = this.frames;
    const radius = this.radius;
    let tx = 1, ty = 0, tz = 0;
    for (let r = from; r < to; r++) {
      const p = r > 0 ? r - 1 : r, q = r < to - 1 ? r + 1 : r;
      let dx = c[q * 3] - c[p * 3], dy = c[q * 3 + 1] - c[p * 3 + 1], dz = c[q * 3 + 2] - c[p * 3 + 2];
      let dl = Math.hypot(dx, dy, dz);
      if (dl < 1e-7) { dx = tx; dy = ty; dz = tz; dl = 1; }
      tx = dx / dl; ty = dy / dl; tz = dz / dl;
      let rx: number, ry: number, rz: number;
      if (r === 0) {
        const cl = Math.hypot(c[0], c[1], c[2]) || 1;
        rx = c[0] / cl; ry = c[1] / cl; rz = c[2] / cl;
      } else { rx = f[r * 3 - 3]; ry = f[r * 3 - 2]; rz = f[r * 3 - 1]; }
      const dot = rx * tx + ry * ty + rz * tz;
      let nx = rx - tx * dot, ny = ry - ty * dot, nz = rz - tz * dot;
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-6) {
        // tangent parallel to the reference: any perpendicular will do
        nx = Math.abs(tx) < 0.8 ? 1 : 0; ny = nx ? 0 : 1; nz = 0;
        const d2 = nx * tx + ny * ty;
        nx -= tx * d2; ny -= ty * d2; nz -= tz * d2;
        nl = Math.hypot(nx, ny, nz) || 1;
      }
      nx /= nl; ny /= nl; nz /= nl;
      f[r * 3] = nx; f[r * 3 + 1] = ny; f[r * 3 + 2] = nz;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const cx = c[r * 3], cy = c[r * 3 + 1], cz = c[r * 3 + 2];
      const along = this.along[r];
      for (let k = 0; k < RV; k++) {
        const ex = nx * COS[k] + bx * SIN[k], ey = ny * COS[k] + by * SIN[k], ez = nz * COS[k] + bz * SIN[k];
        const o = (r * RV + k) * 3;
        this.position[o] = cx + ex * radius; this.position[o + 1] = cy + ey * radius; this.position[o + 2] = cz + ez * radius;
        this.normal[o] = ex; this.normal[o + 1] = ey; this.normal[o + 2] = ez;
        this.alongAttribute[r * RV + k] = along;
      }
    }
  }

  private upload(from: number, to: number, full: boolean): void {
    const attributes: [BufferAttribute, number][] = [[this.positionAttribute, 3], [this.normalAttribute, 3], [this.alongBuffer, 1]];
    for (const [attribute, size] of attributes) {
      if (full || attribute.updateRanges.length > 6) { attribute.clearUpdateRanges(); attribute.needsUpdate = true; continue; }
      attribute.addUpdateRange(from * RV * size, Math.max(0, to - from) * RV * size);
      attribute.needsUpdate = true;
    }
  }

  /** Position (and optional tangent) at arc length `distance`. */
  pointAt(distance: number, out: Float32Array | number[], tangent?: Float32Array | number[]): void {
    pointAlong(this.centers, this.along, this.rings, distance, out, tangent);
  }
}

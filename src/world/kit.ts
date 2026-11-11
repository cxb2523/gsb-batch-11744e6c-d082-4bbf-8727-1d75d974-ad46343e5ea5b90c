import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, ExtrudeGeometry,
  IcosahedronGeometry, OctahedronGeometry, Matrix3, Matrix4, Quaternion, Shape, Vector3,
} from 'three';

/** Geometry kit: every visible thing in the world is assembled from a handful
 * of flat-shaded primitives, transformed into world space and appended to a
 * few big collectors (one per zone and material kind). Static scenery is
 * therefore a few dozen draw calls no matter how many details exist. */

export type ColorLike = string | Color;
const colorCache = new Map<string, Color>();
export function toColor(value: ColorLike): Color {
  if (typeof value !== 'string') return value;
  let color = colorCache.get(value);
  if (!color) { color = new Color(value); colorCache.set(value, color); }
  return color;
}

/** Linear-space shading helpers. */
export function shade(value: ColorLike, amount: number): Color {
  const color = toColor(value).clone();
  if (amount >= 0) return color.lerp(new Color(1, 1, 1), amount);
  return color.multiplyScalar(1 + amount);
}
export function mix(a: ColorLike, b: ColorLike, t: number): Color { return toColor(a).clone().lerp(toColor(b), t); }

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A cached flat-shaded primitive: positions and face normals, no index. */
export interface Prim { pos: Float32Array; nor: Float32Array; count: number }

function toPrim(source: BufferGeometry): Prim {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  const pos = Float32Array.from(geometry.getAttribute('position').array as ArrayLike<number>);
  const nor = Float32Array.from(geometry.getAttribute('normal').array as ArrayLike<number>);
  geometry.dispose();
  return { pos, nor, count: pos.length / 3 };
}

/** Faces are given counter-clockwise as seen from outside. */
export function polyPrim(faces: number[][][]): Prim {
  const positions: number[] = [];
  for (const face of faces) {
    for (let i = 1; i + 1 < face.length; i++) positions.push(...face[0], ...face[i], ...face[i + 1]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return toPrim(geometry);
}

const cache = new Map<string, Prim>();
export function cached(key: string, make: () => Prim): Prim {
  let prim = cache.get(key);
  if (!prim) { prim = make(); cache.set(key, prim); }
  return prim;
}

/** Unit cube centered on the origin. */
export const BOX = () => cached('box', () => toPrim(new BoxGeometry(1, 1, 1)));
/** Cylinder of height 1 from y=0 up, bottom radius 1, top radius `ratio`. */
export type Caps = 'both' | 'top' | 'none';
export const CYL = (segments: number, ratio = 1, caps: Caps = 'top') => cached(`cyl:${segments}:${ratio.toFixed(3)}:${caps}`, () => {
  const g = new CylinderGeometry(ratio, 1, 1, segments, 1).translate(0, 0.5, 0).toNonIndexed();
  const position = g.getAttribute('position');
  const keep: number[] = [];
  for (const group of g.groups) {
    if (group.materialIndex === 0 || (group.materialIndex === 1 && caps !== 'none') || (group.materialIndex === 2 && caps === 'both')) {
      for (let i = group.start; i < group.start + group.count; i++) keep.push(position.getX(i), position.getY(i), position.getZ(i));
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(keep), 3));
  return toPrim(out);
});
/** Octahedron of radius 1 (8 triangles): a cheap flower head or pebble. */
export const OCTA = () => cached('octa', () => toPrim(new OctahedronGeometry(1, 0)));
/** Box without its bottom face (things that stand on the ground). */
export const BOX_NB = () => cached('box-nb', () => {
  const g = new BoxGeometry(1, 1, 1).toNonIndexed();
  const p = g.getAttribute('position');
  const keep: number[] = [];
  for (let i = 0; i < p.count; i++) if (Math.floor(i / 6) !== 3) keep.push(p.getX(i), p.getY(i), p.getZ(i));
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(keep), 3));
  return toPrim(out);
});
/** Rectangular picture frame in the unit box (z 0..1, open back): a hole of relative size hx by hy. */
export const FRAME = (hx: number, hy: number) => cached(`frame:${hx.toFixed(2)}:${hy.toFixed(2)}`, () => {
  const O: V3[] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const I: V3[] = O.map(([x, y]) => [x * hx, y * hy]);
  const faces: number[][][] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push([[O[i][0], O[i][1], 1], [O[j][0], O[j][1], 1], [I[j][0], I[j][1], 1], [I[i][0], I[i][1], 1]]);
    // outer wall (faces away from the center) and inner wall (faces the opening)
    faces.push([[O[j][0], O[j][1], 0], [O[i][0], O[i][1], 0], [O[i][0], O[i][1], 1], [O[j][0], O[j][1], 1]]);
    faces.push([[I[i][0], I[i][1], 0], [I[j][0], I[j][1], 0], [I[j][0], I[j][1], 1], [I[i][0], I[i][1], 1]]);
  }
  return polyPrim(faces);
});
type V3 = [number, number];
/** Cone of height 1 from y=0, base radius 1. */
export const CONE = (segments: number, base = false) => cached(`cone:${segments}:${base}`, () => {
  const g = new ConeGeometry(1, 1, segments, 1).translate(0, 0.5, 0).toNonIndexed();
  const position = g.getAttribute('position');
  const keep: number[] = [];
  for (const group of g.groups) {
    if (group.materialIndex === 0 || base) for (let i = group.start; i < group.start + group.count; i++) keep.push(position.getX(i), position.getY(i), position.getZ(i));
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(keep), 3));
  return toPrim(out);
});
/** Unit-radius low-poly ball. */
export const BALL = (detail = 1) => cached(`ball:${detail}`, () => toPrim(new IcosahedronGeometry(1, detail)));
/** Gable roof prism, base 1x1 on y=0, ridge height 1 along Z. */
export const GABLE = () => cached('gable', () => {
  const a = 0.5, b = 0.5;
  const A = [-a, 0, -b], B = [a, 0, -b], C = [a, 0, b], D = [-a, 0, b], R1 = [0, 1, -b], R2 = [0, 1, b];
  return polyPrim([[D, C, R2], [B, A, R1], [C, B, R1, R2], [A, D, R2, R1], [A, B, C, D]]);
});
/** Hip roof: base 1x1, ridge shortened by `inset` on both ends, height 1. */
export const HIP = (inset: number) => cached(`hip:${inset.toFixed(3)}`, () => {
  const a = 0.5, b = 0.5, r = Math.max(0, b - inset);
  const A = [-a, 0, -b], B = [a, 0, -b], C = [a, 0, b], D = [-a, 0, b], R1 = [0, 1, -r], R2 = [0, 1, r];
  return polyPrim([[D, C, R2], [B, A, R1], [C, B, R1, R2], [A, D, R2, R1], [A, B, C, D]]);
});
/** Ramp / wedge, base 1x1 on y=0 rising to y=1 at +Z. */
export const WEDGE = () => cached('wedge', () => {
  const a = 0.5, b = 0.5;
  const A = [-a, 0, -b], B = [a, 0, -b], C = [a, 0, b], D = [-a, 0, b], E = [-a, 1, b], F = [a, 1, b];
  return polyPrim([[A, E, F, B], [D, C, F, E], [B, F, C], [A, D, E], [A, B, C, D]]);
});

/** A single vertical triangle blade (double sided material): 1 wide at y=0, apex at y=1. */
export const BLADE = () => cached('blade', () => polyPrim([[[-0.5, 0, 0], [0.5, 0, 0], [0, 1, 0]]]));

/** Extrusion of a 2D outline along +Z from 0 to 1. */
export function shapePrim(key: string, make: () => Shape, curveSegments = 5): Prim {
  return cached(`shape:${key}`, () => toPrim(new ExtrudeGeometry(make(), { depth: 1, bevelEnabled: false, curveSegments })));
}

export interface PartOptions {
  rot?: [number, number, number];
  scale?: [number, number, number];
  /** Glow channel written to the `aGlow` attribute of glow collectors. */
  glow?: number;
  /** Foliage wind amount: 0 rigid; otherwise sway grows with local height / swayHeight. */
  sway?: number;
  swayHeight?: number;
  jitter?: number;
}

export type Kind = 'plain' | 'sway' | 'glow';

const tmpMatrix = new Matrix4();
const tmpNormalMatrix = new Matrix3();
const tmpQuat = new Quaternion();
const tmpVec = new Vector3();
const tmpScale = new Vector3();
const tmpPos = new Vector3();
const tmpEuler = new Euler();

/** Growable vertex store. `kind` decides the extra per-vertex attribute. */
export class Collector {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private extra: number[] = [];
  triangles = 0;
  constructor(readonly kind: Kind, private readonly random: () => number) {}

  get empty(): boolean { return this.positions.length === 0; }

  /** `rel` maps the primitive into the root frame, `root` maps the frame to the world. */
  add(prim: Prim, rel: Matrix4, root: Matrix4, color: ColorLike, options: PartOptions = {}): void {
    const world = tmpMatrix.multiplyMatrices(root, rel);
    tmpNormalMatrix.getNormalMatrix(world);
    const c = toColor(color);
    const jitter = options.jitter ?? 0.025;
    const v = 1 + (this.random() - 0.5) * 2 * jitter;
    const r = c.r * v, g = c.g * v, b = c.b * v;
    const swayHeight = options.swayHeight ?? 1;
    const swayAmount = options.sway ?? 0;
    const n = prim.count;
    const e = rel.elements;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      tmpVec.set(prim.pos[o], prim.pos[o + 1], prim.pos[o + 2]);
      if (this.kind === 'sway') {
        const y = e[1] * tmpVec.x + e[5] * tmpVec.y + e[9] * tmpVec.z + e[13];
        this.extra.push(swayAmount === 0 ? 0 : swayAmount * Math.pow(Math.min(1, Math.max(0, y / swayHeight)), 1.2));
      } else if (this.kind === 'glow') this.extra.push(options.glow ?? 0);
      tmpVec.applyMatrix4(world);
      this.positions.push(tmpVec.x, tmpVec.y, tmpVec.z);
      tmpVec.set(prim.nor[o], prim.nor[o + 1], prim.nor[o + 2]).applyMatrix3(tmpNormalMatrix).normalize();
      this.normals.push(tmpVec.x, tmpVec.y, tmpVec.z);
      this.colors.push(r, g, b);
    }
    this.triangles += n / 3;
  }

  /** World-space triangles (flat normals computed from winding), one color. */
  addSoup(points: number[], color: ColorLike, glow = 0): void {
    const c = toColor(color);
    const v = 1 + (this.random() - 0.5) * 0.04;
    const a = new Vector3(), b = new Vector3(), d = new Vector3();
    for (let i = 0; i + 8 < points.length + 0; i += 9) {
      a.set(points[i], points[i + 1], points[i + 2]); b.set(points[i + 3], points[i + 4], points[i + 5]); d.set(points[i + 6], points[i + 7], points[i + 8]);
      const n = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
      for (let k = 0; k < 3; k++) {
        this.positions.push(points[i + k * 3], points[i + k * 3 + 1], points[i + k * 3 + 2]);
        this.normals.push(n.x, n.y, n.z);
        this.colors.push(c.r * v, c.g * v, c.b * v);
        if (this.kind !== 'plain') this.extra.push(this.kind === 'glow' ? glow : 0);
      }
    }
    this.triangles += points.length / 9;
  }

  build(): BufferGeometry | null {
    if (!this.positions.length) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    if (this.kind === 'sway') geometry.setAttribute('aSway', new BufferAttribute(new Float32Array(this.extra), 1));
    if (this.kind === 'glow') geometry.setAttribute('aGlow', new BufferAttribute(new Float32Array(this.extra), 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

/** Position-only triangle soup of invisible collision shapes. */
export class ColliderStore {
  positions: number[] = [];
  add(prim: Prim, rel: Matrix4, root: Matrix4): void {
    const world = tmpMatrix.multiplyMatrices(root, rel);
    for (let i = 0; i < prim.count; i++) {
      const o = i * 3;
      tmpVec.set(prim.pos[o], prim.pos[o + 1], prim.pos[o + 2]).applyMatrix4(world);
      this.positions.push(tmpVec.x, tmpVec.y, tmpVec.z);
    }
  }
  /** Raw triangles already in world space. */
  addWorldTriangles(points: ArrayLike<number>): void { for (let i = 0; i < points.length; i++) this.positions.push(points[i]); }
  build(): BufferGeometry | null {
    if (!this.positions.length) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

/** Local transform from translation, Euler (YXZ) rotation and scale. */
export function matrix(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, out = new Matrix4()): Matrix4 {
  tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz, 'YXZ'));
  return out.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(sx, sy, sz));
}

/** Anything that can receive primitives. */
export interface Sink {
  part(prim: Prim, rel: Matrix4, root: Matrix4, color: ColorLike, options?: PartOptions): void;
}
export class CollectorSink implements Sink {
  constructor(readonly collector: Collector) {}
  part(prim: Prim, rel: Matrix4, root: Matrix4, color: ColorLike, options?: PartOptions): void {
    this.collector.add(prim, rel, root, color, options);
  }
}
export class ColliderSink implements Sink {
  constructor(readonly store: ColliderStore) {}
  part(prim: Prim, rel: Matrix4, root: Matrix4): void { this.store.add(prim, rel, root); }
}

const relScratch = new Matrix4();

/** A drawing surface bound to a frame. `root` maps the frame to the world; `base`
 * is the accumulated transform of nested `at()` frames. Every coordinate passed
 * to the methods is in the layer frame: +Y up, +Z front, +X to the viewer's right
 * when looking at the front. */
export class Layer {
  constructor(readonly sink: Sink, readonly root: Matrix4, readonly base: Matrix4 | null = null) {}
  private put(prim: Prim, m: Matrix4, color: ColorLike, o?: PartOptions): void {
    this.sink.part(prim, this.base ? relScratch.multiplyMatrices(this.base, m) : m, this.root, color, o);
  }

  /** Axis-aligned box by center and size. */
  box(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: ColorLike = '#fff', o?: PartOptions): this {
    const r = o?.rot;
    // boxes resting on the ground plane never show their bottom face
    const grounded = !r && y - sy / 2 <= 0.03 && y - sy / 2 >= -0.9 && this.sink instanceof CollectorSink && this.base === null;
    this.put(grounded ? BOX_NB() : BOX(), matrix(x, y, z, r?.[0], r?.[1], r?.[2], sx, sy, sz), color, o);
    return this;
  }
  /** Open picture frame (hole relative size hx,hy) of outer size w x h and depth t, front toward +Z. */
  frame(w: number, h: number, t: number, thickness: number, x: number, y: number, z: number, color: ColorLike = '#fff', o?: PartOptions): this {
    this.put(FRAME(Math.max(0.05, (w - 2 * thickness) / w), Math.max(0.05, (h - 2 * thickness) / h)), matrix(x, y, z, 0, 0, 0, w, h, t), color, o);
    return this;
  }
  /** Octahedron (8 triangles) of radius r, scaled per axis. */
  octa(r: number, x: number, y: number, z: number, color: ColorLike = '#fff', o: PartOptions = {}): this {
    const s = o.scale ?? [1, 1, 1];
    const rot = o.rot;
    this.put(OCTA(), matrix(x, y, z, rot?.[0], rot?.[1], rot?.[2], r * s[0], r * s[1], r * s[2]), color, o);
    return this;
  }
  /** Box by min/max corners. */
  block(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: ColorLike = '#fff', o?: PartOptions): this {
    return this.box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color, o);
  }
  /** Vertical cylinder standing on y with bottom radius r, top radius rTop. */
  cyl(r: number, h: number, x: number, y: number, z: number, color: ColorLike = '#fff', o: PartOptions & { seg?: number; rTop?: number; caps?: Caps } = {}): this {
    const ratio = o.rTop === undefined ? 1 : o.rTop / r;
    const rot = o.rot;
    this.put(CYL(o.seg ?? 8, ratio, o.caps ?? 'top'), matrix(x, y, z, rot?.[0], rot?.[1], rot?.[2], r, h, r), color, o);
    return this;
  }
  /** Cylinder lying along local X, centered at (x,y,z). */
  barrelX(r: number, len: number, x: number, y: number, z: number, color: ColorLike = '#fff', o: PartOptions & { seg?: number } = {}): this {
    this.put(CYL(o.seg ?? 8, 1, 'both'), matrix(x - len / 2, y, z, 0, 0, -Math.PI / 2, r, len, r), color, o);
    return this;
  }
  /** Cylinder lying along local Z, centered at (x,y,z). */
  barrelZ(r: number, len: number, x: number, y: number, z: number, color: ColorLike = '#fff', o: PartOptions & { seg?: number } = {}): this {
    this.put(CYL(o.seg ?? 8, 1, 'both'), matrix(x, y, z - len / 2, Math.PI / 2, 0, 0, r, len, r), color, o);
    return this;
  }
  cone(r: number, h: number, x: number, y: number, z: number, color: ColorLike = '#fff', o: PartOptions & { seg?: number } = {}): this {
    const rot = o.rot;
    this.put(CONE(o.seg ?? 8), matrix(x, y, z, rot?.[0], rot?.[1], rot?.[2], r, h, r), color, o);
    return this;
  }
  /** Low-poly ball / ellipsoid centered at (x,y,z). */
  ball(r: number, x: number, y: number, z: number, color: ColorLike = '#fff', o: PartOptions & { detail?: number } = {}): this {
    const s = o.scale ?? [1, 1, 1];
    const rot = o.rot;
    this.put(BALL(o.detail ?? 1), matrix(x, y, z, rot?.[0], rot?.[1], rot?.[2], r * s[0], r * s[1], r * s[2]), color, o);
    return this;
  }
  /** Gable roof: footprint w (x) by d (z), ridge along z, rising h from y. */
  gable(w: number, h: number, d: number, x: number, y: number, z: number, color: ColorLike = '#fff', o?: PartOptions): this {
    const r = o?.rot;
    this.put(GABLE(), matrix(x, y, z, r?.[0], r?.[1], r?.[2], w, h, d), color, o);
    return this;
  }
  hip(w: number, h: number, d: number, inset: number, x: number, y: number, z: number, color: ColorLike = '#fff', o?: PartOptions): this {
    const r = o?.rot;
    this.put(HIP(inset), matrix(x, y, z, r?.[0], r?.[1], r?.[2], w, h, d), color, o);
    return this;
  }
  /** One grass blade (a single triangle), width w, height h, base at (x,y,z). */
  blade(w: number, h: number, x: number, y: number, z: number, color: ColorLike = '#fff', o: PartOptions = {}): this {
    const r = o.rot;
    this.put(BLADE(), matrix(x, y, z, r?.[0], r?.[1], r?.[2], w, h, 1), color, o);
    return this;
  }
  /** Ramp rising toward +Z. */
  wedge(w: number, h: number, d: number, x: number, y: number, z: number, color: ColorLike = '#fff', o?: PartOptions): this {
    const r = o?.rot;
    this.put(WEDGE(), matrix(x, y, z, r?.[0], r?.[1], r?.[2], w, h, d), color, o);
    return this;
  }
  /** Extruded 2D shape (local XY plane) scaled to w x h with thickness t along +Z from z. */
  shape(prim: Prim, w: number, h: number, t: number, x: number, y: number, z: number, color: ColorLike = '#fff', o?: PartOptions): this {
    const r = o?.rot;
    this.put(prim, matrix(x, y, z, r?.[0], r?.[1], r?.[2], w, h, t), color, o);
    return this;
  }
  /** Thin straight bar between two points. */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: ColorLike = '#fff', o: PartOptions & { seg?: number } = {}): this {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return this;
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(dx / length, dy / length, dz / length));
    this.put(CYL(o.seg ?? 4, 1, r < 0.04 ? 'none' : 'both'), new Matrix4().compose(new Vector3(ax, ay, az), q, new Vector3(r, length, r)), color, o);
    return this;
  }
  /** Tapered bar between two points (radius r0 at a, r1 at b). */
  taper(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, color: ColorLike = '#fff', o: PartOptions & { seg?: number } = {}): this {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return this;
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(dx / length, dy / length, dz / length));
    this.put(CYL(o.seg ?? 6, Math.max(0.05, r1 / r0), 'top'), new Matrix4().compose(new Vector3(ax, ay, az), q, new Vector3(r0, length, r0)), color, o);
    return this;
  }
  /** A sagging cable between two points. */
  cable(ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, r: number, color: ColorLike = '#2a2c3a', segments = 8): this {
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = ay + (by - ay) * t - sag * 4 * t * (1 - t);
      this.rod(px, py, pz, x, y, z, r, color, { seg: 3, jitter: 0 });
      px = x; py = y; pz = z;
    }
    return this;
  }
  /** Child layer in a nested frame (translate + yaw/pitch/roll). */
  at(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): Layer {
    const m = matrix(x, y, z, pitch, yaw, roll);
    return new Layer(this.sink, this.root, this.base ? new Matrix4().multiplyMatrices(this.base, m) : m);
  }
  withMatrix(m: Matrix4): Layer {
    return new Layer(this.sink, this.root, this.base ? new Matrix4().multiplyMatrices(this.base, m) : m.clone());
  }
}

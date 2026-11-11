import { BoxGeometry, Color, ExtrudeGeometry, Shape, TorusGeometry, type BufferGeometry } from 'three';
import type { Raw } from './skin';

/** Raw geometry generators (bone-local, no files). Everything is a body of
 * revolution (`lathe`), a Three primitive converted to `Raw`, or a small
 * extrusion. Normals are analytic so rounded parts shade smoothly. */

export interface ProfilePoint { r: number; y: number; color?: string | number | Color }

const scratch = new Color();

/** Lathe a profile (ordered top -> bottom, r >= 0) around +Y. `sx`/`sz`
 * stretch the cross-section into an ellipse (normals stay correct). Two equal
 * consecutive points make a hard edge; optional per-point colors make crisp
 * bands (use duplicated points where the color changes). 0 deg faces +Z. */
export function lathe(profile: readonly ProfilePoint[], seg = 14, sx = 1, sz = 1, arc?: readonly [number, number]): Raw {
  const rings = profile.length;
  const partial = !!arc && arc[1] < Math.PI * 2 - 1e-6;
  const perRing = partial ? seg + 1 : seg;
  const p: number[] = [], n: number[] = [], i: number[] = [], c: number[] = [];
  const same = (a: ProfilePoint, b: ProfilePoint) => Math.abs(a.r - b.r) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  const segmentNormal = (a: ProfilePoint, b: ProfilePoint): [number, number] => {
    const dr = b.r - a.r, dy = b.y - a.y;
    const length = Math.hypot(dr, dy) || 1;
    return [-dy / length, dr / length];
  };
  const hasColor = profile.some(point => point.color !== undefined);
  for (let ring = 0; ring < rings; ring++) {
    const point = profile[ring];
    let nr = 0, ny = 0;
    const previous = ring > 0 ? profile[ring - 1] : undefined;
    const next = ring < rings - 1 ? profile[ring + 1] : undefined;
    if (point.r < 1e-6) {
      ny = ring === 0 ? 1 : -1;
    } else if (previous && same(previous, point) && next) {
      [nr, ny] = segmentNormal(point, next);
    } else if (next && same(next, point) && previous) {
      [nr, ny] = segmentNormal(previous, point);
    } else {
      const a = previous ? segmentNormal(previous, point) : segmentNormal(point, next!);
      const b = next ? segmentNormal(point, next) : a;
      nr = a[0] + b[0]; ny = a[1] + b[1];
      const length = Math.hypot(nr, ny) || 1;
      nr /= length; ny /= length;
    }
    if (hasColor) scratch.set((point.color ?? '#ffffff') as Color);
    for (let k = 0; k < perRing; k++) {
      const theta = arc ? arc[0] + (k / seg) * arc[1] : (k / seg) * Math.PI * 2;
      const s = Math.sin(theta), co = Math.cos(theta);
      p.push(point.r * s * sx, point.y, point.r * co * sz);
      const nx = nr * s / sx, nz = nr * co / sz;
      const length = Math.hypot(nx, ny, nz) || 1;
      n.push(nx / length, ny / length, nz / length);
      if (hasColor) c.push(scratch.r, scratch.g, scratch.b);
    }
  }
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let k = 0; k < seg; k++) {
      const next = partial ? k + 1 : (k + 1) % seg;
      const a = ring * perRing + k, b = ring * perRing + next;
      const cc = (ring + 1) * perRing + k, d = (ring + 1) * perRing + next;
      i.push(a, cc, b, b, cc, d);
    }
  }
  return hasColor ? { p, n, i, c } : { p, n, i };
}

/** Ellipsoid centered at the origin. */
export function ellipsoid(rx: number, ry: number, rz: number, seg = 14, rings = 10): Raw {
  const profile: ProfilePoint[] = [];
  for (let k = 0; k <= rings; k++) {
    const a = (k / rings) * Math.PI;
    profile.push({ r: Math.sin(a), y: Math.cos(a) * ry });
  }
  return lathe(profile.map(point => ({ r: point.r, y: point.y })), seg, rx, rz);
}

/** Vertical tapered capsule: top joint center at y=0, bottom joint center at y=-length. */
export function limb(r0: number, r1: number, length: number, seg = 10, cap = 2): Raw {
  const profile: ProfilePoint[] = [];
  for (let k = 0; k <= cap; k++) {
    const a = (k / cap) * Math.PI / 2;
    profile.push({ r: Math.sin(a) * r0, y: Math.cos(a) * r0 });
  }
  for (let k = 0; k <= cap; k++) {
    const a = (k / cap) * Math.PI / 2;
    profile.push({ r: Math.cos(a) * r1, y: -length - Math.sin(a) * r1 });
  }
  return lathe(dedupe(profile), seg);
}

function dedupe(profile: ProfilePoint[]): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (const point of profile) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.r - point.r) < 1e-6 && Math.abs(last.y - point.y) < 1e-6) continue;
    out.push(point);
  }
  return out;
}

/** A short open tube (cuffs, bands): radius r, height h, no caps. */
export function band(r: number, h: number, seg = 10): Raw {
  return lathe([{ r, y: h / 2 }, { r, y: -h / 2 }], seg);
}

/** Cylinder/cone frustum along Y centered at the origin with flat caps. */
export function cylinder(rTop: number, rBottom: number, height: number, seg = 12, caps = true): Raw {
  const h = height / 2;
  const profile: ProfilePoint[] = [];
  if (caps) profile.push({ r: 0, y: h }, { r: rTop, y: h }, { r: rTop, y: h });
  else profile.push({ r: rTop, y: h });
  if (caps) profile.push({ r: rBottom, y: -h }, { r: rBottom, y: -h }, { r: 0, y: -h });
  else profile.push({ r: rBottom, y: -h });
  return lathe(profile, seg);
}

/** Cone with apex up. */
export function cone(radius: number, height: number, seg = 12): Raw {
  return lathe([{ r: 0, y: height / 2 }, { r: radius, y: -height / 2 }, { r: radius, y: -height / 2 }, { r: 0, y: -height / 2 }], seg);
}

/** Dome: a hemisphere (rx, ry, rz) with an open flat bottom closed by a disc. */
export function dome(rx: number, ry: number, rz: number, seg = 14, rings = 6): Raw {
  const profile: ProfilePoint[] = [];
  for (let k = 0; k <= rings; k++) {
    const a = (k / rings) * Math.PI / 2;
    profile.push({ r: Math.sin(a), y: Math.cos(a) * ry });
  }
  profile.push({ r: 1, y: 0 }, { r: 0, y: 0 });
  return lathe(profile, seg, rx, rz);
}

function fromGeometry(geometry: BufferGeometry): Raw {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const p = Array.from(position.array as ArrayLike<number>);
  const n = Array.from(normal.array as ArrayLike<number>);
  let i: number[];
  if (geometry.index) i = Array.from(geometry.index.array as ArrayLike<number>);
  else i = Array.from({ length: position.count }, (_, k) => k);
  geometry.dispose();
  return { p, n, i };
}

export function box(w: number, h: number, d: number): Raw {
  return fromGeometry(new BoxGeometry(w, h, d));
}

/** Ring in the XY plane facing +Z. */
export function torus(radius: number, tube: number, seg = 14, tubeSeg = 6, arc = Math.PI * 2): Raw {
  return fromGeometry(new TorusGeometry(radius, tube, tubeSeg, seg, arc));
}

/** Flat extruded outline (XY plane, thickness along Z, centered). */
export function extrude(points: readonly [number, number][], depth: number, bevel = 0): Raw {
  const shape = new Shape();
  points.forEach(([x, y], k) => (k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
  geometry.translate(0, 0, -depth / 2);
  return fromGeometry(geometry);
}

/** Half disc facing +Z (flat side up) used for smiles; radius 1, centered on the flat edge. */
export function halfDisc(seg = 10): Raw {
  const p: number[] = [0, 0, 0], n: number[] = [0, 0, 1], i: number[] = [];
  for (let k = 0; k <= seg; k++) {
    const a = Math.PI + (k / seg) * Math.PI;
    p.push(Math.cos(a), Math.sin(a), 0);
    n.push(0, 0, 1);
  }
  for (let k = 0; k < seg; k++) i.push(0, k + 1, k + 2);
  return { p, n, i };
}

/** Flat disc facing +Z. */
export function disc(radius = 1, seg = 12): Raw {
  const p: number[] = [0, 0, 0], n: number[] = [0, 0, 1], i: number[] = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    p.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    n.push(0, 0, 1);
  }
  for (let k = 0; k < seg; k++) i.push(0, 1 + k, 1 + (k + 1) % seg);
  return { p, n, i };
}

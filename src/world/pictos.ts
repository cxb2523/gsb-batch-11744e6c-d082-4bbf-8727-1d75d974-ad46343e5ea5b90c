import { Path, Shape } from 'three';
import { shapePrim, type ColorLike, type Layer } from './kit';
import { C } from './palette';

/** Painted shop-sign pictograms: simple extruded 2D shapes in the unit square
 * (centered, roughly -0.5..0.5). No text anywhere in the world. */

export type PictoKind = 'fish' | 'bowl' | 'cog' | 'flower' | 'anchor' | 'lantern' | 'loaf' | 'teapot' | 'spool' | 'drop' | 'bolt' | 'pear';

type Make = () => Shape;
interface PictoPart { key: string; make: Make; color: 'a' | 'b' | 'ink'; segments?: number }

function circle(cx: number, cy: number, r: number): Shape {
  const s = new Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}
function ellipse(cx: number, cy: number, rx: number, ry: number): Shape {
  const s = new Shape();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}
function poly(points: [number, number][]): Shape {
  const s = new Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}
function rect(x0: number, y0: number, x1: number, y1: number): Shape { return poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); }
function ring(cx: number, cy: number, r: number, hole: number): Shape {
  const s = circle(cx, cy, r);
  const h = new Path();
  h.absarc(cx, cy, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}
function gear(): Shape {
  const points: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    for (const [da, r] of [[-0.2, 0.33], [-0.13, 0.47], [0.13, 0.47], [0.2, 0.33]] as [number, number][]) {
      points.push([Math.cos(a + da) * r, Math.sin(a + da) * r]);
    }
  }
  const s = poly(points);
  const h = new Path();
  h.absarc(0, 0, 0.14, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}
function arcBand(r0: number, r1: number, a0: number, a1: number, steps = 8): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; pts.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
  for (let i = steps; i >= 0; i--) { const a = a0 + (a1 - a0) * i / steps; pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
  return poly(pts);
}

const PICTOS: Record<PictoKind, PictoPart[]> = {
  fish: [
    { key: 'fish-body', make: () => ellipse(-0.06, 0, 0.36, 0.21), color: 'a', segments: 10 },
    { key: 'fish-tail', make: () => poly([[0.22, 0], [0.5, 0.24], [0.5, -0.24]]), color: 'a' },
    { key: 'fish-fin', make: () => poly([[-0.16, 0.17], [0.02, 0.36], [0.1, 0.16]]), color: 'b' },
    { key: 'fish-eye', make: () => circle(-0.24, 0.04, 0.045), color: 'ink', segments: 6 },
  ],
  bowl: [
    { key: 'bowl-noodle', make: () => { const s = new Shape(); s.absarc(0, 0.06, 0.3, 0, Math.PI, false); s.closePath(); return s; }, color: 'b', segments: 8 },
    { key: 'bowl-body', make: () => { const s = new Shape(); s.moveTo(-0.42, 0.05); s.absarc(0, 0.05, 0.42, Math.PI, Math.PI * 2, false); s.closePath(); return s; }, color: 'a', segments: 9 },
    { key: 'bowl-stick1', make: () => poly([[0.05, 0.2], [0.1, 0.2], [0.34, 0.5], [0.29, 0.5]]), color: 'ink' },
    { key: 'bowl-stick2', make: () => poly([[0.14, 0.2], [0.19, 0.2], [0.42, 0.46], [0.37, 0.46]]), color: 'ink' },
  ],
  cog: [
    { key: 'cog', make: gear, color: 'a' },
    { key: 'cog-dot', make: () => circle(0, 0, 0.06), color: 'ink', segments: 6 },
  ],
  flower: [
    ...[0, 1, 2, 3, 4].map(i => ({
      key: `flower-petal${i}`, make: () => circle(Math.cos(i / 5 * Math.PI * 2 + 1.57) * 0.24, Math.sin(i / 5 * Math.PI * 2 + 1.57) * 0.24, 0.17), color: 'a' as const, segments: 8,
    })),
    { key: 'flower-core', make: () => circle(0, 0, 0.13), color: 'b', segments: 8 },
  ],
  anchor: [
    { key: 'anchor-ring', make: () => ring(0, 0.38, 0.1, 0.045), color: 'a', segments: 8 },
    { key: 'anchor-shaft', make: () => rect(-0.04, -0.34, 0.04, 0.3), color: 'a' },
    { key: 'anchor-stock', make: () => rect(-0.18, 0.2, 0.18, 0.26), color: 'a' },
    { key: 'anchor-arms', make: () => arcBand(0.3, 0.38, Math.PI * 1.12, Math.PI * 1.88, 8), color: 'a' },
    { key: 'anchor-tips', make: () => poly([[-0.42, -0.04], [-0.3, -0.22], [-0.22, -0.02]]), color: 'b' },
    { key: 'anchor-tips2', make: () => poly([[0.42, -0.04], [0.22, -0.02], [0.3, -0.22]]), color: 'b' },
  ],
  lantern: [
    { key: 'lantern-body', make: () => ellipse(0, -0.02, 0.24, 0.3), color: 'a', segments: 9 },
    { key: 'lantern-cap', make: () => rect(-0.12, 0.26, 0.12, 0.36), color: 'ink' },
    { key: 'lantern-base', make: () => rect(-0.1, -0.36, 0.1, -0.28), color: 'ink' },
    { key: 'lantern-band', make: () => rect(-0.22, -0.04, 0.22, 0.02), color: 'b' },
  ],
  loaf: [
    { key: 'loaf-body', make: () => ellipse(0, 0, 0.44, 0.22), color: 'a', segments: 10 },
    { key: 'loaf-cut1', make: () => poly([[-0.2, 0.12], [-0.14, 0.12], [-0.08, -0.1], [-0.14, -0.1]]), color: 'b' },
    { key: 'loaf-cut2', make: () => poly([[0.02, 0.15], [0.08, 0.15], [0.14, -0.1], [0.08, -0.1]]), color: 'b' },
    { key: 'loaf-cut3', make: () => poly([[0.22, 0.12], [0.28, 0.12], [0.3, -0.08], [0.24, -0.08]]), color: 'b' },
  ],
  teapot: [
    { key: 'pot-body', make: () => circle(0, -0.04, 0.28), color: 'a', segments: 10 },
    { key: 'pot-lid', make: () => circle(0, 0.28, 0.09), color: 'b', segments: 8 },
    { key: 'pot-spout', make: () => poly([[0.22, 0], [0.48, 0.2], [0.42, 0.26], [0.2, 0.12]]), color: 'a' },
    { key: 'pot-handle', make: () => ring(-0.34, 0, 0.14, 0.07), color: 'b', segments: 8 },
  ],
  spool: [
    { key: 'spool-core', make: () => rect(-0.2, -0.26, 0.2, 0.26), color: 'b' },
    { key: 'spool-top', make: () => rect(-0.32, 0.26, 0.32, 0.36), color: 'a' },
    { key: 'spool-bot', make: () => rect(-0.32, -0.36, 0.32, -0.26), color: 'a' },
    { key: 'spool-line', make: () => poly([[-0.2, 0.1], [0.2, 0.18], [0.2, 0.12], [-0.2, 0.04]]), color: 'ink' },
    { key: 'spool-line2', make: () => poly([[-0.2, -0.1], [0.2, -0.02], [0.2, -0.08], [-0.2, -0.16]]), color: 'ink' },
  ],
  drop: [
    { key: 'drop-body', make: () => { const s = new Shape(); s.moveTo(0, 0.46); s.lineTo(0.27, 0.0); s.absarc(0, -0.12, 0.3, 0.3, Math.PI - 0.3, true); s.lineTo(-0.27, 0.0); s.closePath(); return s; }, color: 'a', segments: 10 },
    { key: 'drop-shine', make: () => circle(-0.1, -0.12, 0.06), color: 'b', segments: 6 },
  ],
  bolt: [
    { key: 'bolt', make: () => poly([[0.06, 0.48], [-0.28, -0.04], [-0.04, -0.04], [-0.1, -0.48], [0.3, 0.08], [0.05, 0.08]]), color: 'a' },
  ],
  pear: [
    { key: 'pear-body', make: () => ellipse(0, -0.12, 0.28, 0.28), color: 'a', segments: 10 },
    { key: 'pear-top', make: () => ellipse(0, 0.16, 0.17, 0.2), color: 'a', segments: 8 },
    { key: 'pear-stem', make: () => rect(-0.02, 0.32, 0.03, 0.46), color: 'ink' },
    { key: 'pear-leaf', make: () => ellipse(0.12, 0.38, 0.1, 0.05), color: 'b', segments: 6 },
  ],
};

/** Draw a pictogram on the XY plane of `layer`, facing +Z, centered at (x,y). */
export function picto(layer: Layer, kind: PictoKind, x: number, y: number, z: number, size: number, a: ColorLike, b: ColorLike = C.white, thickness = 0.02, rotZ = 0): Layer {
  let step = 0;
  for (const part of PICTOS[kind]) {
    const color = part.color === 'a' ? a : part.color === 'b' ? b : C.ink;
    layer.shape(shapePrim(part.key, part.make, part.segments ?? 5), size, size, thickness, x, y, z + step * 0.004, color, { jitter: 0, rot: [0, 0, rotZ] });
    step++;
  }
  return layer;
}

import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../chapter/data';
import type { Builder } from './context';
import type { ColorLike } from './kit';
import { mix, shade, toColor } from './kit';
import { northAt } from './frame';
import { subDir, walk, groundAt } from './layout';
import { C } from './palette';
import type { Frame } from './frame';

/** Ground decoration: path ribbons, paved quads, patches, plus the registry of
 * keep-clear zones so scatter (trees, grass, rocks) avoids buildings and roads. */

export interface Exclusion { dir: Vector3; radius: number }
export interface PathLine { points: Vector3[]; width: number }

export class Ground {
  readonly exclusions: Exclusion[] = [];
  readonly lines: PathLine[] = [];
  constructor(private readonly builder: Builder) {}

  clear(center: Vector3, radius: number): void { this.exclusions.push({ dir: center.clone().normalize(), radius }); }

  /** Distance (world units) from a direction to the nearest road centerline. */
  pathDistance(n: Vector3): number {
    let best = Infinity;
    for (const line of this.lines) {
      for (let i = 0; i + 1 < line.points.length; i++) best = Math.min(best, segmentDistance(n, line.points[i], line.points[i + 1]) - line.width / 2);
    }
    return best;
  }

  isClear(n: Vector3, margin = 0): boolean {
    // Always keep sockets, residents and the spawn point free of scatter.
    const keep = [...Object.values(this.builder.sockets), ...Object.values(this.builder.npcs), ...(this.builder.spawn ? [this.builder.spawn] : [])];
    for (const anchor of keep) if (anchor && Math.acos(Math.min(1, Math.max(-1, n.dot(anchor.normal)))) * PLANET_RADIUS < 1.7 + margin * 0.5) return false;
    for (const e of this.exclusions) if (Math.acos(Math.min(1, Math.max(-1, n.dot(e.dir)))) * PLANET_RADIUS < e.radius + margin) return false;
    return this.pathDistance(n) > margin;
  }

  /** Ribbon along a polyline of unit directions. */
  ribbon(line: Vector3[], width: number, color: ColorLike | ((i: number, j: number) => ColorLike), o: { lift?: number; strips?: number; register?: boolean; glow?: number } = {}): void {
    const lift = o.lift ?? 0.03;
    const strips = o.strips ?? Math.max(1, Math.round(width / 0.3));
    if (o.register !== false) this.lines.push({ points: line, width });
    const pick = typeof color === 'function' ? color : () => color;
    const sides: Vector3[] = line.map((p, i) => {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      const t = b.clone().sub(a).projectOnPlane(p).normalize();
      return new Vector3().crossVectors(p, t).normalize();
    });
    const corner = (i: number, j: number): number[] => {
      const offset = (j / strips - 0.5) * width;
      const n = walk(line[i], sides[i], offset);
      const g = groundAt(n, lift);
      return [g.x, g.y, g.z];
    };
    for (let i = 0; i + 1 < line.length; i++) {
      const mid = line[i].clone().add(line[i + 1]).normalize();
      const collector = this.builder.zoneOf(mid).solid;
      for (let j = 0; j < strips; j++) {
        const a = corner(i, j), b = corner(i, j + 1), c = corner(i + 1, j + 1), d = corner(i + 1, j);
        // `side` points left of travel, so j increasing walks toward the right
        collector.addSoup([...a, ...c, ...b, ...a, ...d, ...c], pick(i, j));
      }
    }
  }

  /** Flat patch following the ground: ellipse around a direction. */
  disc(center: Vector3, rx: number, rz: number, color: ColorLike, o: { lift?: number; yaw?: number; segments?: number; frame?: Frame; ring?: ColorLike } = {}): void {
    const lift = o.lift ?? 0.03, n = o.segments ?? 14;
    const up = center.clone().normalize();
    const north = northAt(up);
    const east = new Vector3().crossVectors(north, up).normalize();
    const yaw = o.yaw ?? 0;
    const ring: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const x = Math.cos(a) * rx, z = Math.sin(a) * rz;
      const dx = x * Math.cos(yaw) - z * Math.sin(yaw), dz = x * Math.sin(yaw) + z * Math.cos(yaw);
      const t = east.clone().multiplyScalar(dx).addScaledVector(north, dz);
      const len = t.length();
      ring.push(len < 1e-6 ? up.clone() : walk(up, t, len));
    }
    const c = groundAt(up, lift);
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = groundAt(ring[i], lift), q = groundAt(ring[(i + 1) % n], lift);
      pts.push(c.x, c.y, c.z, p.x, p.y, p.z, q.x, q.y, q.z);
    }
    this.builder.zoneOf(up).solid.addSoup(pts, color);
  }

  /** Rectangular paved area in a frame: x in [x0,x1], z in [z0,z1] with per-cell color. */
  paved(frame: Frame, x0: number, x1: number, z0: number, z1: number, colors: ColorLike[], o: { cell?: number; lift?: number; stagger?: boolean; seed?: number } = {}): void {
    const cell = o.cell ?? 0.3, lift = o.lift ?? 0.03;
    const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell));
    const pt = (i: number, j: number, shift = 0): number[] => {
      const x = x0 + (x1 - x0) * Math.min(1, Math.max(0, (i + shift) / nx)), z = z0 + (z1 - z0) * j / nz;
      const g = groundAt(subDir(frame, x, z), lift);
      return [g.x, g.y, g.z];
    };
    const mid = subDir(frame, (x0 + x1) / 2, (z0 + z1) / 2);
    const zone = this.builder.zoneOf(mid).solid;
    let h = (o.seed ?? 1) * 7919;
    for (let j = 0; j < nz; j++) {
      const shift = o.stagger && j % 2 ? 0.5 : 0;
      for (let i = 0; i < nx; i++) {
        h = (h * 1103515245 + 12345) & 0x7fffffff;
        const color = colors[h % colors.length];
        const a = pt(i, j, shift), b = pt(i + 1, j, shift), c = pt(i + 1, j + 1, shift), d = pt(i, j + 1, shift);
        zone.addSoup([...a, ...d, ...c, ...a, ...c, ...b], color);
      }
    }
  }

  /** Disc patches along a line for worn dirt or flower borders. */
  void(): void { /* placeholder to keep the class open for extension */ }
}

/** Surface distance from direction n to the arc a-b (world units). */
export function segmentDistance(n: Vector3, a: Vector3, b: Vector3): number {
  const m = new Vector3().crossVectors(a, b);
  const len = m.length();
  if (len < 1e-9) return Math.acos(Math.min(1, Math.max(-1, n.dot(a)))) * PLANET_RADIUS;
  m.divideScalar(len);
  const p = n.clone().addScaledVector(m, -n.dot(m));
  const pl = p.length();
  if (pl > 1e-9) {
    p.divideScalar(pl);
    if (new Vector3().crossVectors(a, p).dot(m) >= 0 && new Vector3().crossVectors(p, b).dot(m) >= 0) return Math.asin(Math.min(1, Math.abs(n.dot(m)))) * PLANET_RADIUS;
  }
  return Math.min(Math.acos(Math.min(1, Math.max(-1, n.dot(a)))), Math.acos(Math.min(1, Math.max(-1, n.dot(b))))) * PLANET_RADIUS;
}

/** Dirt tones for roads, with gentle variation per segment. */
export function dirtColor(i: number, j: number): ColorLike {
  const k = (i * 7 + j * 13) % 5;
  return mix(C.path, shade(C.path, -0.08), k / 5);
}
export function cobbleColors(): ColorLike[] {
  return [C.cobble, shade(C.cobble, -0.07), shade(C.cobble, 0.05), mix(C.cobble, C.wallBlue, 0.12), shade(C.stone, -0.02)];
}
void toColor;

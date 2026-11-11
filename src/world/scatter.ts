import { Vector3 } from 'three';
import { SEA_RADIUS } from '../chapter/data';
import type { Ctx } from './context';
import { Kit } from './context';
import { walk } from './layout';
import { terrainHeight } from './terrain';
import { northAt } from './frame';

/** Random placement helpers that respect water, roads and keep-clear zones. */

export interface ScatterOptions {
  margin?: number;
  minHeight?: number;
  maxHeight?: number;
  attempts?: number;
  /** extra accept test */
  accept?: (n: Vector3) => boolean;
}

export function randomInDisc(center: Vector3, radius: number, r: () => number): Vector3 {
  const c = center.clone().normalize();
  const north = northAt(c);
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
  const t = north.clone().applyAxisAngle(c, a);
  return walk(c, t, d);
}

export function scatterDisc(ctx: Ctx, center: Vector3, radius: number, count: number, o: ScatterOptions, place: (k: Kit, n: Vector3) => void): number {
  const { b, ground } = ctx;
  const r = b.random;
  let placed = 0;
  const attempts = (o.attempts ?? 12) * count;
  for (let i = 0; i < attempts && placed < count; i++) {
    const n = randomInDisc(center, radius, r);
    const h = terrainHeight(n);
    if (h < (o.minHeight ?? SEA_RADIUS + 0.4) || h > (o.maxHeight ?? 99)) continue;
    if (!ground.isClear(n, o.margin ?? 0.4)) continue;
    if (o.accept && !o.accept(n)) continue;
    place(b.kit(b.placeAt(n, r() * Math.PI * 2)), n);
    placed++;
  }
  return placed;
}

/** Scatter over the whole planet (uniform on the sphere). */
export function scatterPlanet(ctx: Ctx, count: number, o: ScatterOptions, place: (k: Kit, n: Vector3) => void): number {
  const { b, ground } = ctx;
  const r = b.random;
  let placed = 0;
  const attempts = (o.attempts ?? 10) * count;
  for (let i = 0; i < attempts && placed < count; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    const n = new Vector3(s * Math.cos(a), z, s * Math.sin(a));
    const h = terrainHeight(n);
    if (h < (o.minHeight ?? SEA_RADIUS + 0.4) || h > (o.maxHeight ?? 99)) continue;
    if (!ground.isClear(n, o.margin ?? 0.5)) continue;
    if (o.accept && !o.accept(n)) continue;
    place(b.kit(b.placeAt(n, r() * Math.PI * 2)), n);
    placed++;
  }
  return placed;
}

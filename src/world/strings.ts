import { Vector3 } from 'three';
import type { Ctx } from './context';
import { C } from './palette';
import { GLOW } from './materials';
import { addHalo } from './halos';
import type { ColorLike } from './kit';
import { pole } from './props';
import { groundAt } from './layout';
import { frameAtBearing } from './frame';

/** Wires, lantern strings and bunting hung between points in world space. */

function sagged(a: Vector3, b: Vector3, t: number, sag: number): Vector3 {
  const p = a.clone().lerp(b, t);
  const up = p.clone().normalize();
  return p.addScaledVector(up, -sag * 4 * t * (1 - t));
}

export function wire(ctx: Ctx, a: Vector3, b: Vector3, sag = 0.12, r = 0.011, color: ColorLike = C.coal, segments = 8): void {
  const zone = ctx.b.zoneOf(a.clone().add(b).multiplyScalar(0.5));
  const k = ctx.b.worldKit(zone.id);
  for (let i = 0; i < segments; i++) {
    const p = sagged(a, b, i / segments, sag), q = sagged(a, b, (i + 1) / segments, sag);
    k.s.rod(p.x, p.y, p.z, q.x, q.y, q.z, r, color, { seg: 3, jitter: 0 });
  }
}

/** A string of hanging lanterns (or flags) between two world points. */
export function lanternString(ctx: Ctx, a: Vector3, b: Vector3, count: number, o: { glow?: number; sag?: number; colors?: ColorLike[]; size?: number; flags?: boolean } = {}): void {
  const sag = o.sag ?? 0.2;
  wire(ctx, a, b, sag, 0.012, C.iron, 10);
  const zone = ctx.b.zoneOf(a.clone().add(b).multiplyScalar(0.5));
  const k = ctx.b.worldKit(zone.id);
  const colors = o.colors ?? [C.lantern, C.yellow, C.red, C.orange];
  const size = o.size ?? 0.1;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = sagged(a, b, t, sag);
    const up = p.clone().normalize();
    if (o.flags) {
      const q = p.clone().addScaledVector(up, -size * 1.4);
      const side = new Vector3().subVectors(b, a).normalize();
      const frame = frameAtBearing(p.clone(), 0);
      void frame; void side;
      k.s.ball(size * 0.9, q.x, q.y, q.z, colors[i % colors.length], { detail: 0, scale: [1, 1.3, 0.25], jitter: 0 });
    } else {
      const lamp = p.clone().addScaledVector(up, -size * 1.5);
      k.s.rod(p.x, p.y, p.z, lamp.x, lamp.y + 0, lamp.z, 0.006, C.iron, { seg: 3, jitter: 0 });
      const rot: [number, number, number] = [0, 0, 0];
      k.d.ball(size, lamp.x, lamp.y, lamp.z, colors[i % colors.length], { glow: o.glow ?? GLOW.finale, detail: 0, jitter: 0, scale: [1, 1.25, 1], rot });
      addHalo(lamp, size * 4.6, o.glow ?? GLOW.finale);
    }
  }
}

/** Wooden poles at ground directions, wired together. Returns pole top points. */
export function poleLine(ctx: Ctx, dirs: Vector3[], o: { sag?: number; height?: number; zoneFn?: never } = {}): Vector3[][] {
  const height = o.height ?? 2.9;
  const tops: Vector3[][] = [];
  dirs.forEach((n, i) => {
    const next = dirs[Math.min(dirs.length - 1, i + 1)], prev = dirs[Math.max(0, i - 1)];
    const along = next.clone().sub(prev).projectOnPlane(n).normalize();
    const f = ctx.b.placeAt(n, 0);
    // pole crossarm perpendicular to the run: face along the run so +X is across
    const frame = ctx.b.kit(frameAtBearing(groundAt(n), Math.atan2(along.dot(frameBasis(n).east), along.dot(frameBasis(n).north)) + 0));
    void f;
    const p = pole(frame, height + (i % 2) * 0.12, 0);
    tops.push(p.tops.map(t => frame.p(t.x, t.y, t.z)));
  });
  for (let i = 0; i + 1 < tops.length; i++) for (let j = 0; j < 3; j++) wire(ctx, tops[i][j], tops[i + 1][j], o.sag ?? 0.14, 0.012, C.coal, 8);
  return tops;
}

import { eastAt, northAt } from './frame';
function frameBasis(n: Vector3) { return { east: eastAt(n), north: northAt(n) }; }

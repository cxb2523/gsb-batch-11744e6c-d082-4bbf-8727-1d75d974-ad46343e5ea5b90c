import type { SocketId } from '../chapter/data';
import type { SurfaceAnchor } from '../contracts';
import type { Builder } from './context';
import { Kit } from './context';
import type { ColorLike } from './kit';
import { shade } from './kit';
import { C } from './palette';

/** Neutral socket fixtures. Each has a round brass-ringed plug receptacle
 * facing local +Z; the thread workstream adds colored highlights on top of
 * the reported anchor (the plug tip). */

export interface HousingOptions {
  body?: ColorLike;
  ring?: ColorLike;
  w?: number;
  h?: number;
  d?: number;
  /** Tin-can style housing (cylinder along +Z). */
  can?: boolean;
}

/** Housing with receptacle at local (0, y, 0); returns the plug tip in local coordinates. */
export function housing(k: Kit, y: number, o: HousingOptions = {}): { x: number; y: number; z: number } {
  const body = o.body ?? C.ironLight, ring = o.ring ?? C.brass;
  if (o.can) {
    k.s.barrelZ(0.15, 0.24, 0, y, 0.12, body, { seg: 10, jitter: 0 });
    k.s.barrelZ(0.162, 0.035, 0, y, 0.03, C.iron, { seg: 10, jitter: 0 });
    k.s.barrelZ(0.162, 0.03, 0, y, 0.2, C.iron, { seg: 10, jitter: 0 });
    k.d.barrelZ(0.128, 0.035, 0, y, 0.245, ring, { seg: 10, jitter: 0 });
    k.d.barrelZ(0.092, 0.05, 0, y, 0.25, C.coal, { seg: 10, jitter: 0 });
    k.d.ball(0.018, 0, y, 0.285, C.brass, { detail: 0, jitter: 0 });
    return { x: 0, y, z: 0.34 };
  }
  const w = o.w ?? 0.3, h = o.h ?? 0.32, d = o.d ?? 0.2;
  k.s.box(w, h, d, 0, y, 0, body, { jitter: 0 });
  k.s.box(w + 0.05, 0.04, d + 0.05, 0, y + h / 2 + 0.02, 0, shade(body, -0.2), { jitter: 0 });
  k.s.box(w + 0.03, 0.03, d + 0.03, 0, y - h / 2 - 0.01, 0, shade(body, -0.2), { jitter: 0 });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.s.ball(0.016, sx * (w / 2 - 0.035), y + sy * (h / 2 - 0.035), d / 2 + 0.006, C.brass, { detail: 0, jitter: 0 });
  k.d.barrelZ(0.125, 0.045, 0, y, d / 2 + 0.02, ring, { seg: 10, jitter: 0 });
  k.d.barrelZ(0.088, 0.06, 0, y, d / 2 + 0.03, C.coal, { seg: 10, jitter: 0 });
  k.d.ball(0.02, -0.03, y, d / 2 + 0.06, C.brass, { detail: 0, jitter: 0 });
  k.d.ball(0.02, 0.03, y, d / 2 + 0.06, C.brass, { detail: 0, jitter: 0 });
  return { x: 0, y, z: d / 2 + 0.08 };
}

/** A free-standing post with a housing on top. */
export function socketPost(b: Builder, id: SocketId, k: Kit, o: { h?: number; body?: ColorLike; post?: ColorLike } & HousingOptions = {}): SurfaceAnchor {
  const h = o.h ?? 0.72;
  k.s.box(0.36, 0.14, 0.36, 0, -0.02, 0, C.stoneDark, { jitter: 0.03 });
  k.s.box(0.15, h - 0.1, 0.15, 0, (h - 0.1) / 2 + 0.05, 0, o.post ?? C.woodDark, { jitter: 0.02 });
  const tip = housing(k, h, o);
  k.c.box(0.36, h + 0.2, 0.36, 0, (h + 0.2) / 2 - 0.1, 0);
  return register(b, id, k, tip);
}

/** Housing bolted to a wall; the kit's frame +Z points away from the wall. */
export function socketWall(b: Builder, id: SocketId, k: Kit, y: number, o: HousingOptions = {}): SurfaceAnchor {
  const tip = housing(k, y, { d: 0.14, ...o });
  k.s.rod(0, y - 0.16, -0.02, 0, 0, 0.04, 0.025, C.iron, { seg: 5 });
  return register(b, id, k, tip);
}

export function register(b: Builder, id: SocketId, k: Kit, tip: { x: number; y: number; z: number }): SurfaceAnchor {
  const anchor = k.anchor(tip.x, tip.y, tip.z, 0, 1);
  b.sockets[id] = anchor;
  return anchor;
}

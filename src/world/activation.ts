import { Vector3 } from 'three';
import type { Ctx } from './context';

/** Small helpers for the "things come alive" machinery. A `Level` eases a
 * 0..1 value toward a target; district code wires it to glow channels,
 * rotations, scales... Updates run from the world's update loop. */

export class Level {
  value = 0;
  target = 0;
  constructor(readonly apply: (value: number) => void, readonly rate = 1.6) {}
  set(target: number, instant = false): void {
    this.target = target;
    if (instant) { this.value = target; this.apply(this.value); }
  }
  update(dt: number): void {
    if (this.value === this.target) return;
    const step = this.rate * dt;
    this.value = this.value < this.target ? Math.min(this.target, this.value + step) : Math.max(this.target, this.value - step);
    this.apply(this.value);
  }
}

export function level(ctx: Ctx, apply: (value: number) => void, rate = 1.6): Level {
  const l = new Level(apply, rate);
  ctx.b.onUpdate((_time, dt) => l.update(dt));
  return l;
}

/** A glow channel with a tint whose brightness eases with a Level. */
export function glowLevel(ctx: Ctx, channel: number, tint: [number, number, number], scale = 1, rate = 1.2): Level {
  ctx.mats.setGlow(channel, tint, 0);
  return level(ctx, v => ctx.mats.setGlow(channel, tint, v * scale), rate);
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const WARM: [number, number, number] = [1.0, 0.8, 0.42];
export const PALE: [number, number, number] = [1.0, 0.95, 0.7];
export function vec(x = 0, y = 0, z = 0): Vector3 { return new Vector3(x, y, z); }

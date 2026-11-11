import { Vector3 } from 'three';
import { level } from './activation';
import { Part, frameRoot, type Ctx } from './context';
import type { Frame } from './frame';
import { socketPost } from './fixtures';
import { C } from './palette';
import { shade } from './kit';
import { subLevel } from './layout';
import { crate, barrel } from './props';

/** Dock crane. Frame: origin on the quay deck at the tower, +Z toward the
 * water. Jib swings between the quay crate pile and the boat berth. */

function truss(k: Part['kit'], z0: number, z1: number, y: number, h: number, color = C.yellow): void {
  k.s.rod(0, y + h / 2, z0, 0, y + h / 2, z1, 0.03, color, { seg: 4, jitter: 0 });
  k.s.rod(0, y - h / 2, z0, 0, y - h / 2, z1, 0.03, color, { seg: 4, jitter: 0 });
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.26));
  for (let i = 0; i < n; i++) {
    const a = z0 + (z1 - z0) * i / n, c = z0 + (z1 - z0) * (i + 1) / n;
    k.s.rod(0, i % 2 ? y + h / 2 : y - h / 2, a, 0, i % 2 ? y - h / 2 : y + h / 2, c, 0.018, shade(color, -0.12), { seg: 3, jitter: 0 });
  }
}

export function buildCrane(ctx: Ctx, frame: Frame, deckRadius?: number): void {
  const { b } = ctx;
  const k = b.kit(frame);
  // base and tower
  k.s.box(0.95, 0.5, 0.95, 0, 0.2, 0, C.stoneDark, { jitter: 0.03 });
  k.s.box(0.72, 0.18, 0.72, 0, 0.52, 0, C.coal, { jitter: 0 });
  k.s.box(0.54, 1.25, 0.54, 0, 1.2, 0, C.yellow, { jitter: 0.02 });
  for (const y of [0.85, 1.35, 1.8]) k.s.box(0.58, 0.1, 0.58, 0, y, 0, C.coal, { jitter: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.s.rod(sx * 0.2, 0.62, sz * 0.2, sx * 0.13, 1.85, sz * 0.13, 0.025, C.coal, { seg: 4, jitter: 0 });
  k.d.box(0.2, 0.26, 0.03, 0, 1.0, 0.28, C.glass, { jitter: 0 });
  k.c.box(0.95, 2.0, 0.95, 0, 0.9, 0);
  socketPost(b, 'crane', b.kit(subLevel(frame, -1.0, 0.25, -Math.PI / 2)), { h: 0.72 });

  // rotating jib
  const root = frameRoot(ctx, frame);
  const jib = new Part(ctx, root, frame, new Vector3(0, 1.88, 0), 31);
  const j = jib.kit;
  j.s.cyl(0.4, 0.1, 0, -0.05, 0, C.coal, { seg: 10, jitter: 0 });
  j.s.box(0.52, 0.5, 0.62, 0, 0.3, -0.08, C.roofTeal, { jitter: 0.02 });
  j.d.box(0.4, 0.22, 0.03, 0, 0.36, 0.25, C.glass, { jitter: 0 });
  j.s.box(0.58, 0.07, 0.68, 0, 0.58, -0.08, C.coal, { jitter: 0 });
  truss(j, 0.0, 2.55, 0.55, 0.22);
  truss(j, -0.2, -1.0, 0.55, 0.2, C.yellow);
  for (let i = 0; i < 3; i++) j.s.box(0.42, 0.18, 0.3, 0, 0.5 + i * 0.19, -1.05, i % 2 ? C.ironLight : C.iron, { jitter: 0.03 });
  j.s.rod(0, 0.66, 0.0, 0, 1.18, 0.0, 0.03, C.yellow, { seg: 4 });
  j.s.rod(0, 1.18, 0.0, 0, 0.6, 2.5, 0.014, C.coal, { seg: 3, jitter: 0 });
  j.s.rod(0, 1.18, 0.0, 0, 0.6, -0.95, 0.014, C.coal, { seg: 3, jitter: 0 });
  j.s.ball(0.05, 0, 1.2, 0, C.red, { detail: 0, jitter: 0 });
  j.s.box(0.2, 0.12, 0.04, 0, 0.45, 2.58, C.coal, { jitter: 0 });
  jib.mount();

  const hook = new Part(ctx, jib.group, frame, new Vector3(0, 0.0, 2.2), 32);
  const h = hook.kit;
  h.s.rod(0, 0.5, 0, 0, -0.5, 0, 0.012, C.coal, { seg: 3, jitter: 0 });
  h.s.box(0.18, 0.12, 0.12, 0, -0.56, 0, C.red, { jitter: 0 });
  h.s.rod(0, -0.62, 0, 0, -0.76, 0, 0.02, C.coal, { seg: 4 });
  for (const sx of [-1, 1]) h.s.rod(sx * 0.2, -0.8, 0, 0, -0.62, 0, 0.012, C.rope, { seg: 3, jitter: 0 });
  crate(h.at(0, -1.1, 0), 0.38, C.woodLight, false);
  hook.mount();

  // idle pose before power, animated loop after h2
  const power = level(ctx, () => { /* eased value used below */ }, 0.7);
  jib.group.rotation.y = -2.0;
  hook.group.position.y = 0.0;
  let clock = 0;
  const apply = () => {
    const t = clock % 12;
    const lerp = (a: number, bb: number, u: number) => a + (bb - a) * Math.min(1, Math.max(0, u)) ;
    const ease = (u: number) => u * u * (3 - 2 * u);
    let swing: number, drop: number;
    const PILE = -2.0, BOAT = -0.8;
    if (t < 2) { swing = PILE; drop = lerp(0.1, 0.55, ease(t / 2)); }
    else if (t < 3) { swing = PILE; drop = lerp(0.55, 0.1, ease(t - 2)); }
    else if (t < 6) { swing = lerp(PILE, BOAT, ease((t - 3) / 3)); drop = 0.1; }
    else if (t < 7.5) { swing = BOAT; drop = lerp(0.1, 0.5, ease((t - 6) / 1.5)); }
    else if (t < 8.5) { swing = BOAT; drop = lerp(0.5, 0.1, ease(t - 7.5)); }
    else { swing = lerp(BOAT, PILE, ease((t - 8.5) / 3.5)); drop = 0.1; }
    const amount = power.value;
    jib.group.rotation.y = lerp(-2.0, swing, amount);
    hook.group.position.y = -drop * amount;
    hook.group.rotation.y = Math.sin(clock * 1.7) * 0.08 * amount;
  };
  b.onUpdate((_t, dt) => { if (power.value > 0) { clock += dt * (0.4 + 0.6 * power.value); apply(); } });
  b.onActivate('h2', instant => {
    power.set(1, instant);
    if (instant) { clock = 0.01; apply(); }
  });
  void deckRadius; void barrel;
}

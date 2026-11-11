import * as P from '../parts';
import type { Ctx } from '../humanoid';
import type { AnimContext, GestureFn } from '../animator';
import type { Pose } from '../skin';

/** Shared by Otto and Ike: resting on a window sill and, in the phone scene,
 * holding a tin can to the ear. */

const TIN = '#c7ccd6', TIN_DARK = '#8e95a6', STRING = '#e8505b';

export function tinCan(c: Ctx): void {
  // held with its open end toward the ear (bone-local -X when the forearm points up)
  const can = c.bone('tin', 'handR', [0, -0.02, 0.0], 'XZY');
  c.part(can, P.cylinder(0.056, 0.056, 0.11, 10), TIN, { rot: [0, 0, Math.PI / 2], at: [-0.085, 0, 0] });
  c.part(can, P.torus(0.056, 0.008, 10, 3), TIN_DARK, { at: [-0.14, 0, 0], rot: [0, Math.PI / 2, 0] });
  c.part(can, P.torus(0.056, 0.008, 10, 3), TIN_DARK, { at: [-0.03, 0, 0], rot: [0, Math.PI / 2, 0] });
  c.part(can, P.cylinder(0.008, 0.008, 0.12, 5), STRING, { at: [0.0, -0.05, 0.02], rot: [0.4, 0, 0.3] });
}

/** Lean on the sill; the right hand lifts the can to the ear. */
export const lean: GestureFn = (g, a) => {
  const t = a.t;
  g.addRot(a.ix.torso, 0.3, 0, 0);
  a.arm(g, 'L', 1.15, 0.2, 0, 0.7);
  // right arm: raised over the shoulder, forearm folded up to the ear
  a.arm(g, 'R', 0.1, 2.35, 0.0, 0.05, 0.6, 0.0);
  g.addRot(a.ix.head, 0.0, 0.0, -0.18 + 0.02 * Math.sin(t * 1.2));
};
export function animateWindow(F: Pose, a: AnimContext): void {
  const can = a.ease('tin', a.w.lean > 0.3 ? 1 : 0, 6);
  const s = Math.max(1e-4, can);
  F.scale(a.ix.tin, s, s, s);
}

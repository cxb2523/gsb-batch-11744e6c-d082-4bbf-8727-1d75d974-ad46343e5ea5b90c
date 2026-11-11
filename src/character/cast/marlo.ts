import { Vector3 } from 'three';
import * as P from '../parts';
import { both, knitCap, sway, stringBones } from './common';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { torsoRing } from '../humanoid';
import { lerp } from '../animator';
import type { GestureFn } from '../animator';

/** Marlo: fisherman. Teal knit cap, striped shirt, rolled sleeves, rain boots, a haul rope. */
const CREAM = '#f4efe2', NAVY = '#2f4a7c', CAP = '#2fa39d', CAP_BAND = '#86d3cc', TROUSERS = '#9a8f62', BOOT = '#3f6e55', BOOT_CUFF = '#2c5440', HAIR = '#6b4630';
const ROPE = '#d6b27a';

function decorate(c: Ctx): void {
  const { head } = c;
  for (const y of [0.2, 0.145, 0.09, 0.035, -0.02]) torsoRing(c, y, 0.026, NAVY, 0.005);
  torsoRing(c, 0.295, 0.03, NAVY, 0.012);
  both((sign, side) => {
    c.part(`arm${side}`, P.band(0.0600, 0.042, 10), NAVY, { at: [0, -0.0650, 0] });
    // boot cuffs fold over the top of the rain boots
    c.part(`shin${side}`, P.band(0.0720, 0.037, 10), BOOT_CUFF, { at: [0, -0.0245, 0] });
    c.part(`fore${side}`, P.band(0.0570, 0.042, 10), CREAM, { at: [0, -0.0200, 0] });
    c.part('head', P.ellipsoid(0.04, 0.08, 0.06, 8, 6), HAIR, { at: [sign * (head.rx - 0.02), head.cy - 0.035, -0.03] });
  });
  c.part('head', P.ellipsoid(0.2, 0.12, 0.1, 10, 7), HAIR, { at: [0, head.cy - 0.02, -head.rz + 0.06] });
  knitCap(c, { crown: CAP, band: CAP_BAND, rimY: 0.1, brim: 0.04, tip: 0.09 });
  // neckerchief
  c.part('torso', P.torus(0.128, 0.032, 16, 6), '#e0594a', { at: [0, 0.285, 0.0], rot: [Math.PI / 2, 0, 0], scale: [1.0, 0.9, 1] });
  c.part('torso', P.ellipsoid(0.045, 0.05, 0.015, 6, 5), '#e0594a', { at: [0, 0.23, 0.13], rot: [0.2, 0, 0] });

  // haul rope: connects both hands, with a loose end trailing toward the water
  const net = c.bone('net', 'body', [0, 0.02, 0.55], 'XZY');
  c.part(net, P.ellipsoid(0.09, 0.05, 0.09, 8, 5), '#c9a26a', { at: [0, 0.04, 0] });
  c.part(net, P.torus(0.07, 0.008, 12, 4), '#8c6a3a', { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0] });
  const pointOn = (bone: string, local: [number, number, number], out: Vector3) => out.set(...local).applyMatrix4(c.rig.bone(bone).world);
  stringBones(c, {
    prefix: 'rope', segments: 4, radius: 0.011, channel: 'body', color: ROPE,
    from: out => pointOn('handL', [0, -0.03, 0.0], out),
    to: out => pointOn('handR', [0, -0.03, 0.0], out),
    sag: length => length * 0.06,
    visible: () => c.state.ropeVis ?? 0,
  });
  stringBones(c, {
    prefix: 'tail', segments: 4, radius: 0.011, channel: 'body', color: ROPE,
    from: out => pointOn('handR', [0, -0.03, 0.0], out),
    to: out => pointOn('net', [0, 0.05, 0], out),
    sag: length => length * 0.12,
    visible: () => c.state.ropeVis ?? 0,
  });
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0]);
}

/** Hand-over-hand hauling: lean back, pull, reach, pull. */
const work: GestureFn = (g, a) => {
  const t = a.t, w = 4.2;
  const uL = 0.5 + 0.5 * Math.sin(t * w), uR = 1 - uL;
  a.arm(g, 'L', lerp(0.4, 1.25, uL), 0.16, 0.12, lerp(1.6, 0.45, uL));
  a.arm(g, 'R', lerp(0.4, 1.25, uR), 0.16, 0.12, lerp(1.6, 0.45, uR));
  g.addRot(a.ix.torso, -0.1 + 0.05 * Math.sin(t * w * 2 + 1), 0.12 * Math.sin(t * w), 0);
  g.addRot(a.ix.head, 0.1, -0.08 * Math.sin(t * w), 0);
  a.leg(g, 'L', 0.35, 0.6, 0.1);
  a.leg(g, 'R', -0.15, 0.45, 0.1);
  g.addPos(a.ix.body, 0, -0.03 + 0.012 * Math.sin(t * w * 2), 0);
  g.rot(a.ix.hips, 0, -0.1 * Math.sin(t * w), 0);
};

export const marlo: HumanoidSpec = {
  id: 'marlo', scale: 1.05, top: 1.19,
  skin: '#e6b287', shirt: CREAM, pants: TROUSERS, shoes: BOOT, shinColor: BOOT, sleeve: CREAM, forearm: 'skin', hem: -0.05,
  torso: { w: 1.04, d: 1.0 },
  blush: '#e98a78',
  gait: { freq: 0.95, swing: 1, bob: 1 },
  decorate,
  gestures: { work },
  animate(F, a) {
    sway(F, a, '', -0.65, 0.8);
    // the net bundle slides toward Marlo with every pull; rope + net only exist while hauling
    const hauling = a.ease('rope', a.w.work > 0.05 ? 1 : 0, 6);
    a.state.ropeVis = hauling;
    const cycle = (a.t * 4.2 / (Math.PI * 2)) % 1;
    F.pos(a.ix.net, 0, 0, -0.1 - 0.12 * cycle);
    const v = Math.max(hauling, 1e-4);
    F.scale(a.ix.net, v, v, v);
  },
};

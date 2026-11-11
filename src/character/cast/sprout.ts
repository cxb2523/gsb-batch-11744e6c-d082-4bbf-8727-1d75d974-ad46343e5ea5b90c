import { Vector3 } from 'three';
import * as P from '../parts';
import { both, hangingProp } from './common';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { skullShell, torsoRing, torsoSection } from '../humanoid';
import { lerp, type GestureFn } from '../animator';

/** Sprout: small gardener. Wide straw hat, green overalls, pigtails, a little watering can. */
const YELLOW = '#f5d86a', GREEN = '#4aa25c', GREEN_DARK = '#357a46', STRAW = '#e8c56d', STRAW_DARK = '#d6ae52', RIBBON = '#d9514c';
const HAIR = '#6a4026', BOOT = '#a4553b', TIN = '#6fb6d8', TIN_DARK = '#4b93b8', WATER = '#9ad8f5';

function decorate(c: Ctx): void {
  const { head, spec } = c;
  // fringe + pigtails under the hat
  skullShell(c, () => HAIR, { grow: 0.018, cutY: 0.045, seg: 18 });
  both((sign, side) => {
    const pig = c.bone(`pig${side}`, 'head', [sign * (head.rx + 0.015), head.cy - 0.01, -0.04], 'XZY');
    c.part(pig, P.ellipsoid(0.05, 0.055, 0.055, 8, 6), HAIR, { at: [0, 0, 0] });
    c.part(pig, P.lathe([{ r: 0, y: -0.02 }, { r: 0.05, y: -0.06 }, { r: 0.045, y: -0.13 }, { r: 0.02, y: -0.2 }, { r: 0, y: -0.215 }], 8), HAIR);
    c.part(pig, P.ellipsoid(0.035, 0.022, 0.035, 8, 5), RIBBON, { at: [0, -0.045, 0] });
  });
  // wide straw hat: dome, striped brim, ribbon with a flower
  const hat = c.bone('hat', 'head', [0, head.cy, 0], 'YXZ');
  const crown: P.ProfilePoint[] = [];
  const rimY = 0.075;
  const ry = head.ry + 0.04;
  const cut = Math.acos(Math.min(1, rimY / ry));
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * cut;
    crown.push({ r: Math.sin(a), y: Math.cos(a) * ry, color: k % 3 === 0 ? STRAW_DARK : STRAW });
  }
  c.part(hat, P.lathe(crown, 16, head.rx + 0.04, head.rz + 0.04), '#ffffff', { at: [0, 0, 0] });
  const brimR = 0.37;
  const stripe = (i: number) => (i % 2 ? STRAW_DARK : STRAW);
  const brim: P.ProfilePoint[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const r = lerp(0.25, brimR, i / steps);
    brim.push({ r, y: lerp(0.012, -0.03, (i / steps) ** 2), color: stripe(i) });
    if (i < steps) brim.push({ r: lerp(0.25, brimR, (i + 1) / steps), y: lerp(0.012, -0.03, ((i + 1) / steps) ** 2), color: stripe(i) });
  }
  const outer = brim[brim.length - 1];
  brim.push({ r: outer.r, y: outer.y - 0.012, color: STRAW_DARK }, { r: 0.25, y: -0.006, color: STRAW_DARK });
  c.part(hat, P.lathe(brim, 20, 1, 0.97), '#ffffff', { at: [0, rimY, 0], rot: [-0.06, 0, 0] });
  c.part(hat, P.torus(0.255, 0.024, 16, 5), RIBBON, { at: [0, rimY + 0.035, 0], rot: [Math.PI / 2, 0, 0], scale: [1.02, 1.0, 1] });
  c.part(hat, P.ellipsoid(0.032, 0.032, 0.012, 7, 5), '#fff3c8', { at: [0.1, rimY + 0.05, 0.245], rot: [0, 0.4, 0] });
  c.part(hat, P.ellipsoid(0.014, 0.014, 0.014, 6, 4), '#f2a640', { at: [0.1, rimY + 0.05, 0.254] });
  // overalls: bib, straps, buttons, pocket, rolled cuffs
  torsoRing(c, 0.17, 0.02, GREEN_DARK, 0.007);
  both(sign => {
    const [, zf] = torsoSection(spec, 0.22);
    c.part('torso', P.box(0.04, 0.2, 0.012), GREEN, { at: [sign * 0.095, 0.245, zf + 0.002], rot: [0.0, sign * 0.15, 0] });
    c.part('torso', P.box(0.04, 0.012, 0.26), GREEN, { at: [sign * 0.1, 0.298, -0.005], rot: [0, 0, sign * 0.2] });
    c.part('torso', P.ellipsoid(0.017, 0.017, 0.01, 6, 4), YELLOW, { at: [sign * 0.095, 0.17, torsoSection(spec, 0.17)[1] + 0.008] });
    const side = sign > 0 ? 'L' : 'R';
    c.part(`shin${side}`, P.band(0.0675, 0.042, 10), GREEN_DARK, { at: [0, -0.0850, 0] });
    c.part(`fore${side}`, P.band(0.0545, 0.04, 10), '#f0c94a', { at: [0, -0.068, 0] });
  });
  c.part('torso', P.box(0.1, 0.07, 0.012), GREEN_DARK, { at: [0, 0.08, torsoSection(spec, 0.08)[1] + 0.003] });

  // watering can hanging from the right hand, with drops that fall while she waters
  const can = hangingProp(c, 'can', 'handR', [0, -0.045, 0.0], () => [c.state.tilt ?? 0, c.state.sway ?? 0]);
  c.part(can, P.cylinder(0.062, 0.07, 0.1, 12), TIN, { at: [0, -0.115, 0.0] });
  c.part(can, P.torus(0.062, 0.008, 12, 4), TIN_DARK, { at: [0, -0.065, 0], rot: [Math.PI / 2, 0, 0] });
  c.part(can, P.torus(0.05, 0.009, 10, 4, Math.PI), TIN_DARK, { at: [0, -0.07, 0.0], rot: [0, Math.PI / 2, 0] });
  c.part(can, P.cylinder(0.013, 0.021, 0.19, 7), TIN_DARK, { at: [0, -0.085, 0.13], rot: [0.95, 0, 0] });
  c.part(can, P.cylinder(0.038, 0.03, 0.02, 9), TIN_DARK, { at: [0, -0.0, 0.205], rot: [0.95, 0, 0] });
  const spout = new Vector3(), tmp = new Vector3();
  for (let i = 0; i < 4; i++) {
    const drop = c.bone(`drop${i}`, 'root', [0, 0, 0], 'XYZ');
    c.part(drop, P.ellipsoid(0.014, 0.021, 0.014, 6, 4), WATER);
    drop.solve = () => {
      const pour = c.state.pour ?? 0;
      const p = (((c.state.time ?? 0) * 1.9 + i / 4) % 1 + 1) % 1;
      spout.set(0, 0.0, 0.205).applyMatrix4(c.rig.bone('can').world);
      tmp.set(0, -0.2, 0.9).transformDirection(c.rig.bone('can').world);
      const s = Math.max(1e-4, pour * Math.sin(Math.PI * Math.min(1, p * 1.15)));
      const fall = pour > 0.02 ? p : 0;
      drop.world.makeScale(s, s, s).setPosition(spout.x + tmp.x * fall, spout.y - fall * 0.34, spout.z + tmp.z * fall);
    };
  }
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0.05]);
}

/** Sweeping the can side to side, tipped to pour. */
const work: GestureFn = (g, a) => {
  const t = a.t;
  const sweep = Math.sin(t * 1.5);
  a.arm(g, 'R', 1.0 + 0.08 * Math.sin(t * 3), 0.12 + 0.28 * sweep, 0.1, 0.85);
  a.arm(g, 'L', 0.12, 0.22, 0, 0.3);
  g.addRot(a.ix.torso, 0.1, -0.16 * sweep, 0);
  g.addRot(a.ix.head, 0.1, -0.1 * sweep, 0.04 * sweep);
};

export const sprout: HumanoidSpec = {
  id: 'sprout', scale: 0.8, headScale: 1.06, top: 1.2, seat: 0.14,
  skin: '#f4c9a8', shirt: YELLOW, pants: GREEN, shoes: BOOT, shinColor: GREEN, sleeve: YELLOW, hem: 0.17,
  torso: { w: 0.96, d: 0.96 }, arm: 0.92, leg: 0.95, blush: '#f58f8a', eye: 1.1,
  gait: { freq: 1.2, swing: 1, bob: 1.1 },
  decorate,
  gestures: { work },
  animate(F, a) {
    const ix = a.ix;
    a.state.time = a.t;
    const pour = a.ease('pour', a.w.work > 0.4 ? 1 : 0, 3);
    a.state.pour = pour;
    // the can hangs from her hand like a pendulum and tips forward to pour
    const tilt = a.spring('canTilt', pour * (1.0 + 0.1 * Math.sin(a.t * 2.3)) - 0.05 * a.accel - 0.1 * a.bobVel, 70, 6);
    a.state.tilt = tilt;
    a.state.sway = a.spring('canSway', 0.05 * Math.sin(a.t * 1.5) * pour - 0.03 * Math.sin(a.phase) * a.walkW, 60, 5);
    for (const side of ['L', 'R'] as const) {
      const lag = a.spring(`pig${side}`, -0.05 * a.accel - 0.12 * a.bobVel, 50, 4.5);
      F.rot(ix[`pig${side}`], lag + 0.04 * Math.sin(a.t * 1.6 + (side === 'L' ? 0 : 1)), 0, (side === 'L' ? 1 : -1) * (0.12 + 0.05 * Math.sin(a.t * 1.3)));
    }
  },
};

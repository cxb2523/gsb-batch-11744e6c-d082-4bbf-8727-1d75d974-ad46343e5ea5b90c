import * as P from '../parts';
import { both } from './common';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { shade, torsoSection } from '../humanoid';

/** Wick: old lighthouse keeper. Yellow raincoat, white beard, round glasses. */
const COAT = '#f3c53a', COAT_DARK = '#c9981f', WHITE = '#f7f3ea', NAVY = '#3d4a66', BOOT = '#2e3140';

function decorate(c: Ctx): void {
  const { head, spec } = c;
  // flared raincoat skirt, hood bunched behind the neck, collar and buttons
  const [rx, rz] = torsoSection(spec, -0.04);
  c.part('torso', P.lathe([
    { r: 0.97, y: -0.03 }, { r: 1.12, y: -0.11 }, { r: 1.24, y: -0.185 }, { r: 1.24, y: -0.19 }, { r: 1.0, y: -0.19 }, { r: 0.8, y: -0.1 },
  ], 20, rx, rz), COAT);
  c.part('torso', P.torus(rx * 0.82, 0.014, 20, 5), COAT_DARK, { at: [0, -0.18, 0], rot: [Math.PI / 2, 0, 0], scale: [1.5, 1.2, 1] });
  c.part('torso', P.ellipsoid(0.14, 0.075, 0.1, 10, 7), shade(COAT, 0.95), { at: [0, 0.29, -0.105] });
  c.part('torso', P.torus(0.13, 0.04, 16, 6), COAT, { at: [0, 0.3, 0.0], rot: [Math.PI / 2, 0, 0], scale: [1.06, 0.88, 1] });
  for (const y of [0.2, 0.1, 0.0]) {
    const [, z] = torsoSection(spec, y);
    c.part('torso', P.ellipsoid(0.017, 0.017, 0.012, 6, 4), '#6a4a22', { at: [0, y, z + 0.004] });
  }
  c.part('torso', P.box(0.012, 0.3, 0.01), COAT_DARK, { at: [0, 0.1, torsoSection(spec, 0.1)[1] + 0.001] });
  both(sign => {
    const [, zp] = torsoSection(spec, -0.05);
    c.part('torso', P.box(0.07, 0.05, 0.012), COAT_DARK, { at: [sign * 0.095, -0.06, zp + 0.065], rot: [0, sign * 0.3, 0] });
  });

  // hair around the bald crown
  both(sign => {
    c.part('head', P.ellipsoid(0.055, 0.075, 0.075, 8, 6), WHITE, { at: [sign * (head.rx - 0.012), head.cy + 0.02, -0.04] });
  });
  c.part('head', P.ellipsoid(0.2, 0.14, 0.12, 12, 8), WHITE, { at: [0, head.cy - 0.015, -head.rz + 0.07] });
  c.part('head', P.ellipsoid(0.22, 0.05, 0.1, 12, 6), WHITE, { at: [0, head.cy + 0.07, -head.rz + 0.1], rot: [0.3, 0, 0] });

  // glasses (ink: stays drawn on paper)
  for (const sign of [1, -1]) {
    const eye = c.headPoint(sign * 0.095, head.cy + 0.015, 0.016);
    c.ink('head', P.torus(0.064, 0.0085, 16, 4), { at: eye.at, rot: eye.rot });
    c.ink('head', P.box(0.012, 0.012, 0.14), { at: [sign * (head.rx - 0.006), head.cy + 0.02, 0.045], rot: [0.0, 0, 0] });
  }
  const bridge = c.headPoint(0, head.cy + 0.02, 0.018);
  c.ink('head', P.box(0.05, 0.01, 0.01), { at: bridge.at, rot: bridge.rot });

  // mustache above the mouth, beard hanging below it
  both(sign => {
    const m = c.headPoint(sign * 0.048, head.cy - 0.062, 0.016);
    c.part('head', P.ellipsoid(0.058, 0.03, 0.036, 9, 6), WHITE, { at: m.at, rot: [m.rot[0], m.rot[1], sign * -0.3] });
  });
  const beard = c.bone('beard', 'head', [0, head.cy - 0.125, 0.085], 'XZY');
  c.part(beard, P.lathe([
    { r: 0, y: 0.055 }, { r: 0.12, y: 0.05 }, { r: 0.185, y: 0.0 }, { r: 0.175, y: -0.07 }, { r: 0.12, y: -0.15 }, { r: 0.05, y: -0.215 }, { r: 0, y: -0.24 },
  ], 16, 1, 0.66), WHITE, { at: [0, 0, 0.02] });
  both(sign => c.part('head', P.ellipsoid(0.05, 0.09, 0.07, 8, 6), WHITE, { at: [sign * 0.195, head.cy - 0.07, 0.03] }));

  // round nose a little bigger and rosier is handled by noseScale
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0]);
}

export const wick: HumanoidSpec = {
  id: 'wick', scale: 1.1, top: 1.06,
  skin: '#f2c5a2', shirt: COAT, pants: NAVY, shoes: BOOT, sleeve: COAT, hem: -0.5,
  torso: { w: 1.1, d: 1.08, belly: 0.014 },
  noseScale: 1.5, browColor: WHITE, browSize: 1.5, blush: '#f09a92',
  gait: { freq: 0.82, swing: 0.8, bob: 0.8 },
  decorate,
  animate(F, a) {
    // the beard sways with the head, nods when talking
    const talk = a.w.talk;
    const open = a.input.talking ? 0.07 * Math.sin(a.t * 12.5) : 0;
    const swing = a.spring('beard', -0.04 * a.accel - 0.1 * a.bobVel + open * 0.5, 55, 6);
    F.rot(a.ix.beard, swing + 0.05 * Math.sin(a.t * 1.3) * (1 - talk * 0.5), 0, 0);
  },
};

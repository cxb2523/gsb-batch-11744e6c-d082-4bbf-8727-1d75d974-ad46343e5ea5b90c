import { Color } from 'three';
import * as P from '../parts';
import { both } from './common';
import { animateWindow, lean, tinCan } from './window';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { shade, torsoSection } from '../humanoid';

/** Otto: bald old man in a plaid vest, shirt sleeves; leans out of his window. */
const SHIRT = '#f2e8d2', VEST = '#9b6a44', VEST_STRIPE = '#d9a54a', VEST_DARK = '#6d4529', PANTS = '#5e5667', SHOE = '#3b2f2b', WHITE = '#f5f1e8';

function plaidVest(c: Ctx): void {
  const { spec } = c;
  const rows = 9;
  const seg = 24;
  const profile: P.ProfilePoint[] = [];
  const [wx, wz] = torsoSection(spec, 0.05);
  for (let k = 0; k < rows; k++) {
    const y = 0.25 - (k / (rows - 1)) * 0.3;
    const [x] = torsoSection(spec, y);
    profile.push({ r: (x + 0.012) / wx, y });
  }
  const raw = P.lathe(profile, seg, wx, wz, [0.28, Math.PI * 2 - 0.56]);
  const perRing = seg + 1;
  const count = raw.p.length / 3;
  const base = new Color(VEST), stripe = new Color(VEST_STRIPE), dark = new Color(VEST_DARK);
  const colors: number[] = [];
  for (let v = 0; v < count; v++) {
    const ring = Math.floor(v / perRing), k = v % perRing;
    const horizontal = ring % 3 === 1;
    const vertical = k % 5 === 2;
    const color = horizontal && vertical ? dark : horizontal || vertical ? stripe.clone().lerp(base, 0.35) : base;
    colors.push(color.r, color.g, color.b);
  }
  raw.c = colors;
  c.part('torso', raw, '#ffffff');
  both(sign => {
    const [, zf] = torsoSection(spec, 0.0);
    c.part('torso', P.box(0.07, 0.05, 0.012), VEST_DARK, { at: [sign * 0.085, -0.02, zf + 0.026], rot: [0, sign * 0.5, 0] });
    c.part('torso', P.box(0.04, 0.012, 0.25), VEST, { at: [sign * 0.1, 0.3, -0.005], rot: [0, 0, sign * 0.2] });
  });
  for (const y of [0.17, 0.09, 0.01]) c.part('torso', P.ellipsoid(0.016, 0.016, 0.01, 6, 4), '#e6d3a0', { at: [0, y, torsoSection(spec, y)[1] + 0.017] });
}

function decorate(c: Ctx): void {
  const { head, spec } = c;
  plaidVest(c);
  c.part('torso', P.torus(0.125, 0.032, 16, 6), '#fffaf0', { at: [0, 0.29, 0.0], rot: [Math.PI / 2, 0, 0], scale: [1.0, 0.9, 1] });
  c.part('torso', P.box(0.035, 0.1, 0.01), SHIRT, { at: [0, 0.2, torsoSection(spec, 0.2)[1] + 0.003] });
  both((sign, side) => {
    c.part(`fore${side}`, P.band(0.0515, 0.04, 10), shade(SHIRT, 0.92), { at: [0, -0.068, 0] });
    // wispy side hair above big ears
    c.part('head', P.ellipsoid(0.04, 0.065, 0.06, 8, 6), WHITE, { at: [sign * (head.rx - 0.02), head.cy + 0.04, -0.03] });
    const m = c.headPoint(sign * 0.05, head.cy - 0.06, 0.016);
    c.part('head', P.ellipsoid(0.06, 0.028, 0.034, 9, 6), WHITE, { at: m.at, rot: [m.rot[0], m.rot[1], sign * -0.25] });
    // big ears
    c.part('head', P.ellipsoid(0.03, 0.06, 0.04, 8, 6), spec.skin, { at: [sign * (head.rx + 0.015), head.cy, -0.02] });
  });
  c.part('head', P.ellipsoid(0.2, 0.1, 0.1, 10, 6), WHITE, { at: [0, head.cy - 0.02, -head.rz + 0.06] });
  // suspenders under the vest are hidden; a pocket watch chain instead
  c.part('torso', P.torus(0.045, 0.005, 10, 3, Math.PI), '#d8b04a', { at: [0.06, 0.02, torsoSection(spec, 0.02)[1] + 0.02], rot: [0, 0, Math.PI] });
  tinCan(c);
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0]);
}

export const otto: HumanoidSpec = {
  id: 'otto', scale: 1.04, top: 1.045,
  skin: '#efc2a1', shirt: SHIRT, pants: PANTS, shoes: SHOE, sleeve: SHIRT, hem: -0.05,
  torso: { w: 1.1, d: 1.1, belly: 0.015 }, noseScale: 1.4, browColor: WHITE, browSize: 1.5, blush: '#ee9a90',
  gait: { freq: 0.82, swing: 0.8, bob: 0.8 },
  decorate,
  gestures: { lean },
  animate(F, a) { animateWindow(F, a); },
};

import * as P from '../parts';
import { both, knitCap, sway } from './common';
import { animateWindow, lean, tinCan } from './window';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { shade, torsoRing, torsoSection } from '../humanoid';

/** Ike: thin old man in a grey cardigan and knit beanie; leans out of his window. */
const CARDIGAN = '#8f99a8', CARDIGAN_DARK = '#6c7686', SHIRT = '#f4efe3', PANTS = '#6d5a48', SHOE = '#3d322d';
const BEANIE = '#a2414d', BEANIE_BAND = '#e8d3b0', GREY = '#d9dadc';

function decorate(c: Ctx): void {
  const { head, spec } = c;
  const [, zFront] = [0, torsoSection(spec, 0.12)[1]];
  c.part('torso', P.box(0.07, 0.34, 0.012), SHIRT, { at: [0, 0.1, zFront + 0.004] });
  torsoRing(c, 0.29, 0.03, shade(SHIRT, 0.97), 0.012);
  c.part('torso', P.box(0.012, 0.34, 0.012), CARDIGAN_DARK, { at: [0.038, 0.1, zFront + 0.006] });
  c.part('torso', P.box(0.012, 0.34, 0.012), CARDIGAN_DARK, { at: [-0.038, 0.1, zFront + 0.006] });
  for (const y of [0.2, 0.1, 0.0]) c.part('torso', P.ellipsoid(0.014, 0.014, 0.009, 6, 4), '#d9d2c0', { at: [0.0, y, zFront + 0.012] });
  both((sign, side) => {
    c.part('torso', P.box(0.075, 0.06, 0.012), CARDIGAN_DARK, { at: [sign * 0.095, -0.03, torsoSection(spec, -0.03)[1] + 0.012], rot: [0, sign * 0.5, 0] });
    c.part(`fore${side}`, P.band(0.0525, 0.04, 10), CARDIGAN_DARK, { at: [0, -0.068, 0] });
    c.part('head', P.ellipsoid(0.045, 0.06, 0.06, 8, 6), GREY, { at: [sign * (head.rx - 0.012), head.cy - 0.03, -0.03] });
    // long drooping mustache
    const m = c.headPoint(sign * 0.055, head.cy - 0.06, 0.016);
    c.part('head', P.ellipsoid(0.065, 0.028, 0.034, 9, 6), GREY, { at: m.at, rot: [m.rot[0], m.rot[1], sign * 0.3] });
    const t = c.headPoint(sign * 0.105, head.cy - 0.09, 0.016);
    c.part('head', P.ellipsoid(0.022, 0.05, 0.026, 7, 5), GREY, { at: t.at, rot: [t.rot[0], t.rot[1], sign * 0.12] });
  });
  c.part('head', P.ellipsoid(0.2, 0.1, 0.1, 10, 6), GREY, { at: [0, head.cy - 0.03, -head.rz + 0.06] });
  knitCap(c, { crown: BEANIE, band: BEANIE_BAND, rimY: 0.085, brim: 0.045, tip: 0.1, pom: '#f0dcc0' });
  tinCan(c);
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0]);
}

export const ike: HumanoidSpec = {
  id: 'ike', scale: 1.02, top: 1.18,
  skin: '#e9bf9d', shirt: CARDIGAN, pants: PANTS, shoes: SHOE, sleeve: CARDIGAN, hem: -0.05,
  torso: { w: 0.92, d: 0.92 }, arm: 0.92, noseScale: 1.3, browColor: GREY, browSize: 1.35, blush: '#ec9a92',
  gait: { freq: 0.9, swing: 0.85, bob: 0.85 },
  decorate,
  gestures: { lean },
  animate(F, a) { sway(F, a, '', -0.5, 0.7); animateWindow(F, a); },
};

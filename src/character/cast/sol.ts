import * as P from '../parts';
import { both, hangingProp } from './common';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { shade, skullShell, torsoSection } from '../humanoid';
import type { GestureFn } from '../animator';

/** Nana Sol: noodle-stall grandmother. Hair bun, floral apron, ladle. */
const DRESS = '#a98fd3', DRESS_DARK = '#8870b8', APRON = '#fbf1de', HAIR = '#dcd9d6', HAIR_SHADE = '#bdb9b5', STOCKING = '#efe6d8', SHOE = '#7b5a46';
const FLOWERS = ['#f2879f', '#f6c244', '#7abbe9', '#f2879f', '#f6c244'];

function decorate(c: Ctx): void {
  const { head, spec } = c;
  // dress skirt
  const [rx, rz] = torsoSection(spec, -0.04);
  c.part('torso', P.lathe([
    { r: 0.98, y: -0.03 }, { r: 1.12, y: -0.11 }, { r: 1.27, y: -0.19 }, { r: 1.28, y: -0.2 }, { r: 1.05, y: -0.2 }, { r: 0.8, y: -0.1 },
  ], 20, rx, rz), DRESS);
  c.part('torso', P.torus(rx * 1.0, 0.016, 20, 5), DRESS_DARK, { at: [0, -0.195, 0], rot: [Math.PI / 2, 0, 0], scale: [1.25, 1.0, 1] });
  // floral apron: front shell + bib + straps
  const rows: P.ProfilePoint[] = [];
  const [wx, wz] = torsoSection(spec, 0.05);
  for (const y of [0.22, 0.17, 0.1, 0.02, -0.06, -0.13, -0.19]) {
    const [x] = torsoSection(spec, Math.min(y, 0.2));
    const flare = y < -0.04 ? (-0.04 - y) * 0.9 : 0;
    rows.push({ r: (x + flare + 0.03) / wx, y, color: APRON });
  }
  c.part('torso', P.lathe(rows, 14, wx, wz, [-1.35, 2.7]), '#ffffff');
  // flowers
  const spots: [number, number][] = [[-0.1, 0.1], [0.0, 0.14], [0.1, 0.1], [-0.13, -0.02], [-0.04, 0.03], [0.05, -0.02], [0.13, -0.03], [-0.09, -0.12], [0.0, -0.1], [0.1, -0.13]];
  spots.forEach(([x, y], i) => {
    const [fx] = torsoSection(spec, Math.min(y, 0.2));
    const flare = y < -0.04 ? (-0.04 - y) * 0.9 : 0;
    const R = fx + flare + 0.03;
    const a = Math.asin(Math.max(-0.95, Math.min(0.95, x / (R * 1.0))));
    const zz = (wz / wx) * R * Math.cos(a) + 0.006;
    c.part('torso', P.disc(0.022, 8), FLOWERS[i % FLOWERS.length], { at: [x, y, zz], rot: [0, a, 0] });
    c.part('torso', P.disc(0.009, 6), '#fff6d6', { at: [x, y, zz + 0.002], rot: [0, a, 0] });
  });
  both(sign => c.part('torso', P.box(0.035, 0.012, 0.27), APRON, { at: [sign * 0.095, 0.3, -0.005], rot: [0, 0, sign * 0.2] }));
  c.part('torso', P.ellipsoid(0.05, 0.03, 0.02, 7, 5), APRON, { at: [0, 0.0, -wz - 0.03] });
  c.part('torso', P.ellipsoid(0.03, 0.045, 0.014, 7, 5), shade(APRON, 0.95), { at: [-0.05, -0.07, -wz - 0.03], rot: [0, 0, 0.4] });
  both((sign, side) => {
    c.part(`shin${side}`, P.band(0.0660, 0.042, 10), STOCKING, { at: [0, -0.0450, 0] });
    c.part(`fore${side}`, P.band(0.0545, 0.04, 10), DRESS_DARK, { at: [0, -0.068, 0] });
  });

  // grey hair with a bun on a hairpin
  skullShell(c, y => (y > 0.2 ? HAIR : HAIR_SHADE), { grow: 0.02, cutY: 0.04, seg: 20 });
  both(sign => c.part('head', P.ellipsoid(0.045, 0.08, 0.06, 8, 6), HAIR, { at: [sign * (head.rx - 0.012), head.cy + 0.01, -0.03] }));
  const bun = c.bone('bun', 'head', [0, head.cy + 0.2, -0.1], 'XZY');
  c.part(bun, P.ellipsoid(0.105, 0.095, 0.105, 10, 8), HAIR, { at: [0, 0.03, 0] });
  c.part(bun, P.torus(0.08, 0.012, 14, 5), HAIR_SHADE, { at: [0, 0.03, 0], rot: [Math.PI / 2, 0.3, 0] });
  c.part(bun, P.cylinder(0.008, 0.008, 0.22, 5), '#8a6d46', { at: [0.02, 0.03, 0.02], rot: [0, 0, Math.PI / 2 - 0.2] });
  c.part(bun, P.ellipsoid(0.02, 0.02, 0.02, 6, 4), '#e0594a', { at: [0.125, 0.045, 0.02] });
  // ladle: hangs from the hand into the pot
  const ladle = hangingProp(c, 'ladle', 'handR', [0, -0.045, 0.0], () => [c.state.ladleTilt ?? 0.1, c.state.ladleSway ?? 0], () => c.state.ladleScale ?? 0);
  c.part(ladle, P.cylinder(0.011, 0.011, 0.26, 6), '#8d6b46', { at: [0, -0.07, 0] });
  c.part(ladle, P.dome(0.055, 0.04, 0.055, 10, 4), '#a6adb9', { at: [0, -0.2, 0.0], rot: [Math.PI, 0, 0] });
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0.05]);
}

/** Stirring the pot: the ladle traces a slow circle, the other hand on the hip. */
const work: GestureFn = (g, a) => {
  const t = a.t * 2.6;
  a.arm(g, 'R', 0.95 + 0.17 * Math.sin(t), 0.2 + 0.17 * Math.cos(t), 0.0, 0.85 + 0.15 * Math.sin(t + 1.0));
  g.rot(a.ix.handR, 0.35, 0, 0);
  a.arm(g, 'L', -0.1, 0.65, 0.0, 1.75, 0, 0.8);
  g.addRot(a.ix.torso, 0.08 + 0.03 * Math.sin(t), 0.06 * Math.cos(t), 0.04 * Math.sin(t + 1));
  g.addRot(a.ix.head, 0.12 + 0.02 * Math.cos(t), -0.06 * Math.cos(t), 0.0);
};

export const sol: HumanoidSpec = {
  id: 'sol', scale: 1.0, top: 1.16,
  skin: '#efc3a2', shirt: DRESS, pants: '#6a5a8a', shoes: SHOE, sleeve: DRESS, hem: -0.5, shinColor: STOCKING,
  torso: { w: 1.14, d: 1.16, belly: 0.03 }, blush: '#f38f8c',
  gait: { freq: 0.85, swing: 0.8, bob: 0.8 },
  decorate,
  gestures: { work },
  animate(F, a) {
    a.state.ladleScale = a.ease('ladle', 1, 4);
    const stir = a.w.work;
    a.state.ladleTilt = a.spring('ladleTilt', 0.12 + 0.25 * stir * Math.sin(a.t * 2.6) - 0.04 * a.accel, 60, 6);
    a.state.ladleSway = a.spring('ladleSway', 0.25 * stir * Math.cos(a.t * 2.6), 60, 6);
    const bun = a.spring('bun', -0.04 * a.accel - 0.1 * a.bobVel, 50, 5);
    F.rot(a.ix.bun, bun + 0.02 * Math.sin(a.t * 1.1), 0, 0);
  },
};

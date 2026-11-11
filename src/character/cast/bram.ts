import * as P from '../parts';
import { both } from './common';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { shade, skullShell, torsoRing, torsoSection } from '../humanoid';
import { lerp, type GestureFn } from '../animator';

/** Bram: big workshop smith. Handlebar mustache, leather apron, hammer. */
const SHIRT = '#efe2c8', APRON = '#8d5a33', APRON_DARK = '#6a4025', PANTS = '#4b4e5d', BOOTS = '#4f3623', HAIR = '#3c261a', IRON = '#8e95a3', WOOD = '#b98350';

function decorate(c: Ctx): void {
  const { head, spec } = c;
  // short dark hair + sideburns + thick brows (ink brows replaced by colored ones via spec)
  skullShell(c, () => HAIR, { grow: 0.02, cutY: 0.085, seg: 18 });
  both(sign => c.part('head', P.ellipsoid(0.04, 0.075, 0.06, 8, 6), HAIR, { at: [sign * (head.rx - 0.012), head.cy + 0.01, -0.02] }));
  // handlebar mustache
  const m = c.headPoint(0, head.cy - 0.055, 0.02);
  c.part('head', P.ellipsoid(0.07, 0.03, 0.035, 9, 6), HAIR, { at: m.at, rot: m.rot });
  both(sign => {
    const p = c.headPoint(sign * 0.085, head.cy - 0.058, 0.022);
    c.part('head', P.ellipsoid(0.065, 0.026, 0.03, 9, 6), HAIR, { at: [p.at[0], p.at[1] + 0.006, p.at[2]], rot: [p.rot[0], p.rot[1], sign * 0.4] });
    const q = c.headPoint(sign * 0.14, head.cy - 0.032, 0.022);
    c.part('head', P.ellipsoid(0.03, 0.022, 0.026, 7, 5), HAIR, { at: [q.at[0], q.at[1] + 0.012, q.at[2]], rot: [q.rot[0], q.rot[1], sign * 0.9] });
    c.part(`fore${sign > 0 ? 'L' : 'R'}`, P.band(0.0745, 0.042, 10), shade(SHIRT, 0.9), { at: [0, -0.0270, 0] });
    c.part(`shin${sign > 0 ? 'L' : 'R'}`, P.band(0.0815, 0.042, 10), shade(BOOTS, 1.15), { at: [0, -0.0350, 0] });
  });
  // leather apron: front/side shell, neck strap, belt, pocket
  const rows: P.ProfilePoint[] = [];
  const ys = [0.235, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.12, -0.16];
  const [wx, wz] = torsoSection(spec, 0.05);
  for (const y of ys) {
    const [rx] = torsoSection(spec, Math.min(y, 0.2));
    const flare = y < -0.05 ? (-0.05 - y) * 0.25 : 0;
    rows.push({ r: (rx + flare + 0.022) / wx, y, color: y > 0.18 ? APRON_DARK : APRON });
  }
  c.part('torso', P.lathe(rows, 12, wx, wz, [-1.05, 2.1]), '#ffffff');
  c.part('torso', P.box(0.2, 0.09, 0.016), APRON_DARK, { at: [0, 0.03, torsoSection(spec, 0.03)[1] + 0.046] });
  torsoRing(c, 0.2, 0.03, APRON_DARK, 0.034);
  torsoRing(c, -0.015, 0.032, '#3a2616', 0.04);
  c.part('torso', P.box(0.03, 0.035, 0.014), '#e6c36a', { at: [0, -0.015, torsoSection(spec, -0.015)[1] + 0.052] });
  both(sign => c.part('torso', P.box(0.04, 0.02, 0.28), APRON_DARK, { at: [sign * 0.08, 0.305, -0.005], rot: [0, 0, sign * 0.15] }));

  // hammers: one on the belt, one in the right hand (only one is visible at a time)
  for (const [name, parent, at] of [['hammerBelt', 'torso', [-0.225, 0.0, 0.03]], ['hammer', 'handR', [0, -0.03, 0]]] as const) {
    const b = c.bone(name, parent, at, 'XZY');
    c.part(b, P.cylinder(0.014, 0.014, name === 'hammer' ? 0.3 : 0.19, 8), WOOD, { at: [0, name === 'hammer' ? 0 : -0.05, name === 'hammer' ? 0.1 : 0], rot: name === 'hammer' ? [Math.PI / 2, 0, 0] : [0, 0, 0] });
    c.part(b, P.box(0.13, 0.05, 0.05), IRON, name === 'hammer' ? { at: [0, 0, 0.255] } : { at: [0, 0.075, 0], rot: [0, Math.PI / 2, 0] });
    c.part(b, P.box(0.04, 0.052, 0.052), shade(IRON, 0.8), name === 'hammer' ? { at: [0.07, 0, 0.255] } : { at: [0, 0.075, 0.07], rot: [0, Math.PI / 2, 0] });
  }
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0]);
}

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Hammering a workpiece: slow wind-up, hard strike, little rebound. */
function swing(t: number): { f: number; hit: number } {
  const u = (t / 1.15) % 1;
  let f: number;
  if (u < 0.55) f = 0.18 + 0.82 * smooth(u / 0.55);
  else if (u < 0.68) f = 1 - Math.pow(smooth((u - 0.55) / 0.13), 1.6);
  else f = 0.1 * Math.sin(Math.PI * Math.min(1, (u - 0.68) / 0.2)) + 0.18 * smooth((u - 0.7) / 0.3);
  const hit = u >= 0.66 && u < 0.78 ? Math.sin(Math.PI * (u - 0.66) / 0.12) : 0;
  return { f, hit };
}

const work: GestureFn = (g, a) => {
  const { f, hit } = swing(a.t);
  a.arm(g, 'R', lerp(0.85, 2.45, f), 0.1, 0.05, lerp(0.35, 1.7, f));
  a.arm(g, 'L', 1.05 + 0.05 * hit, 0.12, 0.05, 0.45);
  g.addRot(a.ix.torso, lerp(0.3, -0.04, f), 0.04 * (1 - f), 0);
  g.addRot(a.ix.head, 0.1 + 0.06 * (1 - f) - 0.02 * hit, 0, 0);
  for (const side of ['L', 'R'] as const) a.leg(g, side, 0.14, 0.28, 0.08);
  g.addPos(a.ix.body, 0, -0.03 * (1 - f) - 0.01 * hit, 0);
  g.rot(a.ix.handR, -0.2, 0, 0);
};

export const bram: HumanoidSpec = {
  id: 'bram', scale: 1.17, headScale: 0.96, top: 1.08,
  skin: '#e7b189', shirt: SHIRT, pants: PANTS, shoes: BOOTS, sleeve: SHIRT, forearm: 'skin', hem: -0.03,
  torso: { w: 1.42, d: 1.22, belly: 0.012 }, arm: 1.35, leg: 1.2,
  browColor: HAIR, browSize: 1.45, blush: '#e48a78', noseScale: 1.25,
  gait: { freq: 0.8, swing: 0.85, bob: 0.9 },
  decorate,
  gestures: { work },
  animate(F, a) {
    const holding = a.ease('hammer', a.w.work > 0.1 ? 1 : 0, 7);
    const belt = Math.max(1e-4, 1 - holding);
    const hand = Math.max(1e-4, holding);
    F.scale(a.ix.hammer, hand, hand, hand);
    F.scale(a.ix.hammerBelt, belt, belt, belt);
    F.rot(a.ix.hammerBelt, 0, 0, 0.1 * Math.sin(a.phase) * a.walkW);
  },
};

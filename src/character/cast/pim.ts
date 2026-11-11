import * as P from '../parts';
import { both, stringBones } from './common';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { skullShell, torsoRing, torsoSection } from '../humanoid';
import { smoothstep } from '../animator';

/** Pim: small kid. Red short jacket, big head, flies a kite on a long string. */
const JACKET = '#e04a3e', JACKET_DARK = '#b3342c', CREAM = '#f6efe0', SHORTS = '#38407d', SOCK = '#f2ede0', SHOE = '#f6f1e6', HAIR = '#7a4a2a', FRECKLE = '#b96f48';
const KITE_HOME = [-0.42, 3.05, 0.3] as const;

function decorate(c: Ctx): void {
  const { head, spec } = c;
  skullShell(c, () => HAIR, { grow: 0.022, cutY: 0.07, seg: 18 });
  c.part('head', P.lathe([{ r: 0, y: 0.1 }, { r: 0.035, y: 0.03 }, { r: 0.05, y: -0.02 }, { r: 0.0, y: -0.03 }], 8), HAIR, { at: [0.02, head.cy + head.ry + 0.015, 0.05], rot: [0.5, 0, -0.5] });
  both(sign => {
    c.part('head', P.ellipsoid(0.05, 0.06, 0.06, 8, 6), HAIR, { at: [sign * (head.rx - 0.02), head.cy + 0.05, -0.03] });
    for (const [x, y] of [[0.13, -0.045], [0.165, -0.065], [0.11, -0.075]]) {
      const f = c.headPoint(sign * x * head.rx / 0.245, head.cy + y, 0.002);
      c.part('head', P.disc(0.009, 6), FRECKLE, { at: f.at, rot: f.rot });
    }
    c.part(`fore${sign > 0 ? 'L' : 'R'}`, P.band(0.0545, 0.04, 10), JACKET_DARK, { at: [0, -0.068, 0] });
  });
  // jacket: collar, hem band, zip, pockets
  torsoRing(c, 0.295, 0.035, CREAM, 0.014);
  torsoRing(c, 0.045, 0.032, JACKET_DARK, 0.007);
  c.part('torso', P.box(0.014, 0.28, 0.01), CREAM, { at: [0, 0.17, torsoSection(spec, 0.17)[1] + 0.002] });
  both(sign => c.part('torso', P.box(0.07, 0.05, 0.01), JACKET_DARK, { at: [sign * 0.085, 0.08, torsoSection(spec, 0.08)[1] + 0.002], rot: [0, sign * 0.5, 0] }));
  // shoe toe caps
  both((sign, side) => c.part(`foot${side}`, P.ellipsoid(0.056, 0.036, 0.04, 8, 5), JACKET, { at: [0, -0.04, 0.095] }));

  // the kite: a diamond overhead with a tail of bows, on a long string to the right hand
  const kite = c.bone('kite', 'body', [...KITE_HOME], 'XZY');
  c.part(kite, P.extrude([[0, 0.34], [0.22, 0.08], [0, -0.3]], 0.012), '#ef5a4c');
  c.part(kite, P.extrude([[0, 0.34], [0, -0.3], [-0.22, 0.08]], 0.012), '#ffd24a');
  c.ink(kite, P.box(0.012, 0.64, 0.012), { at: [0, 0.02, 0.01] });
  c.ink(kite, P.box(0.44, 0.012, 0.012), { at: [0, 0.08, 0.01] });
  let parent = kite, y = -0.3;
  for (let i = 1; i <= 3; i++) {
    const b = c.bone(`kt${i}`, parent, [0, y, 0], 'XZY');
    c.ink(b, P.box(0.006, 0.15, 0.006), { at: [0, -0.075, 0] });
    c.part(b, P.box(0.07, 0.034, 0.01), i % 2 ? '#3fb0a8' : '#ffd24a', { at: [0, -0.15, 0], rot: [0, 0, 0.6] });
    parent = b; y = -0.15;
  }
  stringBones(c, {
    prefix: 'string', segments: 8, radius: 0.004, channel: 'ink',
    from: out => out.set(0, -0.045, 0).applyMatrix4(c.rig.bone('handR').world),
    to: out => out.set(0, -0.02, 0).applyMatrix4(c.rig.bone('kite').world),
    sag: length => length * 0.035,
  });
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0]);
}

export const pim: HumanoidSpec = {
  id: 'pim', scale: 0.72, headScale: 1.1, top: 1.15,
  skin: '#f7cfb2', shirt: JACKET, pants: SHORTS, shoes: SHOE, shinColor: SOCK, sleeve: JACKET, hem: 0.04,
  torso: { w: 0.96, d: 0.95 }, arm: 0.92, leg: 0.95,
  blush: '#f4908a', eye: 1.1, noNose: false,
  gait: { freq: 1.25, swing: 1, bob: 1.2 },
  reach: 2.4,
  decorate,
  animate(F, a) {
    const t = a.t, ix = a.ix;
    // holding the string up with the right hand (yields to waves/cheers)
    const free = 1 - Math.max(a.w.wave, a.w.cheer, a.w.work, a.w.shrug, a.w.sit);
    const hold = free * (1 - 0.35 * a.walkW) * (1 - a.air);
    F.mixRot(ix.armR, -0.5, 0, -1.4, hold);
    F.mixRot(ix.foreR, -0.85, 0, -0.55, hold);
    F.addRot(ix.torso, -0.04 * hold, 0, 0);
    // kite drifts and tugs; its tail sways with a lag
    const sway = Math.sin(t * 0.9), gust = Math.sin(t * 0.37 + 1.3);
    F.addPos(ix.kite, 0.1 * sway + 0.05 * gust, 0.06 * Math.sin(t * 1.1), 0.06 * gust);
    F.rot(ix.kite, -0.62 + 0.09 * Math.sin(t * 1.3), 0.25 * gust, 0.2 * sway);
    for (let i = 1; i <= 3; i++) F.rot(ix[`kt${i}`], 0.25 * Math.sin(t * 2.4 - i * 0.9), 0, 0.35 * Math.sin(t * 1.9 - i * 0.8));
    // glance up at the kite from time to time
    const up = smoothstep(0.55, 0.95, Math.sin(t * 0.43 + 1.2)) * (1 - a.w.talk) * (1 - a.air);
    F.addRot(ix.head, -0.5 * up, 0.18 * up, 0);
    F.addPos(ix.eyeL, 0, 0.008 * up, 0); F.addPos(ix.eyeR, 0, 0.008 * up, 0);
    // restless hops when left alone
    const idle = 1 - a.walkW;
    const hop = Math.max(0, Math.sin(t * 2.6)) ** 6 * 0.025 * idle * free;
    F.addPos(ix.body, 0, hop, 0);
  },
};

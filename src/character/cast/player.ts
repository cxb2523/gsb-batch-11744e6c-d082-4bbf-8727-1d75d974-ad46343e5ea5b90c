import { THREAD_COLORS } from '../../chapter/data';
import { Color } from 'three';
import * as P from '../parts';
import { characterMaterials } from '../materials';
import { clamp, damp, lerp } from '../animator';
import type { Ctx, HumanoidSpec } from '../humanoid';
import { shade } from '../humanoid';

/** The player: a small courier in a knit hat with a pom-pom, carrying a big
 * spool on their back (bigger than their head). The wound thread bulk shrinks
 * with `spoolFill`, the spool turns with `spoolTurns`, and the thread (plus a
 * short dangling strand) takes the held thread's color. */

export const SPOOL_NATURAL = '#f7e0ad';
const HAT = '#f0705c', HAT_BAND = '#fde8c6', POM = '#fff3df';
const JACKET = '#4d62cb', JACKET_DARK = '#3b4aa3', PANTS = '#363b6e', BOOTS = '#c98d4f', SCARF = '#f9e9cc';
const WOOD_DARK = '#a8743f', BRASS = '#f0cd86', STRAP = '#a8703f';
const FLANGE_R = 0.265, WIND_R = 0.235, SPOOL_X = 0.18, CORE_R = 0.09;

function flange() {
  const h = 0.0175, face = '#e9b97a', ring = '#d29a58', edge = '#a56f3d';
  return P.lathe([
    { r: 0, y: h, color: face }, { r: 0.185, y: h, color: face }, { r: 0.185, y: h, color: ring }, { r: FLANGE_R - 0.012, y: h, color: ring },
    { r: FLANGE_R, y: 0, color: edge },
    { r: FLANGE_R - 0.012, y: -h, color: ring }, { r: 0.185, y: -h, color: ring }, { r: 0.185, y: -h, color: face }, { r: 0, y: -h, color: face },
  ], 20);
}

function windGeometry() {
  const half = 0.15;
  const profile = [
    { r: 0, y: half }, { r: WIND_R * 0.9, y: half }, { r: WIND_R * 0.9, y: half },
    { r: WIND_R * 0.985, y: half * 0.55 }, { r: WIND_R, y: 0 }, { r: WIND_R * 0.985, y: -half * 0.55 },
    { r: WIND_R * 0.9, y: -half }, { r: WIND_R * 0.9, y: -half }, { r: 0, y: -half },
  ];
  const seg = 16;
  const raw = P.lathe(profile, seg);
  // Helical stripes: neighbouring wraps alternate light/dark so the spool's
  // rotation reads from every angle, like crossed yarn windings.
  const c: number[] = [];
  const count = raw.p.length / 3;
  // Undyed spools show every thread color in bands around the roll (like the
  // logo); holding a thread flattens them to its color (uFlatten).
  const bands = Object.values(THREAD_COLORS).map(hex => new Color(hex));
  for (let v = 0; v < count; v++) {
    const ring = Math.floor(v / seg), k = v % seg;
    const f = ((k + ring * 2) % 4) < 2 ? 1 : 0.78;
    const band = bands[Math.floor(k * bands.length / seg) % bands.length];
    c.push(band.r * f, band.g * f, band.b * f);
  }
  raw.c = c;
  return raw;
}

function decorate(c: Ctx): void {
  const { head } = c;
  // --- knit hat ---------------------------------------------------------------
  const hat = c.bone('hat', 'head', [0, head.cy, 0], 'YXZ');
  const tip = c.bone('hatTip', hat, [0, 0.215, -0.012], 'XZY');
  c.bone('pom', tip, [0, 0.1, 0], 'XZY');
  const rx = 0.255, ry = 0.24, rz = 0.248;
  const steps = 9, cut = 1.15;
  const shell: P.ProfilePoint[] = [];
  const bandTop = 0.105 + 0.03;
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * cut;
    const y = Math.cos(a) * ry;
    shell.push({ r: Math.sin(a), y, color: y < bandTop ? HAT_BAND : HAT });
    if (k < steps && Math.cos(((k + 1) / steps) * cut) * ry < bandTop && y >= bandTop) {
      // hard color edge between crown and folded brim
      shell.push({ r: Math.sin(a) + (Math.sin(((k + 1) / steps) * cut) - Math.sin(a)) * 0.5, y: bandTop, color: HAT });
      shell.push({ r: Math.sin(a) + (Math.sin(((k + 1) / steps) * cut) - Math.sin(a)) * 0.5, y: bandTop, color: HAT_BAND });
    }
  }
  // fold the brim under with a thick roll
  const rim = shell[shell.length - 1];
  shell.push({ r: rim.r * 1.01, y: rim.y - 0.01, color: HAT_BAND }, { r: rim.r * 0.95, y: rim.y - 0.03, color: shade(HAT_BAND, 0.85) });
  c.part(hat, P.lathe(shell, 20, rx, rz), '#ffffff');
  c.part(hat, P.torus(0.226, 0.016, 20, 6), shade(HAT_BAND, 0.95), { at: [0, 0.105, 0], rot: [Math.PI / 2, 0, 0], scale: [1.0, 0.97, 1] });
  // the slouchy tip bends back and carries the pom-pom
  c.part(tip, P.lathe([{ r: 0, y: 0.15 }, { r: 0.05, y: 0.098 }, { r: 0.095, y: 0.035 }, { r: 0.12, y: -0.03 }, { r: 0.13, y: -0.07 }], 14), HAT);
  c.part('pom', P.ellipsoid(0.07, 0.065, 0.07, 9, 7), POM, { at: [0, 0.02, 0] });
  // --- scarf and straps ----------------------------------------------------------
  c.part('torso', P.torus(0.128, 0.046, 16, 7), SCARF, { at: [0, 0.285, 0.005], rot: [Math.PI / 2, 0, 0], scale: [1.02, 0.9, 1] });
  c.part('torso', P.ellipsoid(0.04, 0.065, 0.03, 8, 6), SCARF, { at: [0.05, 0.19, 0.115], rot: [0.1, 0, 0.15] });
  c.part('torso', P.box(0.2, 0.014, 0.02), JACKET_DARK, { at: [0, 0.0, 0.134], rot: [0, 0, 0] });
  for (const sign of [1, -1]) {
    c.part('torso', P.box(0.045, 0.3, 0.014), STRAP, { at: [sign * 0.1, 0.14, 0.133], rot: [0.0, sign * 0.1, sign * 0.04] });
    c.part('torso', P.box(0.045, 0.014, 0.25), STRAP, { at: [sign * 0.105, 0.292, -0.01], rot: [0, 0, sign * -0.2] });
    c.part('torso', P.box(0.012, 0.012, 0.012), BRASS, { at: [sign * 0.1, 0.0, 0.14] });
  }
  // hand-warmer cuffs
  for (const side of ['L', 'R']) c.part(`fore${side}`, P.band(0.0570, 0.042, 10), shade(SCARF, 0.98), { at: [0, -0.0850, 0] });

  // --- the spool pack -----------------------------------------------------------------
  const pack = c.bone('pack', 'torso', [0, 0.145, -0.275], 'XZY');
  const spool = c.bone('spool', pack, [0, 0, 0], 'XZY');
  const wind = c.bone('wind', spool, [0, 0, 0], 'XZY');
  const tipBone = c.bone('tip', pack, [0, -0.02, -WIND_R], 'XZY');
  c.thread(wind, windGeometry(), '#ffffff', { rot: [0, 0, Math.PI / 2] });
  c.part(spool, P.cylinder(CORE_R, CORE_R, SPOOL_X * 2, 12), WOOD_DARK, { rot: [0, 0, Math.PI / 2] });
  for (const sign of [1, -1]) {
    c.part(spool, flange(), '#ffffff', { at: [sign * SPOOL_X, 0, 0], rot: [0, 0, Math.PI / 2] });
    c.part(spool, P.cylinder(0.07, 0.07, 0.03, 10), BRASS, { at: [sign * (SPOOL_X + 0.03), 0, 0], rot: [0, 0, Math.PI / 2] });
    // three winding holes + a brass hub so the turning flange reads as a spool from the side
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3 + 0.5;
      c.part(spool, P.disc(0.042, 8), '#7a4b27', { at: [sign * (SPOOL_X + 0.0185), Math.sin(a) * 0.135, Math.cos(a) * 0.135], rot: [0, sign * Math.PI / 2, 0] });
    }
    c.part(spool, P.disc(0.02, 6), '#7a4b27', { at: [sign * (SPOOL_X + 0.0445), 0, 0], rot: [0, sign * Math.PI / 2, 0] });
  }
  // frame bar tying the spool to the straps
  c.part(pack, P.box(0.42, 0.05, 0.05), STRAP, { at: [0, 0.2, 0.2] });
  // dangling strand (thread channel so it tints with the held thread)
  const s1 = c.bone('strand1', tipBone, [0, 0, 0], 'XZY');
  const s2 = c.bone('strand2', s1, [0, -0.055, 0], 'XZY');
  const s3 = c.bone('strand3', s2, [0, -0.055, 0], 'XZY');
  for (const b of [s1, s2, s3]) c.thread(b, P.limb(0.011, 0.009, 0.055, 6, 2), '#ffffff');
  c.thread(s3, P.ellipsoid(0.02, 0.026, 0.02, 7, 5), '#ffffff', { at: [0, -0.08, 0] });
  c.attach('spoolTip', tipBone, [0, 0, 0]);
  c.attach('head', 'head', [0, head.cy, 0]);
  c.attach('hand', 'handR', [0, -0.05, 0]);
}

export const player: HumanoidSpec = {
  id: 'player', scale: 0.93, top: 1.24, alive: true,
  skin: '#f8d5b4', shirt: JACKET, pants: PANTS, shoes: BOOTS, sleeve: JACKET, blush: '#f59a8c',
  hem: 0.0, torso: { belly: 0.005 },
  reach: 0.15,
  decorate,
  animate(F, a, animator) {
    const { ix, state, dt } = a;
    const input = a.input;
    // --- spool: turns with thread laid, bulk follows what is left -----------------
    const fillTarget = clamp(input.spoolFill ?? 1, 0, 1);
    state.fill = damp(state.fill ?? fillTarget, fillTarget, 6, dt);
    const windScale = lerp(0.42, 1, state.fill);
    const radius = WIND_R * windScale;
    const turns = input.spoolTurns ?? 0;
    if (state.prevTurns === undefined) state.prevTurns = turns;
    const delta = clamp(turns - state.prevTurns, -3, 3);
    state.prevTurns = turns;
    state.angle = (state.angle ?? 0) + delta / Math.max(0.12, radius);
    F.rot(ix.spool, -state.angle, 0, 0);
    F.scale(ix.wind, 1, windScale, windScale);
    F.addPos(ix.tip, 0, 0, WIND_R - radius);
    // --- thread color follows the held thread (eased, never pops) -------------------
    const target = new Color(input.heldThread ?? '#ffffff');
    state.r = damp(state.r ?? target.r, target.r, 9, dt);
    state.g = damp(state.g ?? target.g, target.g, 9, dt);
    state.b = damp(state.b ?? target.b, target.b, 9, dt);
    state.flatten = damp(state.flatten ?? 0, input.heldThread ? 1 : 0, 9, dt);
    const thread = characterMaterials().thread;
    (thread.uniforms.uColor.value as Color).setRGB(state.r, state.g, state.b);
    thread.uniforms.uFlatten.value = state.flatten;
    // --- secondary motion: pack, hat tip, strand --------------------------------------
    const moveNow = a.move;
    const accel = state.prevMove === undefined ? 0 : clamp((moveNow - state.prevMove) / Math.max(dt, 1e-3), -9, 9);
    state.prevMove = moveNow;
    const bodyY = F.d[ix.body * 9 + 1];
    const vy = state.prevBodyY === undefined ? 0 : clamp((bodyY - state.prevBodyY) / Math.max(dt, 1e-3), -3, 3);
    state.prevBodyY = bodyY;
    const air = a.input.verticalSpeed * a.air;
    const bounce = Math.sin(a.phase * 2) * a.walkW;
    const packTarget = -0.022 * accel + 0.045 * bounce - 0.012 * air;
    const pack = a.spring('pack', packTarget, 70, 6.5);
    F.addRot(ix.pack, pack, 0, 0.02 * Math.sin(a.phase) * a.walkW);
    const tipSway = a.spring('tip', -0.12 * accel * 0.2 - 0.9 * vy * 0.12 + 0.18 * bounce, 60, 4.5);
    F.rot(ix.hatTip, -0.55 + tipSway, 0, 0.1 * Math.sin(a.phase) * a.walkW);
    F.rot(ix.pom, tipSway * 0.6, 0, 0);
    const drive = -0.05 * accel - 0.45 * vy * 0.2 + 0.1 * a.walkW * Math.sin(a.phase * 2 + 0.6) - 0.022 * air;
    const s1 = a.spring('s1', drive, 45, 3.5);
    const s2 = a.spring('s2', s1 * 0.9, 55, 3.2);
    const s3 = a.spring('s3', s2 * 0.9, 65, 3);
    const idleSway = 0.05 * Math.sin(a.t * 1.7);
    F.rot(ix.strand1, s1 + 0.04 + idleSway, 0, idleSway * 0.5);
    F.rot(ix.strand2, s2 * 0.8 + 0.04, 0, idleSway * 0.4);
    F.rot(ix.strand3, s3 * 0.8 + 0.04, 0, idleSway * 0.3);
  },
};

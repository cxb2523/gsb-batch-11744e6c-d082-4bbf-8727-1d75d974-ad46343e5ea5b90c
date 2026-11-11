import { Color, Matrix4, Object3D, Sphere, Vector3 } from 'three';
import { PALETTE } from '../art/toon';
import * as P from './parts';
import type { AnimContext, GestureFn, HumanoidAnimator, LayerName } from './animator';
import type { Stance } from '../contracts';
import { Rig, SkinBuilder, type Bone, type Pose, type EulerOrder, type Place, type Raw, type SkinMesh } from './skin';
import type { CharacterMaterials } from './materials';

/** The humanoid rig and its bare body. Outfits, hair and props are added by
 * each spec's `decorate` (see cast.ts). Units: a standard adult stands about
 * 1.05 tall bare-headed in these local units; `spec.scale` resizes the whole
 * character (the root bone's scale). +Y up, +Z face, origin between the feet.
 * Character left is +X (the side the face's +Z cross +Y points to is -X). */

export const DIM = {
  hipY: 0.30, thigh: 0.115, shin: 0.11, hipX: 0.085,
  waist: 0.33, neck: 0.30, shoulderX: 0.185, shoulderY: 0.235,
  upperArm: 0.115, foreArm: 0.10, headY: 0.19,
} as const;

export type HumanoidId = 'player' | 'wick' | 'marlo' | 'pim' | 'bram' | 'sprout' | 'sol' | 'otto' | 'ike';

export interface Gait {
  /** Stride frequency multiplier (small legs scurry faster). */
  freq: number;
  /** Arm/leg swing multiplier. */
  swing: number;
  /** Vertical bob multiplier. */
  bob: number;
}

export interface HeadSpec { rx: number; ry: number; rz: number; cy: number }

export interface HumanoidSpec {
  id: HumanoidId;
  scale: number;
  skin: string;
  /** Slightly darker/pinker skin for nose and ears. */
  skinShade?: string;
  blush?: string | null;
  shirt: string;
  pants: string;
  shoes: string;
  sleeve?: string;
  /** 'skin' = rolled sleeves (forearm bare); default sleeve color. */
  forearm?: 'sleeve' | 'skin';
  hem?: number;
  torso?: { w?: number; d?: number; belly?: number };
  arm?: number;
  leg?: number;
  headScale?: number;
  gait?: Partial<Gait>;
  /** Unscaled height of the tallest point (hat/hair included). */
  top: number;
  /** Extra bounding radius for far props (kite). */
  reach?: number;
  /** Always colored (player). */
  alive?: boolean;
  noNose?: boolean;
  noseScale?: number;
  /** Eye dot radii multiplier. */
  eye?: number;
  eyeGap?: number;
  /** Lower leg (boot/sock) color when different from the trousers. */
  shinColor?: string;
  /** Colored (non-ink) eyebrows, e.g. white bushy brows; size multiplier in `browSize`. */
  browColor?: string;
  browSize?: number;
  /** Ledge height used by the 'sit' gesture (hips rest this far above the feet's ground). */
  seat?: number;
  decorate?: (ctx: Ctx) => void;
  /** Character specific gesture layers replacing the defaults. */
  gestures?: Partial<Record<LayerName, GestureFn>>;
  stances?: Partial<Record<Exclude<Stance, 'default'>, GestureFn>>;
  /** Runs after all layers: props, secondary motion, face tweaks. */
  animate?: (final: Pose, a: AnimContext, animator: HumanoidAnimator) => void;
}

export interface Ctx {
  rig: Rig;
  skin: SkinBuilder;
  spec: HumanoidSpec;
  head: HeadSpec;
  /** Per-character scratch numbers shared between build closures and the animator. */
  state: Record<string, number>;
  /** Add colored geometry to a bone (body channel). */
  part(bone: string | Bone, raw: Raw, color: string | number | Color, place?: Place): void;
  ink(bone: string | Bone, raw: Raw, place?: Place): void;
  thread(bone: string | Bone, raw: Raw, color: string | number | Color, place?: Place): void;
  bone(name: string, parent: string | Bone, rest: readonly [number, number, number], order?: EulerOrder): Bone;
  /** Point on the head ellipsoid at (x, y) in head-local space with outward yaw/pitch. */
  headPoint(x: number, y: number, lift?: number): { at: [number, number, number]; rot: [number, number, number] };
  /** Attachments exposed to other modules. */
  attachments: Record<string, { bone: Bone; offset: Matrix4; object: Object3D }>;
  attach(name: string, bone: string | Bone, at: readonly [number, number, number]): Object3D;
}

export const INK = PALETTE.ink;

const TORSO_POINTS = (belly: number): [number, number][] => [
  [0, 0.325], [0.075, 0.318], [0.12, 0.295], [0.152, 0.25], [0.163, 0.18], [0.166 + belly * 0.5, 0.10], [0.166 + belly, 0.02],
  [0.158 + belly * 0.6, -0.04], [0.135, -0.085], [0.06, -0.10], [0, -0.103],
];

/** Half-widths (x, z) of the bare torso at torso-local height y. */
export function torsoSection(spec: HumanoidSpec, y: number): [number, number] {
  const points = TORSO_POINTS(spec.torso?.belly ?? 0);
  const w = spec.torso?.w ?? 1, d = (spec.torso?.d ?? 1) * 0.82;
  let r = 0;
  for (let k = 1; k < points.length; k++) {
    const [r1, y1] = points[k - 1], [r2, y2] = points[k];
    if (y <= y1 && y >= y2) { r = r1 + (r2 - r1) * ((y1 - y) / (y1 - y2 || 1)); break; }
  }
  return [r * w, r * d];
}

/** A thin horizontal ring hugging the torso at height y (stripes, belts, hems). */
export function torsoRing(c: Ctx, y: number, thickness: number, color: string | number | Color, lift = 0.006, bone: string | Bone = 'torso'): void {
  const [rx, rz] = torsoSection(c.spec, y);
  const h = thickness / 2;
  c.part(bone, P.lathe([{ r: 1, y: h }, { r: 1, y: -h }], 18, rx + lift, rz + lift), color, { at: [0, y, 0] });
}

/** A cap/hair shell hugging the skull, open below `cutY` (head-local, relative to skull center). */
export function skullShell(c: Ctx, colorOf: (y: number, a: number) => string | number | Color, options: { grow?: number; cutY?: number; seg?: number; rings?: number; arc?: readonly [number, number]; bone?: string | Bone; tilt?: number } = {}): void {
  const { head } = c;
  const g = options.grow ?? 0.02;
  const rings = options.rings ?? 7;
  const cut = Math.acos(clamp01((options.cutY ?? 0.1) / (head.ry + g)));
  const profile: P.ProfilePoint[] = [];
  for (let k = 0; k <= rings; k++) {
    const a = (k / rings) * cut;
    const y = Math.cos(a) * (head.ry + g);
    profile.push({ r: Math.sin(a), y, color: colorOf(y, a) });
  }
  c.part(options.bone ?? 'head', P.lathe(profile, options.seg ?? 16, head.rx + g, head.rz + g, options.arc), '#ffffff', { at: [0, head.cy, 0], rot: [options.tilt ?? 0, 0, 0] });
}

function clamp01(x: number): number { return Math.min(1, Math.max(0, x)); }

export function shade(color: string | number | Color, factor: number): Color {
  return new Color(color as Color).multiplyScalar(factor);
}
export function tint(color: string | number | Color, toward: string | number | Color, amount: number): Color {
  return new Color(color as Color).lerp(new Color(toward as Color), amount);
}

export interface HumanoidBuild {
  rig: Rig;
  meshes: SkinMesh[];
  spec: HumanoidSpec;
  attachments: Ctx['attachments'];
  height: number;
  head: HeadSpec;
  state: Record<string, number>;
}

function splitProfile(points: [number, number][], hem: number, upper: Color, lower: Color): P.ProfilePoint[] {
  const out: P.ProfilePoint[] = [];
  for (let k = 0; k < points.length; k++) {
    const [r, y] = points[k];
    if (k > 0) {
      const [r0, y0] = points[k - 1];
      if ((y0 - hem) * (y - hem) < 0) {
        const t = (hem - y0) / (y - y0);
        const rr = r0 + (r - r0) * t;
        out.push({ r: rr, y: hem, color: upper }, { r: rr, y: hem, color: lower });
      }
    }
    out.push({ r, y, color: y > hem ? upper : lower });
  }
  return out;
}

export function buildHumanoid(spec: HumanoidSpec, materials: CharacterMaterials): HumanoidBuild {
  const rig = new Rig();
  const skin = new SkinBuilder(rig);
  const hs = spec.headScale ?? 1;
  const head: HeadSpec = { rx: 0.245 * hs, ry: 0.225 * hs, rz: 0.235 * hs, cy: DIM.headY * hs };
  const attachments: Ctx['attachments'] = {};
  const boneOf = (b: string | Bone) => (typeof b === 'string' ? rig.bone(b) : b);

  const state: Record<string, number> = {};
  const ctx: Ctx = {
    rig, skin, spec, head, attachments, state,
    part: (bone, raw, color, place) => skin.add('body', boneOf(bone), raw, color, place),
    ink: (bone, raw, place) => skin.add('ink', boneOf(bone), raw, INK, place),
    thread: (bone, raw, color, place) => skin.add('thread', boneOf(bone), raw, color, place),
    bone: (name, parent, rest, order = 'XZY') => rig.add(name, boneOf(parent), rest, order),
    headPoint(x, y, lift = 0) {
      const dy = y - head.cy;
      const q = 1 - (x / head.rx) ** 2 - (dy / head.ry) ** 2;
      const z = head.rz * Math.sqrt(Math.max(0.02, q));
      const nx = x / head.rx ** 2, ny = dy / head.ry ** 2, nz = z / head.rz ** 2;
      const length = Math.hypot(nx, ny, nz);
      return {
        at: [x + (nx / length) * lift, y + (ny / length) * lift, z + (nz / length) * lift],
        rot: [-Math.asin(ny / length), Math.atan2(nx, nz), 0],
      };
    },
    attach(name, bone, at) {
      const object = new Object3D();
      object.name = name;
      const b = boneOf(bone);
      attachments[name] = { bone: b, offset: new Matrix4().makeTranslation(at[0], at[1], at[2]), object };
      return object;
    },
  };

  // --- Skeleton -----------------------------------------------------------
  const root = rig.add('root', null, [0, 0, 0], 'YXZ');
  const body = rig.add('body', root, [0, 0, 0], 'YXZ');
  const hips = rig.add('hips', body, [0, DIM.hipY, 0], 'YXZ');
  const torso = rig.add('torso', body, [0, DIM.waist, 0], 'YXZ');
  const headBone = rig.add('head', torso, [0, DIM.neck, 0], 'YXZ');
  const side = (name: string, parent: Bone, x: number, y: number) => ({ L: rig.add(`${name}L`, parent, [x, y, 0]), R: rig.add(`${name}R`, parent, [-x, y, 0]) });
  const tw0 = spec.torso?.w ?? 1;
  const hipX = DIM.hipX * (0.6 + 0.4 * tw0);
  const shoulderX = 0.152 * tw0 + 0.033;
  const thigh = side('thigh', hips, hipX, 0);
  const shin = { L: rig.add('shinL', thigh.L, [0, -DIM.thigh, 0]), R: rig.add('shinR', thigh.R, [0, -DIM.thigh, 0]) };
  const foot = { L: rig.add('footL', shin.L, [0, -DIM.shin, 0]), R: rig.add('footR', shin.R, [0, -DIM.shin, 0]) };
  const arm = side('arm', torso, shoulderX, DIM.shoulderY);
  const fore = { L: rig.add('foreL', arm.L, [0, -DIM.upperArm, 0]), R: rig.add('foreR', arm.R, [0, -DIM.upperArm, 0]) };
  const hand = { L: rig.add('handL', fore.L, [0, -DIM.foreArm, 0]), R: rig.add('handR', fore.R, [0, -DIM.foreArm, 0]) };
  const eyeX = (spec.eyeGap ?? 0.095) * hs;
  const eyeY = head.cy + 0.015 * hs;
  const eyePoint = ctx.headPoint(eyeX, eyeY, -0.012);
  const mouthPoint = ctx.headPoint(0, head.cy - 0.095 * hs, 0.002);
  const browY = head.cy + 0.075 * hs;
  const browPoint = ctx.headPoint(eyeX, browY, 0.0);
  rig.add('eyeL', headBone, eyePoint.at, 'XZY');
  rig.add('eyeR', headBone, [-eyePoint.at[0], eyePoint.at[1], eyePoint.at[2]], 'XZY');
  rig.add('mouth', headBone, mouthPoint.at, 'XZY');
  rig.add('browL', headBone, browPoint.at, 'XZY');
  rig.add('browR', headBone, [-browPoint.at[0], browPoint.at[1], browPoint.at[2]], 'XZY');

  // --- Bare body ----------------------------------------------------------
  const arms = spec.arm ?? 1, legs = spec.leg ?? 1;
  const sleeve = spec.sleeve ?? spec.shirt;
  const tw = spec.torso?.w ?? 1, td = spec.torso?.d ?? 1, belly = spec.torso?.belly ?? 0;
  const hem = spec.hem ?? -0.015;
  const torsoPoints = TORSO_POINTS(belly);
  ctx.part(torso, P.lathe(splitProfile(torsoPoints, hem, new Color(spec.shirt), new Color(spec.pants)), 16, tw, 0.82 * td), '#ffffff');
  for (const k of ['L', 'R'] as const) {
    ctx.part(thigh[k], P.limb(0.07 * legs, 0.064 * legs, DIM.thigh, 10, 2), spec.pants);
    ctx.part(shin[k], P.limb(0.064 * legs, 0.056 * legs, DIM.shin, 10, 2), spec.shinColor ?? spec.pants);
    ctx.part(foot[k], P.ellipsoid(0.06, 0.042, 0.098, 8, 5), spec.shoes, { at: [0, -0.03, 0.036] });
    ctx.part(arm[k], P.limb(0.056 * arms, 0.05 * arms, DIM.upperArm, 10, 2), sleeve);
    ctx.part(fore[k], P.limb(0.05 * arms, 0.044 * arms, DIM.foreArm, 10, 2), spec.forearm === 'skin' ? spec.skin : sleeve);
    ctx.part(hand[k], P.ellipsoid(0.058, 0.058, 0.058, 8, 5), spec.skin, { at: [0, -0.032, 0.005] });
  }

  const skinShade = spec.skinShade ?? tint(spec.skin, '#e07a6a', 0.22);
  ctx.part(headBone, P.ellipsoid(head.rx, head.ry, head.rz, 16, 10), spec.skin, { at: [0, head.cy, 0] });
  for (const sign of [1, -1]) ctx.part(headBone, P.ellipsoid(0.04 * hs, 0.052 * hs, 0.026 * hs, 6, 4), skinShade, { at: [sign * (head.rx - 0.01 * hs), head.cy - 0.005, -0.01], rot: [0, sign * 0.15, 0] });
  if (!spec.noNose) {
    const nose = ctx.headPoint(0, head.cy - 0.035 * hs, 0.004);
    const ns = spec.noseScale ?? 1;
    ctx.part(headBone, P.ellipsoid(0.03 * hs * ns, 0.027 * hs * ns, 0.03 * hs * ns, 7, 5), skinShade, { at: nose.at });
  }
  if (spec.blush !== null) {
    const cheek = spec.blush ?? '#f08a8a';
    for (const sign of [1, -1]) {
      const point = ctx.headPoint(sign * 0.15 * hs, head.cy - 0.06 * hs, 0.002);
      ctx.part(headBone, P.disc(0.038 * hs, 10), cheek, { at: point.at, rot: point.rot, scale: [1, 0.7, 1] });
    }
  }
  const ink = spec.eye ?? 1;
  for (const [name, sign] of [['eyeL', 1], ['eyeR', -1]] as const) {
    ctx.ink(name, P.ellipsoid(0.026 * ink * hs, 0.034 * ink * hs, 0.02 * hs, 8, 5), { rot: [eyePoint.rot[0], sign * eyePoint.rot[1], 0] });
  }
  ctx.ink('mouth', P.halfDisc(10), { rot: mouthPoint.rot, scale: [0.036 * hs, 0.034 * hs, 1] });
  for (const [name, sign] of [['browL', 1], ['browR', -1]] as const) {
    const bs = spec.browSize ?? 1;
    if (spec.browColor) ctx.part(name, P.ellipsoid(0.044 * hs * bs, 0.02 * hs * bs, 0.022 * hs * bs, 8, 5), spec.browColor, { rot: [browPoint.rot[0], sign * browPoint.rot[1], 0] });
    else ctx.ink(name, P.box(0.062 * hs, 0.013 * hs, 0.012 * hs), { rot: [browPoint.rot[0], sign * browPoint.rot[1], 0] });
  }

  spec.decorate?.(ctx);

  // --- Bake ---------------------------------------------------------------
  const reach = spec.reach ?? 0;
  const radius = (spec.top * 0.8 + 0.25) * spec.scale + reach;
  const bounds = new Sphere(new Vector3(0, spec.top * 0.5 * spec.scale + reach * 0.5, 0), radius + reach * 0.5);
  const meshes = skin.build({
    body: spec.alive ? materials.player : materials.body,
    ink: materials.ink,
    thread: materials.thread,
  }, bounds);
  return { rig, meshes, spec, attachments, height: spec.top * spec.scale, head, state };
}

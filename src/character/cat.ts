import { Sphere, Vector3 } from 'three';
import type { CharacterPose, Gesture } from '../contracts';
import * as P from './parts';
import { Pose, Rig, SkinBuilder, type Bone, type Place, type Raw } from './skin';
import { INK } from './humanoid';
import type { CharacterMaterials } from './materials';
import { Random, clamp, damp, smoothstep, TAU } from './animator';

/** Button the orange cat: a procedural quadruped (~0.44 tall to the ear tips). */

const ORANGE = '#f29440', STRIPE = '#d4691f', CREAM = '#fff2dc', PINK = '#f4a0a4', BELLY = '#f8c98f';

const STAND = { chest: 0.19, pelvis: 0.17 };

export interface CatBuild { rig: Rig; meshes: ReturnType<SkinBuilder['build']>; height: number; attachments: Record<string, { bone: Bone; at: [number, number, number] }> }

export function buildCat(materials: CharacterMaterials): CatBuild {
  const rig = new Rig();
  const skin = new SkinBuilder(rig);
  const part = (bone: string | Bone, raw: Raw, color: string, place?: Place) => skin.add('body', typeof bone === 'string' ? rig.bone(bone) : bone, raw, color, place);
  const ink = (bone: string | Bone, raw: Raw, place?: Place) => skin.add('ink', typeof bone === 'string' ? rig.bone(bone) : bone, raw, INK, place);

  const root = rig.add('root', null, [0, 0, 0], 'YXZ');
  const body = rig.add('body', root, [0, 0, 0], 'YXZ');
  const pelvis = rig.add('pelvis', body, [0, STAND.pelvis, -0.1], 'YXZ');
  const chest = rig.add('chest', body, [0, STAND.chest, 0.09], 'YXZ');
  const head = rig.add('head', chest, [0, 0.075, 0.1], 'YXZ');
  rig.add('earL', head, [0.058, 0.07, -0.005], 'XZY');
  rig.add('earR', head, [-0.058, 0.07, -0.005], 'XZY');
  rig.add('eyeL', head, [0.05, 0.052, 0.108], 'XZY');
  rig.add('eyeR', head, [-0.05, 0.052, 0.108], 'XZY');
  rig.add('mouth', head, [0, -0.012, 0.115], 'XZY');
  const tail = [rig.add('tail1', pelvis, [0, 0.03, -0.09], 'XZY')];
  for (let i = 2; i <= 4; i++) tail.push(rig.add(`tail${i}`, tail[tail.length - 1], [0, 0.085, 0], 'XZY'));
  for (const [name, parent, x] of [['FL', chest, 0.055], ['FR', chest, -0.055], ['BL', pelvis, 0.06], ['BR', pelvis, -0.06]] as const) {
    const upper = rig.add(`leg${name}`, parent, [x, -0.02, name[0] === 'F' ? 0.015 : 0.0], 'XZY');
    const lower = rig.add(`shin${name}`, upper, [0, -0.07, 0], 'XZY');
    rig.add(`paw${name}`, lower, [0, -0.062, 0], 'XZY');
  }

  // body: belly, haunch and chest masses, cream chest bib, stripes
  part(body, P.ellipsoid(0.085, 0.082, 0.2, 12, 8), ORANGE, { at: [0, 0.18, 0.0] });
  part(body, P.ellipsoid(0.06, 0.04, 0.14, 10, 7), BELLY, { at: [0, 0.14, 0.0] });
  part(chest, P.ellipsoid(0.09, 0.085, 0.085, 10, 7), ORANGE, { at: [0, 0, 0] });
  part(chest, P.ellipsoid(0.05, 0.06, 0.04, 9, 7), CREAM, { at: [0, -0.012, 0.062] });
  part(pelvis, P.ellipsoid(0.09, 0.088, 0.09, 10, 7), ORANGE, { at: [0, 0, 0] });
  for (const z of [-0.12, -0.04, 0.04, 0.12]) {
    const r = Math.sqrt(Math.max(0.01, 1 - (z / 0.2) ** 2));
    part(body, P.lathe([{ r: 0.86, y: 0.011 }, { r: 1.0, y: 0.011 }, { r: 1.0, y: -0.011 }, { r: 0.86, y: -0.011 }], 12, 0.085 * r + 0.004, 0.082 * r + 0.004, [Math.PI - 1.0, 2.0]), STRIPE, { at: [0, 0.18, z], rot: [Math.PI / 2, 0, 0] });
  }

  // head: skull, cheeks, muzzle, nose, ears, forehead stripes, whiskers
  part(head, P.ellipsoid(0.105, 0.088, 0.092, 14, 9), ORANGE, { at: [0, 0.04, 0.03] });
  part(head, P.ellipsoid(0.05, 0.036, 0.042, 10, 7), CREAM, { at: [0, 0.0, 0.103] });
  part(head, P.ellipsoid(0.07, 0.04, 0.05, 10, 7), CREAM, { at: [0, -0.02, 0.09] });
  part(head, P.ellipsoid(0.017, 0.012, 0.012, 7, 5), PINK, { at: [0, 0.022, 0.137] });
  for (const sign of [1, -1]) {
    const ear = sign > 0 ? 'earL' : 'earR';
    part(ear, P.lathe([{ r: 0, y: 0.098 }, { r: 0.052, y: 0.0 }, { r: 0.058, y: -0.025 }, { r: 0.0, y: -0.025 }], 6), ORANGE, { rot: [0, 0, 0], scale: [1, 1, 0.55] });
    part(ear, P.lathe([{ r: 0, y: 0.075 }, { r: 0.034, y: 0.0 }, { r: 0.034, y: -0.012 }, { r: 0.0, y: -0.012 }], 6), PINK, { at: [0, 0, 0.014], scale: [1, 1, 0.4] });
    ink(sign > 0 ? 'eyeL' : 'eyeR', P.ellipsoid(0.018, 0.028, 0.012, 8, 5), { rot: [0, sign * 0.5, 0] });
    part(head, P.ellipsoid(0.03, 0.02, 0.03, 7, 5), ORANGE, { at: [sign * 0.085, -0.015, 0.06] });
    for (let k = 0; k < 3; k++) {
      ink(head, P.box(0.06, 0.003, 0.003), { at: [sign * 0.1, 0.0 - k * 0.008 + 0.004, 0.09], rot: [0, sign * (0.9 + k * 0.1), sign * (0.08 - k * 0.1)] });
    }
    part(head, P.box(0.012, 0.03, 0.008), STRIPE, { at: [sign * 0.03, 0.1, 0.09], rot: [-0.5, 0, sign * 0.2] });
  }
  part(head, P.box(0.012, 0.035, 0.008), STRIPE, { at: [0, 0.108, 0.082], rot: [-0.55, 0, 0] });
  ink('mouth', P.halfDisc(8), { scale: [0.016, 0.012, 1] });

  // tail: striped, white tip
  tail.forEach((bone, i) => {
    const color = i === tail.length - 1 ? CREAM : i % 2 ? STRIPE : ORANGE;
    part(bone, P.limb(0.026 - i * 0.002, 0.024 - i * 0.002, 0.085, 8, 2), color, { rot: [Math.PI, 0, 0] });
    if (i === tail.length - 1) part(bone, P.ellipsoid(0.021, 0.02, 0.021, 7, 5), CREAM, { at: [0, 0.088, 0] });
  });
  // legs
  for (const name of ['FL', 'FR', 'BL', 'BR']) {
    part(`leg${name}`, P.limb(0.036, 0.029, 0.07, 8, 2), ORANGE);
    part(`shin${name}`, P.limb(0.029, 0.024, 0.062, 8, 2), ORANGE);
    part(`paw${name}`, P.ellipsoid(0.03, 0.02, 0.04, 9, 6), CREAM, { at: [0, -0.002, 0.012] });
  }

  const bounds = new Sphere(new Vector3(0, 0.22, 0), 0.5);
  const meshes = skin.build({ body: materials.body, ink: materials.ink }, bounds);
  return { rig, meshes, height: 0.44, attachments: { head: { bone: head, at: [0, 0.05, 0.03] }, hand: { bone: rig.bone('pawFR'), at: [0, 0, 0.02] } } };
}

const LAYERS: Exclude<Gesture, 'none'>[] = ['wave', 'cheer', 'talk', 'nod', 'shrug', 'work', 'sit', 'lean'];

export class CatAnimator {
  private readonly ix: Record<string, number>;
  private readonly base: Pose;
  private readonly final: Pose;
  private readonly scratch: Pose;
  private readonly random = new Random(0.37);
  private t = 0;
  private phase = 0;
  private move = 0;
  private mood = 0.3;
  private w: Record<string, number> = {};
  private sitW = 0;
  private blinkAt = 2;
  private blinkT = -1;
  private twitchAt = 3;
  private twitchT = -1;
  private twitchSide = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookW = 0;
  private glanceAt = 2;
  private glanceYaw = 0;
  private mouth = 0;
  private tailSway = 0;
  private lickAt = 8;

  constructor(private readonly build: CatBuild) {
    this.ix = build.rig.ix;
    this.base = build.rig.makePose();
    this.final = build.rig.makePose();
    this.scratch = build.rig.makePose();
    for (const name of LAYERS) this.w[name] = 0;
  }

  update(input: CharacterPose, look: Vector3 | null): void {
    const dt = clamp(input.dt, 0, 0.1);
    this.t += dt;
    const t = this.t, ix = this.ix, B = this.base.reset();
    this.move = damp(this.move, clamp(input.moving, 0, 1.4), 9, dt);
    const m = this.move;
    const walkW = smoothstep(0.04, 0.3, m);
    this.phase += dt * TAU * (1.0 + 2.2 * clamp(m, 0, 1.4));
    this.mood = damp(this.mood, clamp(input.mood ?? 0.3, -1, 1), 3, dt);
    const mood = this.mood;
    const want = input.gesture ?? 'none';
    let sum = 0;
    for (const name of LAYERS) {
      const target = name === want || (name === 'talk' && input.talking && want === 'none') ? 1 : 0;
      this.w[name] = damp(this.w[name], target, target ? 7 : 5, dt);
      sum += this.w[name];
    }
    const norm = sum > 1 ? 1 / sum : 1;
    this.sitW = this.w.sit * norm;

    // idle: breath, tail sway, subtle weight shifts
    const breath = Math.sin(t * 2.4);
    B.scale(ix.body, 1 + 0.01 * breath, 1 + 0.018 * breath, 1);
    const idleW = 1 - walkW;
    this.tailSway = damp(this.tailSway, 0.25 + 0.2 * mood, 3, dt);
    const sway = Math.sin(t * (1.6 + 0.8 * clamp(mood, 0, 1)));
    const lift = 0.9 + 0.55 * clamp(mood + 0.3, 0, 1.2) - 0.5 * walkW;
    B.rot(ix.tail1, -(0.35 + lift * 0.3), 0, sway * 0.2 * this.tailSway * 2);
    B.rot(ix.tail2, -0.1 + 0.1 * sway, 0, sway * 0.25);
    B.rot(ix.tail3, 0.18 + 0.1 * Math.sin(t * 1.6 - 0.7), 0, sway * 0.3);
    B.rot(ix.tail4, 0.34 + 0.12 * Math.sin(t * 1.6 - 1.4), 0, sway * 0.35);
    B.addRot(ix.chest, 0.03 * breath * idleW, 0, 0);

    // walk: diagonal pairs, spine wiggle, head counter-bob, tail trailing
    if (walkW > 0.002) {
      const A = 0.55 * (0.4 + 0.6 * Math.min(1, m)) * walkW;
      for (const [name, off] of [['FL', 0], ['BR', 0.0], ['FR', Math.PI], ['BL', Math.PI]] as const) {
        const phi = this.phase + off + (name[0] === 'B' ? 0.35 : 0);
        const s = A * Math.sin(phi);
        const flex = (0.35 + 0.7 * Math.max(0, Math.cos(phi))) * walkW;
        B.addRot(ix[`leg${name}`], -s, 0, 0);
        B.addRot(ix[`shin${name}`], flex * (name[0] === 'B' ? 0.8 : 0.6), 0, 0);
        B.addRot(ix[`paw${name}`], (s - flex * 0.5) * 0.5, 0, 0);
      }
      B.addRot(ix.chest, 0, 0.1 * walkW * Math.sin(this.phase), 0.04 * walkW * Math.sin(this.phase));
      B.addRot(ix.pelvis, 0, -0.1 * walkW * Math.sin(this.phase), -0.04 * walkW * Math.sin(this.phase));
      B.addPos(ix.body, 0, 0.008 * walkW * Math.cos(this.phase * 2), 0);
      B.addRot(ix.head, 0.02 * walkW * Math.cos(this.phase * 2), -0.1 * walkW * Math.sin(this.phase), 0);
      B.addRot(ix.tail1, 0.2 * walkW, 0, 0.3 * walkW * Math.sin(this.phase - 1));
    }

    // layers
    const F = this.final.copy(B);
    for (const name of LAYERS) {
      const weight = this.w[name] * norm;
      if (weight < 0.002) continue;
      this.scratch.copy(B);
      this.layer(this.scratch, name, t);
      F.blendDelta(this.scratch, B, weight);
    }

    // head & eyes
    this.updateLook(look, dt);
    F.addRot(ix.head, this.lookPitch * 0.8, this.lookYaw * 0.8, 0);
    F.addRot(ix.chest, 0, this.lookYaw * 0.15, 0);
    // ears: perk when happy, flatten when glum, twitch now and then
    if (this.twitchT < 0 && t > this.twitchAt) { this.twitchT = 0; this.twitchSide = this.random.next() < 0.5 ? 1 : -1; }
    let twitch = 0;
    if (this.twitchT >= 0) {
      this.twitchT += dt;
      twitch = Math.sin(clamp(this.twitchT / 0.28) * Math.PI * 3) * (1 - clamp(this.twitchT / 0.28)) * 0.5;
      if (this.twitchT > 0.28) { this.twitchT = -1; this.twitchAt = t + this.random.range(2.5, 7); }
    }
    const flat = clamp(-mood, 0, 1) * 0.5 + this.w.shrug * 0.4;
    F.rot(ix.earL, 0.1 * mood, 0, 0.2 + flat + (this.twitchSide > 0 ? twitch : 0));
    F.rot(ix.earR, 0.1 * mood, 0, -0.2 - flat + (this.twitchSide < 0 ? twitch : 0));
    // blink
    if (this.blinkT < 0 && t > this.blinkAt) this.blinkT = 0;
    let lid = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      lid = Math.sin(clamp(this.blinkT / 0.16) * Math.PI);
      if (this.blinkT > 0.16) { this.blinkT = -1; this.blinkAt = t + this.random.range(1.8, 5.5); }
    }
    const sleepy = 0.35 * this.sitW * (0.5 + 0.5 * Math.sin(t * 0.3));
    const eye = clamp(1 - 0.92 * lid - sleepy, 0.06, 1);
    F.scale(ix.eyeL, 1, eye, 1); F.scale(ix.eyeR, 1, eye, 1);
    // mouth: meow when talking
    const talking = !!input.talking || want === 'talk';
    const open = talking ? 0.5 + 0.5 * Math.sin(t * 9 + Math.sin(t * 3)) : 0;
    this.mouth = damp(this.mouth, open, 18, dt);
    F.scale(ix.mouth, 1 + this.mouth * 0.4, 0.5 + this.mouth * 2.6, 1);

    // ground contact: lowest paw sits on the floor
    this.build.rig.apply(F);
    let lowest = Infinity;
    for (const name of ['pawFL', 'pawFR', 'pawBL', 'pawBR']) {
      const w = this.build.rig.bones[ix[name]].world.elements;
      lowest = Math.min(lowest, w[13] - 0.02 * w[5]);
    }
    const hip = this.build.rig.bones[ix.pelvis].world.elements;
    lowest = Math.min(lowest, hip[13] - 0.085 * hip[5] - 0.005);
    const shift = clamp(-lowest, -0.1, 0.1);
    if (Math.abs(shift) > 1e-5) { F.addPos(ix.body, 0, shift, 0); this.build.rig.apply(F); }
  }

  private layer(g: Pose, name: Exclude<Gesture, 'none'>, t: number): void {
    const ix = this.ix;
    switch (name) {
      case 'sit': {
        // the whole spine pitches up around the haunches; front legs stay vertical, rear legs fold
        g.rot(ix.body, -0.85, 0, 0);
        g.rot(ix.chest, 0.05, 0, 0);
        g.rot(ix.head, 0.78, 0, 0);
        g.rot(ix.pelvis, 0.75, 0, 0);
        for (const side of ['FL', 'FR']) {
          g.rot(ix[`leg${side}`], 0.8, 0, side === 'FL' ? 0.04 : -0.04);
          g.rot(ix[`shin${side}`], 0.0, 0, 0);
          g.rot(ix[`paw${side}`], 0.05, 0, 0);
        }
        for (const side of ['BL', 'BR']) {
          const sign = side === 'BL' ? 1 : -1;
          g.rot(ix[`leg${side}`], -1.45, 0, sign * 0.3);
          g.rot(ix[`shin${side}`], 2.35, 0, 0);
          g.rot(ix[`paw${side}`], -0.9, 0, 0);
        }
        g.rot(ix.tail1, -1.55, 0, 0.35);
        g.rot(ix.tail2, -0.1, 0, 0.7 + 0.05 * Math.sin(t * 1.4));
        g.rot(ix.tail3, 0.0, 0, 0.7);
        g.rot(ix.tail4, 0.0, 0, 0.6 + 0.15 * Math.sin(t * 2.2));
        break;
      }
      case 'wave': {
        g.rot(ix.legFR, -1.6, 0, -0.35);
        g.rot(ix.shinFR, 0.9 + 0.5 * Math.sin(t * 11), 0, 0);
        g.addRot(ix.head, 0, 0.08, -0.1);
        g.addRot(ix.chest, -0.12, 0, 0);
        g.addPos(ix.chest, 0, 0.02, 0);
        break;
      }
      case 'cheer': {
        const hop = Math.abs(Math.sin(t * 7.5));
        g.addPos(ix.body, 0, 0.09 * hop, 0);
        g.rot(ix.legFL, -1.8, 0, 0.5); g.rot(ix.legFR, -1.8, 0, -0.5);
        g.rot(ix.shinFL, 0.5, 0, 0); g.rot(ix.shinFR, 0.5, 0, 0);
        g.rot(ix.tail1, -0.2, 0, 0); g.rot(ix.tail2, -0.1, 0, 0); g.rot(ix.tail3, -0.05, 0, 0); g.rot(ix.tail4, 0, 0, 0);
        g.addRot(ix.chest, -0.35 + 0.1 * hop, 0, 0);
        for (const side of ['BL', 'BR']) { g.addRot(ix[`leg${side}`], 0.3 * hop, 0, 0); g.addRot(ix[`shin${side}`], 0.5 * hop, 0, 0); }
        break;
      }
      case 'talk': {
        g.addRot(ix.head, 0.06 * Math.sin(t * 7), 0.06 * Math.sin(t * 2), 0.06 * Math.sin(t * 3));
        break;
      }
      case 'nod': g.addRot(ix.head, 0.35 * Math.max(0, Math.sin(t * 10)), 0, 0); break;
      case 'shrug': {
        g.addRot(ix.head, 0.1, 0, 0.35);
        g.addRot(ix.chest, 0.08, 0, 0);
        break;
      }
      case 'work': {
        // groom a front paw
        g.rot(ix.legFR, -1.5, 0, -0.1);
        g.rot(ix.shinFR, 1.8 + 0.12 * Math.sin(t * 9), 0, 0);
        g.addRot(ix.head, 0.4 + 0.05 * Math.sin(t * 9), -0.35, 0);
        g.addRot(ix.chest, -0.1, 0, 0);
        break;
      }
      case 'lean': {
        // stretch: front down and forward, rump up
        const s = 0.5 + 0.5 * Math.sin(t * 0.8);
        g.rot(ix.chest, 0.45 + 0.05 * s, 0, 0);
        g.addPos(ix.chest, 0, -0.07, 0.04);
        g.rot(ix.legFL, -0.9, 0, 0); g.rot(ix.legFR, -0.9, 0, 0);
        g.rot(ix.head, -0.3, 0, 0);
        g.addRot(ix.pelvis, -0.1, 0, 0);
        g.addPos(ix.pelvis, 0, 0.01, 0);
        break;
      }
    }
  }

  private updateLook(look: Vector3 | null, dt: number): void {
    let wantLook = 0, yaw = 0, pitch = 0;
    if (look) {
      const dx = look.x, dy = look.y - 0.28, dz = look.z;
      const horizontal = Math.hypot(dx, dz);
      if (horizontal > 0.05) {
        const a = Math.atan2(dx, dz);
        yaw = clamp(a, -1.1, 1.1);
        pitch = clamp(-Math.atan2(dy, horizontal), -0.6, 0.5);
        wantLook = 1 - smoothstep(1.5, 2.2, Math.abs(a));
      }
    }
    this.lookW = damp(this.lookW, wantLook, 6, dt);
    if (this.t > this.glanceAt) {
      this.glanceYaw = this.random.next() < 0.3 ? 0 : this.random.range(-0.6, 0.6);
      this.glanceAt = this.t + this.random.range(1.5, 4.5);
    }
    const idleLook = (1 - this.lookW) * (1 - this.move);
    this.lookYaw = damp(this.lookYaw, this.lookW * yaw + idleLook * this.glanceYaw, 8, dt);
    this.lookPitch = damp(this.lookPitch, this.lookW * pitch, 8, dt);
  }
}

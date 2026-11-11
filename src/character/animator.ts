import type { Vector3 } from 'three';
import type { CharacterPose, Gesture, Stance } from '../contracts';
import type { Pose, Rig } from './skin';
import type { HumanoidBuild, HumanoidSpec } from './humanoid';

/** Procedural humanoid animation. The solver builds a base pose (idle +
 * locomotion + air), then adds weighted *deltas* for gestures, stances, talking
 * and looking. Every weight eases toward its target, so nothing ever pops. */

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Sole contact samples in foot-bone space: [y, z]. */
const SOLE_POINTS: [number, number][] = [[-0.072, 0.036], [-0.0595, 0.106], [-0.0595, -0.034]];

export type LayerName = Exclude<Gesture, 'none'>;
const GESTURES: LayerName[] = ['wave', 'cheer', 'talk', 'nod', 'shrug', 'work', 'sit', 'lean'];
const STANCES: Exclude<Stance, 'default'>[] = ['fold', 'hips', 'clasp', 'sill'];
/** Gestures that take over the arms (stances yield to them). */
const ARM_GESTURES: LayerName[] = ['wave', 'cheer', 'shrug', 'work', 'lean', 'sit'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

/** Deterministic pseudo random stream. */
export class Random {
  private state: number;
  constructor(seed: number) { this.state = Math.floor(seed * 4294967295) >>> 0 || 1; }
  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
}

export interface AnimContext {
  rig: Rig;
  ix: Record<string, number>;
  spec: HumanoidSpec;
  input: CharacterPose;
  t: number;
  dt: number;
  phase: number;
  move: number;
  walkW: number;
  runW: number;
  air: number;
  mood: number;
  /** Eased gesture weights. */
  w: Record<LayerName, number>;
  /** Eased stance weights. */
  stance: Record<Exclude<Stance, 'default'>, number>;
  /** Scratch numbers owned by the character (springs, timers). */
  state: Record<string, number>;
  has(bone: string): boolean;
  /** Arm: forward swing, outward abduction, twist, elbow flex, forearm outward, forearm twist (outward positive). */
  arm(g: Pose, side: 'L' | 'R', fwd: number, out: number, twist: number, elbow: number, foreOut?: number, foreTwist?: number): void;
  /** Leg: thigh forward swing, knee flex, foot pitch (toe down positive). */
  leg(g: Pose, side: 'L' | 'R', thigh: number, knee: number, foot?: number): void;
  /** Critically-damped-ish spring stored under `key`. */
  spring(key: string, target: number, k?: number, c?: number): number;
  springV(key: string): number;
  /** Smooth 0..1 envelope for a prop weight stored under `key`. */
  ease(key: string, target: number, rate?: number): number;
  /** Forward acceleration of the locomotion blend (for follow-through) and vertical body velocity. */
  accel: number;
  bobVel: number;
}

export type GestureFn = (g: Pose, a: AnimContext) => void;

export interface Frame {
  dt: number;
  input: CharacterPose;
  /** Look target in character-local space, if any. */
  look: Vector3 | null;
}

export class HumanoidAnimator {
  readonly rig: Rig;
  readonly spec: HumanoidSpec;
  private readonly ix: Record<string, number>;
  private readonly base: Pose;
  private readonly final: Pose;
  private readonly scratch: Pose;
  private readonly ctx: AnimContext;
  private readonly random: Random;
  private readonly seed: number;
  private readonly springs = new Map<string, [number, number]>();
  private readonly eases = new Map<string, number>();
  private readonly gestureFns: Record<LayerName, GestureFn>;
  private readonly stanceFns: Record<Exclude<Stance, 'default'>, GestureFn>;
  private t = 0;
  private phase = 0;
  private move = 0;
  private air = 0;
  private wasAirborne = false;
  private lastVerticalSpeed = 0;
  private airTime = 0;
  private mood = 0.45;
  private lookW = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private glanceYaw = 0;
  private glancePitch = 0;
  private glanceAt = 0;
  private blinkAt: number;
  private blinkT = -1;
  private talkEnv = 0;
  private mouth = 0;
  private prevMove = 0;
  private prevBodyY = 0;

  constructor(build: HumanoidBuild) {
    this.rig = build.rig;
    this.spec = build.spec;
    this.ix = this.rig.ix;
    this.base = this.rig.makePose();
    this.final = this.rig.makePose();
    this.scratch = this.rig.makePose();
    this.seed = hash(this.spec.id);
    this.random = new Random(this.seed);
    this.blinkAt = 1 + this.random.range(0, 3);
    this.glanceAt = this.random.range(1, 3);
    this.gestureFns = { ...DEFAULT_GESTURES, ...(this.spec.gestures ?? {}) } as Record<LayerName, GestureFn>;
    this.stanceFns = { ...DEFAULT_STANCES, ...(this.spec.stances ?? {}) } as Record<Exclude<Stance, 'default'>, GestureFn>;
    const w = {} as Record<LayerName, number>;
    for (const name of GESTURES) w[name] = 0;
    const stance = {} as Record<Exclude<Stance, 'default'>, number>;
    for (const name of STANCES) stance[name] = 0;
    const self = this;
    this.ctx = {
      rig: this.rig, ix: this.ix, spec: this.spec, input: {} as CharacterPose, t: 0, dt: 0, phase: 0, move: 0, walkW: 0, runW: 0, air: 0, mood: 0.2,
      w, stance, state: build.state, accel: 0, bobVel: 0,
      has: name => this.ix[name] !== undefined,
      arm(g, side, fwd, out, twist, elbow, foreOut = 0, foreTwist = 0) {
        const sign = side === 'L' ? 1 : -1;
        g.rot(self.ix[`arm${side}`], -fwd, sign * twist, sign * out);
        g.rot(self.ix[`fore${side}`], -elbow, sign * foreTwist, sign * foreOut);
      },
      leg(g, side, thigh, knee, foot = 0) {
        g.rot(self.ix[`thigh${side}`], -thigh, 0, 0);
        g.rot(self.ix[`shin${side}`], knee, 0, 0);
        g.rot(self.ix[`foot${side}`], foot, 0, 0);
      },
      spring: (key, target, k = 120, c = 11) => self.stepSpring(key, target, k, c),
      springV: key => self.springs.get(key)?.[1] ?? 0,
      ease: (key, target, rate = 8) => {
        const next = damp(self.eases.get(key) ?? 0, target, rate, self.ctx.dt);
        self.eases.set(key, next);
        return next;
      },
    };
  }

  private stepSpring(key: string, target: number, k: number, c: number): number {
    let s = this.springs.get(key);
    if (!s) { s = [target, 0]; this.springs.set(key, s); }
    const dt = this.ctx.dt;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      s[1] += (k * (target - s[0]) - c * s[1]) * h;
      s[0] += s[1] * h;
    }
    return s[0];
  }

  /** Kick a spring's velocity (landing squash, hat flop...). */
  impulse(key: string, amount: number): void {
    let s = this.springs.get(key);
    if (!s) { s = [0, 0]; this.springs.set(key, s); }
    s[1] += amount;
  }

  update(frame: Frame): void {
    const input = frame.input;
    const dt = clamp(frame.dt, 0, 0.1);
    this.t += dt;
    const a = this.ctx;
    a.input = input; a.dt = dt; a.t = this.t;
    const spec = this.spec;
    const ix = this.ix;
    const S = spec.scale;
    const t = this.t;
    const seed = this.seed * 17;

    // --- smoothed state ---------------------------------------------------
    this.move = damp(this.move, clamp(input.moving, 0, 1.5), 12, dt);
    const m = this.move;
    const walkW = smoothstep(0.04, 0.32, m);
    const runW = smoothstep(0.95, 1.3, m);
    const airborne = !!input.airborne;
    this.air = damp(this.air, airborne ? 1 : 0, airborne ? 22 : 16, dt);
    if (airborne && !this.wasAirborne) { this.airTime = 0; this.impulse('squash', -3.2); }
    if (!airborne && this.wasAirborne) this.impulse('squash', clamp(-this.lastVerticalSpeed * 0.9, 1.2, 6.5));
    if (airborne) this.airTime += dt;
    this.wasAirborne = airborne;
    this.lastVerticalSpeed = input.verticalSpeed;
    const gait = { freq: 1, swing: 1, bob: 1, ...spec.gait };
    const cycles = (0.95 + 1.35 * clamp(m, 0, 1.4)) * gait.freq;
    this.phase += dt * TAU * cycles;
    const phase = this.phase;
    a.phase = phase; a.move = m; a.walkW = walkW; a.runW = runW; a.air = this.air;
    const moodTarget = clamp(input.mood ?? 0.45, -1, 1);
    this.mood = damp(this.mood, moodTarget, 3.2, dt);
    a.mood = this.mood;
    const mood = this.mood;

    const want = input.gesture ?? 'none';
    let sum = 0;
    for (const name of GESTURES) {
      const target = name === want || (name === 'talk' && (input.talking && want === 'none')) ? 1 : 0;
      // the explicit talk gesture and the dialogue flag share one layer
      const slow = target ? 7 : 5;
      a.w[name] = damp(a.w[name], target, slow, dt);
      sum += a.w[name];
    }
    const norm = sum > 1 ? 1 / sum : 1;
    const stanceWant = input.stance ?? 'default';
    for (const name of STANCES) a.stance[name] = damp(a.stance[name], stanceWant === name ? 1 : 0, 4, dt);
    const talking = !!input.talking || want === 'talk';
    this.talkEnv = damp(this.talkEnv, talking ? 1 : 0, talking ? 10 : 6, dt);

    // --- base pose --------------------------------------------------------
    const B = this.base.reset();
    B.scale(ix.root, S, S, S);

    // breathing + weight shift (fade out while walking)
    const idleW = 1 - walkW;
    const breath = Math.sin(t * 1.95 + seed);
    const breathSlow = 1 + 0.5 * mood;
    B.scale(ix.torso, 1 - 0.006 * breath, 1 + 0.014 * breath * breathSlow, 1 - 0.006 * breath);
    B.addPos(ix.torso, 0, 0.003 * breath, 0);
    B.addRot(ix.armL, 0, 0, 0.018 * breath * idleW);
    B.addRot(ix.armR, 0, 0, -0.018 * breath * idleW);
    const shift = Math.sin(t * 0.43 + seed * 2.1) * (0.6 + 0.4 * Math.sin(t * 0.17 + seed));
    B.addPos(ix.hips, 0.011 * shift * idleW, 0, 0);
    B.addRot(ix.hips, 0, 0, 0.028 * shift * idleW);
    B.addRot(ix.torso, 0, 0, -0.04 * shift * idleW);
    B.addRot(ix.head, 0, 0, 0.02 * shift * idleW);
    B.addRot(ix.thighL, -0.05 * Math.max(0, shift) * idleW, 0, 0);
    B.addRot(ix.shinL, 0.09 * Math.max(0, shift) * idleW, 0, 0);
    B.addRot(ix.thighR, -0.05 * Math.max(0, -shift) * idleW, 0, 0);
    B.addRot(ix.shinR, 0.09 * Math.max(0, -shift) * idleW, 0, 0);
    // slump when glum, perk when happy
    const slump = clamp(-mood, 0, 1);
    B.addRot(ix.torso, (0.16 * slump) * idleW, 0, 0);
    B.addRot(ix.head, (0.2 * slump - 0.03 * clamp(mood, 0, 1)) * idleW, 0, 0);
    B.addRot(ix.armL, 0, 0, 0.03 * slump);
    B.addRot(ix.armR, 0, 0, -0.03 * slump);
    B.addPos(ix.armL, 0, -0.012 * slump, 0);
    B.addPos(ix.armR, 0, -0.012 * slump, 0);

    // locomotion
    if (walkW > 0.002) {
      const swing = gait.swing * lerp(0.72, 1.0, runW) * (0.35 + 0.65 * Math.min(1, m)) * walkW;
      const kneeMax = lerp(0.95, 1.5, runW) * (0.6 + 0.4 * Math.min(1, m)) * walkW;
      const armSwing = swing * lerp(0.8, 1.0, runW);
      const elbowBase = lerp(0.3, 1.15, runW);
      const bob = gait.bob * lerp(0.034, 0.07, runW) * walkW;
      const lean = (0.05 + 0.2 * runW) * walkW;
      for (const [side, off] of [['L', 0], ['R', Math.PI]] as const) {
        const phi = phase + off;
        const s = swing * Math.sin(phi);
        const lift = Math.max(0, Math.cos(phi));
        const knee = 0.14 * walkW + (kneeMax - 0.14 * walkW) * Math.pow(lift, 1.3);
        const foot = (s - knee) * 0.8;
        const sign = side === 'L' ? 1 : -1;
        B.addRot(ix[`thigh${side}`], -s, 0, 0);
        B.addRot(ix[`shin${side}`], knee, 0, 0);
        B.addRot(ix[`foot${side}`], foot, 0, 0);
        // arms swing against their own-side leg
        const forward = -armSwing * Math.sin(phi);
        const elbow = elbowBase * walkW + 0.35 * Math.max(0, forward) * (1 + runW);
        B.addRot(ix[`arm${side}`], -forward, 0, sign * (0.1 + 0.04 * runW) * walkW);
        B.addRot(ix[`fore${side}`], -elbow, 0, 0);
      }
      const phiL = phase;
      B.addPos(ix.body, 0, bob * (0.5 * Math.cos(2 * phase) + 0.5) - bob * 0.35 + runW * 0.025 * walkW * Math.abs(Math.sin(phase)), 0);
      B.addRot(ix.hips, 0, -(0.1 + 0.07 * runW) * walkW * Math.sin(phiL), 0.045 * walkW * Math.sin(phiL));
      B.addRot(ix.torso, lean, (0.12 + 0.08 * runW) * walkW * Math.sin(phiL), -0.04 * walkW * Math.sin(phiL));
      B.addRot(ix.head, -lean * 0.7 + 0.03 * walkW * Math.cos(2 * phase), -(0.04) * walkW * Math.sin(phiL), 0.03 * walkW * Math.sin(phiL));
      B.addPos(ix.hips, 0.01 * walkW * Math.sin(phiL), 0, 0);
    }

    // jump / fall
    const squash = this.stepSpring('squash', 0, 240, 17);
    if (this.air > 0.003) {
      const vy = input.verticalSpeed;
      const rise = clamp(vy / 6.3, -1.2, 1);
      const up = Math.max(0, rise), down = Math.max(0, -rise);
      const apex = 1 - clamp(Math.abs(rise) / 0.6);
      const w = this.air;
      const leap = walkW; // forward momentum makes the leap asymmetric
      const tuck = apex * (0.7 + 0.3 * (1 - leap));
      // legs
      const legL = lerp(0.2 + tuck * 0.7 - up * 0.35 + down * 0.1, 0.75 + tuck * 0.2 - up * 0.1, leap);
      const legR = lerp(0.2 + tuck * 0.7 - up * 0.35 + down * 0.1, -0.35 + tuck * 0.2, leap);
      const kneeL = lerp(0.3 + tuck * 1.0 + up * 0.35, 0.35 + tuck * 0.6, leap);
      const kneeR = lerp(0.3 + tuck * 1.0 + up * 0.35, 1.0 + tuck * 0.5, leap);
      const footDown = 0.35 + up * 0.5 - down * 0.2;
      B.mixRot(ix.thighL, -legL, 0, 0, w);
      B.mixRot(ix.thighR, -legR, 0, 0, w);
      B.mixRot(ix.shinL, kneeL, 0, 0, w);
      B.mixRot(ix.shinR, kneeR, 0, 0, w);
      B.mixRot(ix.footL, footDown, 0, 0, w);
      B.mixRot(ix.footR, footDown, 0, 0, w);
      // arms: whip up on takeoff, out for balance, high when falling
      const out = 0.9 + up * 0.7 + apex * 0.1 + down * 0.9;
      const fwd = lerp(0.25 - up * 0.15, -0.25, leap);
      for (const side of ['L', 'R'] as const) {
        const sign = side === 'L' ? 1 : -1;
        const swingBack = side === 'L' ? leap * 0.5 : -leap * 0.5;
        B.mixRot(ix[`arm${side}`], -(fwd + swingBack), 0, sign * out, w);
        B.mixRot(ix[`fore${side}`], -0.35, 0, 0, w);
      }
      B.addRot(ix.torso, w * (0.1 * up - 0.06 * down), 0, 0);
      B.addRot(ix.head, w * (-0.12 * up + 0.04 * down), 0, 0);
    }
    // squash & stretch about the feet (spring: +squash, -stretch)
    const stretch = this.air * (clamp(input.verticalSpeed / 6.3, 0, 1) * 0.1 - clamp(-input.verticalSpeed / 6.3, 0, 1) * 0.02);
    const q = squash;
    const sy = clamp(1 - q + stretch, 0.62, 1.2);
    const sxz = 1 / Math.sqrt(sy);
    B.scale(ix.body, sxz, sy, sxz);
    if (q > 0) {
      const crouch = clamp(q * 2.2, 0, 0.6) * (1 - this.air);
      B.addRot(ix.thighL, -crouch * 0.9, 0, 0); B.addRot(ix.thighR, -crouch * 0.9, 0, 0);
      B.addRot(ix.shinL, crouch * 1.5, 0, 0); B.addRot(ix.shinR, crouch * 1.5, 0, 0);
      B.addRot(ix.footL, -crouch * 0.6, 0, 0); B.addRot(ix.footR, -crouch * 0.6, 0, 0);
      B.addRot(ix.torso, crouch * 0.25, 0, 0);
      B.addPos(ix.body, 0, -crouch * 0.1, 0);
    }

    // --- layers -------------------------------------------------------------
    const F = this.final.copy(B);
    let busy = 0;
    for (const name of GESTURES) {
      const weight = a.w[name] * norm;
      if (ARM_GESTURES.includes(name)) busy = Math.max(busy, weight);
      if (name === 'talk') continue;
      this.layer(this.gestureFns[name], weight);
    }
    // talk: head nods and (when the arms are free) hand gestures
    this.layer(this.gestureFns.talk, a.w.talk * norm * (1 - busy * 0.85));
    const stanceFree = (1 - walkW) * (1 - busy) * (1 - this.air);
    for (const name of STANCES) this.layer(this.stanceFns[name], a.stance[name] * stanceFree);

    // --- look at -------------------------------------------------------------
    this.updateLook(frame, dt);
    const lookYawTotal = this.lookYaw, lookPitchTotal = this.lookPitch;
    const headYaw = clamp(lookYawTotal, -1.2, 1.2);
    F.addRot(ix.head, lookPitchTotal * 0.8, headYaw * 0.72, 0);
    F.addRot(ix.torso, lookPitchTotal * 0.1, headYaw * 0.22, 0);
    // eyes lead the head slightly
    const eyeX = clamp(headYaw * 0.012, -0.012, 0.012), eyeY = clamp(-lookPitchTotal * 0.01, -0.01, 0.01);
    F.addPos(ix.eyeL, eyeX, eyeY, 0); F.addPos(ix.eyeR, eyeX, eyeY, 0);

    // --- face -----------------------------------------------------------------
    this.updateFace(dt, mood);

    // --- character specific extras -------------------------------------------------
    const bodyY = F.d[ix.body * 9 + 1];
    a.accel = dt > 0 ? clamp((m - this.prevMove) / dt, -9, 9) : 0;
    a.bobVel = dt > 0 ? clamp((bodyY - this.prevBodyY) / dt, -3, 3) : 0;
    this.prevMove = m; this.prevBodyY = bodyY;
    spec.animate?.(F, a, this);

    this.rig.apply(F);
    // Keep the lowest foot on the ground whatever the pose (walk, crouch, gestures):
    // no sinking, no floating, and the bob follows the legs instead of fighting them.
    const plant = (1 - this.air) * (1 - clamp(a.w.sit * norm * 1.5));
    if (plant > 0.01) {
      const shift = clamp(-this.lowestSole(), -0.16 * S, 0.16 * S) / S * plant;
      if (Math.abs(shift) > 1e-5) { F.addPos(ix.body, 0, shift, 0); this.rig.apply(F); }
    }
  }

  private lowestSole(): number {
    let lowest = Infinity;
    for (const name of ['footL', 'footR']) {
      const m = this.rig.bones[this.ix[name]].world;
      for (const [y, z] of SOLE_POINTS) {
        const worldY = m.elements[1] * 0 + m.elements[5] * y + m.elements[9] * z + m.elements[13];
        if (worldY < lowest) lowest = worldY;
      }
    }
    return lowest;
  }

  private layer(fn: GestureFn, weight: number): void {
    if (weight < 0.002) return;
    this.scratch.copy(this.base);
    fn(this.scratch, this.ctx);
    this.final.blendDelta(this.scratch, this.base, weight);
  }

  private updateLook(frame: Frame, dt: number): void {
    const a = this.ctx;
    let targetYaw = 0, targetPitch = 0, wantLook = 0;
    if (frame.look) {
      const head = this.spec.scale * 0.82;
      const dx = frame.look.x, dy = frame.look.y - head, dz = frame.look.z;
      const horizontal = Math.hypot(dx, dz);
      if (horizontal > 0.05) {
        const yaw = Math.atan2(dx, dz);
        targetYaw = clamp(yaw, -1.5, 1.5);
        targetPitch = clamp(-Math.atan2(dy, horizontal), -0.45, 0.5);
        // do not wrench the neck for targets far behind
        wantLook = 1 - smoothstep(1.7, 2.4, Math.abs(yaw));
      }
    }
    this.lookW = damp(this.lookW, wantLook, 5, dt);
    // idle glance when nothing to look at
    if (this.t >= this.glanceAt) {
      const r = this.random;
      const settle = r.next() < 0.35;
      this.glanceYaw = settle ? 0 : r.range(-0.55, 0.55);
      this.glancePitch = settle ? 0 : r.range(-0.12, 0.14);
      this.glanceAt = this.t + r.range(1.6, 5.5);
    }
    const glanceStrength = (1 - this.lookW) * (1 - a.walkW * 0.8) * (1 - this.talkEnv * 0.5);
    const yaw = this.lookW * targetYaw + glanceStrength * this.glanceYaw;
    const pitch = this.lookW * targetPitch + glanceStrength * this.glancePitch;
    this.lookYaw = damp(this.lookYaw, yaw, 7, dt);
    this.lookPitch = damp(this.lookPitch, pitch, 7, dt);
  }

  private updateFace(dt: number, mood: number): void {
    const F = this.final, ix = this.ix, a = this.ctx;
    // blink (a quick lid close; sometimes twice)
    if (this.blinkT < 0 && this.t >= this.blinkAt) this.blinkT = 0;
    let lid = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.15;
      lid = Math.sin(clamp(this.blinkT / d) * Math.PI);
      if (this.blinkT >= d) {
        this.blinkT = -1;
        this.blinkAt = this.t + (this.random.next() < 0.22 ? 0.12 : this.random.range(1.8, 5));
      }
    }
    const sleepy = clamp(-mood, 0, 1) * 0.28;
    const eyeScale = clamp(1 - sleepy - 0.92 * lid, 0.06, 1);
    F.scale(ix.eyeL, 1, eyeScale, 1); F.scale(ix.eyeR, 1, eyeScale, 1);
    // brows: sad slants inner ends up; surprise/joy lifts
    const sad = clamp(-mood, 0, 1);
    const happy = clamp(mood, 0, 1);
    const talkLift = this.talkEnv * 0.5 * (0.5 + 0.5 * Math.sin(this.t * 3.1));
    F.rot(ix.browL, 0, 0, -0.32 * sad);
    F.rot(ix.browR, 0, 0, 0.32 * sad);
    const browUp = 0.012 * happy + 0.012 * talkLift + (a.w.cheer * 0.016) - 0.006 * sad;
    F.addPos(ix.browL, 0, browUp, 0); F.addPos(ix.browR, 0, browUp, 0);
    // mouth
    let open = 0;
    if (this.talkEnv > 0.01) {
      const syllable = 0.5 + 0.5 * Math.sin(this.t * 12.5 + 1.8 * Math.sin(this.t * 4.3));
      const phrase = smoothstep(-0.2, 0.35, Math.sin(this.t * 2.7 + this.seed * 9) + 0.25 * Math.sin(this.t * 6.1));
      open = this.talkEnv * (0.25 + 0.75 * Math.pow(syllable, 1.4)) * phrase;
    }
    const cheerOpen = a.w.cheer * 0.9 + a.air * 0.35 * happy;
    this.mouth = damp(this.mouth, Math.max(open, cheerOpen), 28, dt);
    const smile = clamp(mood, -1, 1);
    // closed mouth is a thin smile (or frown); open mouth is a bigger D
    const closedHeight = lerp(0.2, 0.95, clamp(smile, 0, 1)) * (smile < -0.05 ? lerp(0.2, 0.7, -smile) : 1);
    const widthBase = lerp(0.75, 1.25, clamp(smile * 0.5 + 0.5, 0, 1));
    const height = Math.max(closedHeight, 0.25 + this.mouth * 1.35 * (smile < 0 ? 0.7 : 1));
    const frown = smile < -0.12 && this.mouth < 0.25;
    F.scale(ix.mouth, widthBase * (1 - this.mouth * 0.2), height, 1);
    F.rot(ix.mouth, frown ? 0 : 0, 0, frown ? Math.PI : 0);
    F.addPos(ix.mouth, 0, frown ? -0.003 : this.mouth * -0.006, 0);
  }
}

// ---------------------------------------------------------------------------
// Default gesture layers (characters can override any of them).

function headTilt(g: Pose, a: AnimContext, pitch: number, yaw: number, roll: number): void {
  g.addRot(a.ix.head, pitch, yaw, roll);
}

export const DEFAULT_GESTURES: Record<LayerName, GestureFn> = {
  wave(g, a) {
    const t = a.t;
    a.arm(g, 'R', 0.2, 2.45, 0.1, 0.25, 0.42 * Math.sin(t * 10.5), 0);
    g.addRot(a.ix.torso, 0, -0.06, 0.04);
    headTilt(g, a, -0.02, 0.1, -0.1);
  },
  cheer(g, a) {
    const t = a.t;
    const hop = Math.abs(Math.sin(t * 7.2));
    const pump = Math.sin(t * 14.4);
    a.arm(g, 'L', 0.15, 2.6 + 0.22 * pump, 0, 0.3);
    a.arm(g, 'R', 0.15, 2.6 - 0.22 * pump, 0, 0.3);
    g.addPos(a.ix.body, 0, 0.1 * hop, 0);
    const tuck = hop;
    for (const side of ['L', 'R'] as const) a.leg(g, side, 0.25 * tuck, 0.65 * tuck + 0.05, 0.3 * tuck);
    const s = 1 + 0.07 * (hop - 0.5);
    g.scale(a.ix.body, 1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    g.addRot(a.ix.torso, -0.08 * hop, 0, 0.05 * Math.sin(t * 7.2));
    headTilt(g, a, -0.15 * hop, 0, 0.1 * Math.sin(t * 7.2));
  },
  talk(g, a) {
    const t = a.t;
    const gate = smoothstep(-0.1, 0.5, Math.sin(t * 1.3 + 1));
    const gateL = smoothstep(0.2, 0.7, Math.sin(t * 0.9 + 3.7));
    a.arm(g, 'R', 0.75 + 0.3 * Math.sin(t * 3.1), 0.35, 0, 1.0 + 0.35 * Math.sin(t * 4.3 + 1), 0, 0);
    // blend toward rest when the gesture pauses
    g.addRot(a.ix.armR, 0.55 * (1 - gate), 0, 0);
    g.addRot(a.ix.foreR, 0.65 * (1 - gate), 0, 0);
    a.arm(g, 'L', 0.55 + 0.25 * Math.sin(t * 2.3 + 2), 0.3, 0, 0.9 + 0.3 * Math.sin(t * 3.7), 0, 0);
    g.addRot(a.ix.armL, 0.45 * (1 - gateL), 0, 0);
    g.addRot(a.ix.foreL, 0.55 * (1 - gateL), 0, 0);
    headTilt(g, a, 0.05 * Math.sin(t * 5.1), 0.05 * Math.sin(t * 2.2), 0.05 * Math.sin(t * 1.7));
    g.addRot(a.ix.torso, 0.02 * Math.sin(t * 3.3), 0.05 * Math.sin(t * 1.9), 0);
  },
  nod(g, a) {
    const n = Math.max(0, Math.sin(a.t * 10.5));
    headTilt(g, a, 0.3 * n, 0, 0);
    g.addRot(a.ix.torso, 0.05 * n, 0, 0);
  },
  shrug(g, a) {
    const pulse = 0.9 + 0.1 * Math.sin(a.t * 5);
    a.arm(g, 'L', 0.25, 0.55, 0.2, 1.15 * pulse, 0.1, 0.2);
    a.arm(g, 'R', 0.25, 0.55, 0.2, 1.15 * pulse, 0.1, 0.2);
    g.addPos(a.ix.armL, 0, 0.028 * pulse, 0); g.addPos(a.ix.armR, 0, 0.028 * pulse, 0);
    headTilt(g, a, 0.04, 0, 0.14);
    g.addRot(a.ix.torso, 0, 0, -0.03);
  },
  work(g, a) {
    // generic busy loop: a tidy sweep with the right hand
    const t = a.t;
    a.arm(g, 'R', 0.8 + 0.25 * Math.sin(t * 5), 0.25, 0, 0.9);
    a.arm(g, 'L', 0.5, 0.3, 0, 0.7);
    g.addRot(a.ix.torso, 0.1 + 0.04 * Math.sin(t * 5), 0, 0);
    headTilt(g, a, 0.18, 0, 0);
  },
  sit(g, a) {
    const t = a.t;
    const seat = a.spec.seat ?? 0.14;
    g.addPos(a.ix.body, 0, seat - 0.21, 0);
    const mood = clamp(a.mood, -1, 1);
    const swingy = clamp(mood + 0.2, 0, 1);
    for (const [side, off] of [['L', 0], ['R', 1.7]] as const) {
      a.leg(g, side, 1.5, 1.5 + swingy * 0.2 * Math.sin(t * 2.4 + off), 0.15);
      g.rot(a.ix[`thigh${side}`], -1.5, 0, side === 'L' ? 0.1 : -0.1);
    }
    a.arm(g, 'L', 0.65, 0.12, 0, 1.0);
    a.arm(g, 'R', 0.65, 0.12, 0, 1.0);
    g.addRot(a.ix.torso, 0.08 + 0.2 * clamp(-mood, 0, 1), 0, 0);
    headTilt(g, a, 0.04 + 0.12 * clamp(-mood, 0, 1), 0, 0);
  },
  lean(g, a) {
    g.addRot(a.ix.torso, 0.42, 0, 0);
    a.arm(g, 'L', 1.3, 0.2, 0, 1.0);
    a.arm(g, 'R', 1.3, 0.2, 0, 1.0);
    headTilt(g, a, -0.25, 0, 0.1);
  },
};

export const DEFAULT_STANCES: Record<Exclude<Stance, 'default'>, GestureFn> = {
  // arms folded across the chest: forearms stacked, hands tucked in
  fold(g, a) {
    a.arm(g, 'L', 1.3, 0, -1.05, 1.65);
    a.arm(g, 'R', 1.18, 0, -1.15, 1.7);
    g.addRot(a.ix.torso, 0.03, 0, 0);
  },
  // fists on hips
  hips(g, a) {
    a.arm(g, 'L', 0.05, 0.6, 0, 0.3, -1.15, 0);
    a.arm(g, 'R', 0.05, 0.6, 0, 0.3, -1.15, 0);
    g.addRot(a.ix.torso, -0.03, 0, 0);
  },
  // hands clasped behind the back
  clasp(g, a) {
    a.arm(g, 'L', -0.75, 0.2, 0, 0.5, -0.8, 0);
    a.arm(g, 'R', -0.75, 0.2, 0, 0.5, -0.8, 0);
    g.addRot(a.ix.torso, 0.05, 0, 0);
    g.addRot(a.ix.head, -0.03, 0, 0);
  },
  // forearms resting on a window sill
  sill(g, a) {
    g.addRot(a.ix.torso, 0.3, 0, 0);
    a.arm(g, 'L', 1.15, 0.2, 0, 0.7);
    a.arm(g, 'R', 1.15, 0.2, 0, 0.7);
    g.addRot(a.ix.head, -0.18, 0, 0);
  },
};

import { Euler, Quaternion, Vector3 } from 'three';
import * as P from '../parts';
import type { Ctx } from '../humanoid';
import { shade, skullShell } from '../humanoid';
import type { Bone } from '../skin';
import type { AnimContext } from '../animator';
import { clamp } from '../animator';
import type { Pose } from '../skin';

/** Shared builders for cast members: knit caps, string/rope chains. */

export interface CapOptions {
  prefix?: string;
  crown: string;
  band: string;
  /** Skull-center relative y where the brim edge sits (higher = more forehead). */
  rimY?: number;
  /** Height of the folded brim. */
  brim?: number;
  grow?: number;
  /** Slouchy tip length (0 = plain dome). */
  tip?: number;
  tipTilt?: number;
  pom?: string;
}

/** A knit cap with a folded brim, a soft tip and an optional pom-pom. Creates
 * bones `${prefix}hat`, `${prefix}tip`, `${prefix}pom`. */
export function knitCap(c: Ctx, o: CapOptions): { hat: Bone; tip?: Bone; pom?: Bone } {
  const prefix = o.prefix ?? '';
  const { head } = c;
  const grow = o.grow ?? 0.024;
  const rimY = o.rimY ?? 0.1;
  const bandTop = rimY + (o.brim ?? 0.035);
  const hat = c.bone(`${prefix}hat`, 'head', [0, 0, 0], 'YXZ');
  const rings = 8;
  const cut = Math.acos(Math.min(1, rimY / (head.ry + grow)));
  const profile: P.ProfilePoint[] = [];
  for (let k = 0; k <= rings; k++) {
    const a = (k / rings) * cut;
    const y = Math.cos(a) * (head.ry + grow);
    profile.push({ r: Math.sin(a), y, color: y < bandTop ? o.band : o.crown });
    if (k < rings) {
      const y2 = Math.cos(((k + 1) / rings) * cut) * (head.ry + grow);
      if (y >= bandTop && y2 < bandTop) {
        const f = (y - bandTop) / (y - y2);
        const r = Math.sin(a) + (Math.sin(((k + 1) / rings) * cut) - Math.sin(a)) * f;
        profile.push({ r, y: bandTop, color: o.crown }, { r, y: bandTop, color: o.band });
      }
    }
  }
  const rim = profile[profile.length - 1];
  profile.push({ r: rim.r * 1.015, y: rim.y - 0.012, color: o.band }, { r: rim.r * 0.96, y: rim.y - 0.03, color: shade(o.band, 0.8) });
  c.part(hat, P.lathe(profile, 18, head.rx + grow, head.rz + grow), '#ffffff', { at: [0, head.cy, 0] });
  const rimRadius = Math.sin(cut) * (head.rx + grow);
  c.part(hat, P.torus(rimRadius * 0.985, 0.017, 20, 6), shade(o.band, 0.96), { at: [0, head.cy + rimY, 0], rot: [Math.PI / 2, 0, 0], scale: [1, (head.rz + grow) / (head.rx + grow), 1] });
  if (!o.tip) return { hat };
  const apex = head.cy + head.ry + grow;
  const tip = c.bone(`${prefix}tip`, hat, [0, apex - 0.03, -0.012], 'XZY');
  const len = o.tip;
  c.part(tip, P.lathe([{ r: 0, y: len }, { r: 0.045, y: len * 0.66 }, { r: 0.09, y: len * 0.25 }, { r: 0.115, y: -0.02 }, { r: 0.125, y: -0.07 }], 14), o.crown);
  if (!o.pom) return { hat, tip };
  const pom = c.bone(`${prefix}pom`, tip, [0, len * 0.95, 0], 'XZY');
  c.part(pom, P.ellipsoid(0.07, 0.065, 0.07, 9, 7), o.pom, { at: [0, 0.02, 0] });
  return { hat, tip, pom };
}

/** Hat tip / pom / hair follow-through. Call from a spec's `animate`. */
export function sway(F: Pose, a: AnimContext, prefix = '', rest = -0.5, amount = 1): void {
  if (!a.has(`${prefix}tip`)) return;
  const bounce = Math.sin(a.phase * 2) * a.walkW;
  const target = (-0.024 * a.accel - 0.11 * a.bobVel + 0.18 * bounce - 0.012 * a.input.verticalSpeed * a.air) * amount;
  const v = a.spring(`${prefix}tipSpring`, target, 60, 4.5);
  F.rot(a.ix[`${prefix}tip`], rest + v, 0, 0.1 * Math.sin(a.phase) * a.walkW * amount);
  if (a.has(`${prefix}pom`)) F.rot(a.ix[`${prefix}pom`], v * 0.6, 0, 0);
}

export interface StringOptions {
  prefix: string;
  segments: number;
  /** Half thickness. */
  radius: number;
  channel?: 'ink' | 'body';
  color?: string;
  /** Endpoints in character-root space; evaluated once per frame. */
  from(out: Vector3): void;
  to(out: Vector3): void;
  /** Extra sag (units) at the middle for the current frame. */
  sag?(length: number): number;
  /** 0..1 thickness scale (0 hides the chain). */
  visible?(): number;
}

const up = new Vector3(0, 1, 0);
const quat = new Quaternion();
const dirVector = new Vector3();

/** A chain of thin rods that always connects two moving points (kite string, rope). */
export function stringBones(c: Ctx, o: StringOptions): void {
  const points = Array.from({ length: o.segments + 1 }, () => new Vector3());
  const a = new Vector3(), b = new Vector3();
  const stamp = { frame: -1 };
  for (let i = 0; i < o.segments; i++) {
    const bone = c.bone(`${o.prefix}${i}`, 'root', [0, 0, 0], 'XYZ');
    if (o.channel === 'body') c.part(bone, P.box(o.radius * 2, 1, o.radius * 2), o.color ?? '#ffffff', { at: [0, 0.5, 0] });
    else c.ink(bone, P.box(o.radius * 2, 1, o.radius * 2), { at: [0, 0.5, 0] });
    bone.solve = rig => {
      if (i === 0) {
        o.from(a); o.to(b);
        const length = a.distanceTo(b);
        const sag = o.sag ? o.sag(length) : length * 0.05;
        for (let k = 0; k <= o.segments; k++) {
          const t = k / o.segments;
          points[k].lerpVectors(a, b, t);
          points[k].y -= sag * 4 * t * (1 - t);
        }
        stamp.frame++;
      }
      dirVector.subVectors(points[i + 1], points[i]);
      const length = dirVector.length();
      const thick = Math.max(1e-4, o.visible ? o.visible() : 1);
      if (length < 1e-5) { bone.world.compose(points[i], quat.identity(), dirVector.set(1e-4, 1e-4, 1e-4)); return; }
      dirVector.multiplyScalar(1 / length);
      quat.setFromUnitVectors(up, dirVector);
      bone.world.compose(points[i], quat, dirVector.set(thick, length, thick));
    };
  }
}

/** Mirror a block for both sides (+1 = character left / +X). */
export function both(fn: (sign: 1 | -1, side: 'L' | 'R') => void): void {
  fn(1, 'L');
  fn(-1, 'R');
}

export { clamp, skullShell, shade };

const heldPoint = new Vector3();
const heldQuaternion = new Quaternion();
const heldEuler = new Euler();
const heldScale = new Vector3();

/** A prop that dangles from a hand like a pendulum: it keeps its own upright
 * orientation in character space (tilted by `tilt()`) instead of following the
 * forearm, which is what a can or ladle does when swung. */
export function hangingProp(c: Ctx, name: string, hand: string, local: readonly [number, number, number], tilt: () => readonly [number, number], scale: () => number = () => 1): Bone {
  const bone = c.bone(name, 'root', [0, 0, 0], 'XYZ');
  const S = c.spec.scale;
  bone.solve = rig => {
    heldPoint.set(local[0], local[1], local[2]).applyMatrix4(rig.bone(hand).world);
    const [rx, rz] = tilt();
    heldEuler.set(rx, 0, rz, 'XYZ');
    heldQuaternion.setFromEuler(heldEuler);
    const k = Math.max(1e-4, scale()) * S;
    bone.world.compose(heldPoint, heldQuaternion, heldScale.set(k, k, k));
  };
  return bone;
}

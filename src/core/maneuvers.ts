/**
 * Pure 3D camera trajectory maneuvers, easing evaluators, and Catmull-Rom splines
 * adapted for metric Y-up Three.js space.
 */

import type { CameraCueSpec, CameraEasing, SphericalPose } from './types';
import {
  clampSphericalPose,
  cloneSphericalPose,
  directedAngleDiff,
  shortestAngleDiff,
} from './sphericalMath';

/**
 * Maps normalized cue time tRaw in [0, 1] to eased progress factor u in [0, 1].
 */
export function evaluateCameraEasing(easing: CameraEasing, tRaw: number): number {
  const t = Math.max(0, Math.min(1, tRaw));
  switch (easing) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t;
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3);
    case 'expo':
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return t < 0.5
        ? 0.5 * Math.pow(2, 20 * t - 10)
        : 1 - 0.5 * Math.pow(2, -20 * t + 10);
    case 'pop': {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const val = 1 - Math.exp(-6 * t) * Math.cos(2.5 * Math.PI * t);
      return Math.min(1.2, Math.max(0, val));
    }
    case 'accel': {
      const p = 0.4;
      const vc = 1 / (1 - p / 2);
      if (t < p) {
        return (vc / 2) * (t - (p / Math.PI) * Math.sin((Math.PI * t) / p));
      }
      const up = (vc * p) / 2;
      return up + vc * (t - p);
    }
    case 'deccel': {
      const p = 0.4;
      const vc = 1 / (1 - p / 2);
      if (t <= 1 - p) {
        return vc * t;
      }
      const tau = t - (1 - p);
      const uMid = vc * (1 - p);
      return uMid + (vc / 2) * (tau + (p / Math.PI) * Math.sin((Math.PI * tau) / p));
    }
    case 'cruise': {
      const p = 0.25;
      const vc = 1 / (1 - p);
      if (t < p) {
        return (vc / 2) * (t - (p / Math.PI) * Math.sin((Math.PI * t) / p));
      }
      if (t <= 1 - p) {
        const up = (vc * p) / 2;
        return up + vc * (t - p);
      }
      const tau = t - (1 - p);
      const uMid = 1 - (vc * p) / 2;
      return uMid + (vc / 2) * (tau + (p / Math.PI) * Math.sin((Math.PI * tau) / p));
    }
    case 'smooth':
    default:
      return 0.5 * (1 - Math.cos(Math.PI * t));
  }
}

/**
 * Standard Catmull-Rom spline evaluator for a 1D scalar.
 */
export function catmullRomScalar(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Interpolates camera roll progress between P0 and P1.
 * Preserves deliberate multi-angle rotations (e.g. roll_delta or explicit start+end)
 * while using shortest-arc unwrapping for implicit transitions.
 */
export function interpolateRoll(
  P0: SphericalPose,
  P1: SphericalPose,
  spec: CameraCueSpec,
  u: number
): number {
  if (
    spec.rollDeltaRad !== undefined ||
    (spec.rollStartRad !== undefined && spec.rollEndRad !== undefined)
  ) {
    return P0.roll + u * (P1.roll - P0.roll);
  }
  return P0.roll + u * shortestAngleDiff(P1.roll, P0.roll);
}

/**
 * Pure 3D maneuver evaluator mapping P0 -> P1 via normalized progress u in [0, 1].
 */
export function evaluateManeuverPose(
  P0: SphericalPose,
  P1: SphericalPose,
  spec: CameraCueSpec,
  tRaw: number,
  u: number,
  durationSec: number
): SphericalPose {
  const maneuver = spec.maneuver;
  const focalLengthMm =
    P0.focalLengthMm + u * (P1.focalLengthMm - P0.focalLengthMm);
  const roll = interpolateRoll(P0, P1, spec, u);

  // 1. 'cut': Instantaneous cut to destination pose
  if (maneuver === 'cut') {
    return cloneSphericalPose(P1);
  }

  // 2. 'straight' / 'dolly': Direct linear 3D interpolation
  if (maneuver === 'straight' || maneuver === 'dolly') {
    const target = {
      x: P0.target.x + u * (P1.target.x - P0.target.x),
      y: P0.target.y + u * (P1.target.y - P0.target.y),
      z: P0.target.z + u * (P1.target.z - P0.target.z),
    };
    const distance = P0.distance + u * (P1.distance - P0.distance);
    const pitch = P0.pitch + u * (P1.pitch - P0.pitch);
    const yaw = P0.yaw + u * shortestAngleDiff(P1.yaw, P0.yaw);
    return clampSphericalPose({ target, distance, pitch, yaw, roll, focalLengthMm });
  }

  // 3. 'arc' / 'swoop': 3D Quadratic Bezier arc + mid-flight distance breathing
  if (maneuver === 'arc' || maneuver === 'swoop') {
    const dx = P1.target.x - P0.target.x;
    const dy = P1.target.y - P0.target.y;
    const dz = P1.target.z - P0.target.z;
    const chordLen = Math.hypot(dx, dy, dz);

    const midX = 0.5 * (P0.target.x + P1.target.x);
    const midY = 0.5 * (P0.target.y + P1.target.y);
    const midZ = 0.5 * (P0.target.z + P1.target.z);

    const midRadDist = Math.hypot(midX, midZ);
    const radX = midRadDist > 0.05 ? midX / midRadDist : 0;
    const radZ = midRadDist > 0.05 ? midZ / midRadDist : 1;

    // In Y-up Three.js space, elevate control point slightly above chord (+Y)
    const liftY = 0.16 * chordLen;
    const bowDist = 0.14 * chordLen;
    const ctrl = {
      x: midX + radX * bowDist,
      y: midY + liftY,
      z: midZ + radZ * bowDist,
    };

    const invU = 1 - u;
    const target = {
      x: invU * invU * P0.target.x + 2 * invU * u * ctrl.x + u * u * P1.target.x,
      y: invU * invU * P0.target.y + 2 * invU * u * ctrl.y + u * u * P1.target.y,
      z: invU * invU * P0.target.z + 2 * invU * u * ctrl.z + u * u * P1.target.z,
    };

    const baseDist = P0.distance + u * (P1.distance - P0.distance);
    const breathe = spec.breathe ?? 1.12;
    const distance = baseDist * (1 + (breathe - 1) * Math.sin(Math.PI * u));
    const pitch =
      P0.pitch +
      u * (P1.pitch - P0.pitch) +
      (maneuver === 'swoop' ? 0.08 * Math.sin(Math.PI * u) : 0);
    const yaw = P0.yaw + u * shortestAngleDiff(P1.yaw, P0.yaw);

    return clampSphericalPose({ target, distance, pitch, yaw, roll, focalLengthMm });
  }

  // 4. 'orbit' / 'sweep': Continuous azimuthal turntable revolution
  if (maneuver === 'orbit' || maneuver === 'sweep') {
    const dirSign = spec.direction === 'cw' ? -1 : 1;
    let deltaTheta: number;

    if (spec.revolutions !== undefined) {
      deltaTheta = dirSign * spec.revolutions * Math.PI * 2 * u;
    } else if (spec.orbitSpeedRad !== undefined) {
      deltaTheta = dirSign * spec.orbitSpeedRad * Math.max(0.016, durationSec) * u;
    } else if (spec.yawDeltaRad !== undefined) {
      deltaTheta = spec.yawDeltaRad * u;
    } else if (
      spec.hasExplicitDirection &&
      (spec.yawRad !== undefined || spec.yawEndRad !== undefined)
    ) {
      const targetYaw = spec.yawEndRad ?? spec.yawRad!;
      const startYaw = spec.yawStartRad ?? P0.yaw;
      deltaTheta = directedAngleDiff(targetYaw, startYaw, spec.direction) * u;
    } else if (spec.yawStartRad !== undefined && spec.yawEndRad !== undefined) {
      deltaTheta = (spec.yawEndRad - spec.yawStartRad) * u;
    } else if (spec.yawRad !== undefined || spec.yawEndRad !== undefined) {
      const targetYaw = spec.yawEndRad ?? spec.yawRad!;
      const startYaw = spec.yawStartRad ?? P0.yaw;
      deltaTheta = directedAngleDiff(targetYaw, startYaw, undefined) * u;
    } else {
      deltaTheta = dirSign * (Math.PI / 4) * u;
    }

    const target = {
      x: P0.target.x + u * (P1.target.x - P0.target.x),
      y: P0.target.y + u * (P1.target.y - P0.target.y),
      z: P0.target.z + u * (P1.target.z - P0.target.z),
    };
    const distance = P0.distance + u * (P1.distance - P0.distance);
    const pitch = P0.pitch + u * (P1.pitch - P0.pitch);
    const yaw = (spec.yawStartRad ?? P0.yaw) + deltaTheta;

    return clampSphericalPose({ target, distance, pitch, yaw, roll, focalLengthMm });
  }

  // 5. 'spiral': Helical zoom & elevation orbit
  if (maneuver === 'spiral') {
    const dirSign = spec.direction === 'cw' ? -1 : 1;
    const defaultRevs = spec.revolutions ?? 0.5;
    const deltaTheta = dirSign * defaultRevs * Math.PI * 2 * u;

    const target = {
      x: P0.target.x + u * (P1.target.x - P0.target.x),
      y: P0.target.y + u * (P1.target.y - P0.target.y),
      z: P0.target.z + u * (P1.target.z - P0.target.z),
    };
    const distance = P0.distance + u * (P1.distance - P0.distance);
    const pitch = P0.pitch + u * (P1.pitch - P0.pitch);
    const yaw = (spec.yawStartRad ?? P0.yaw) + deltaTheta;

    return clampSphericalPose({ target, distance, pitch, yaw, roll, focalLengthMm });
  }

  // 6. 'dive': Fast perigee dive toward subject
  if (maneuver === 'dive') {
    const target = {
      x: P0.target.x + u * (P1.target.x - P0.target.x),
      y: P0.target.y + u * (P1.target.y - P0.target.y),
      z: P0.target.z + u * (P1.target.z - P0.target.z),
    };
    const baseDist = P0.distance + u * (P1.distance - P0.distance);
    const perigeeDip = 0.14 * Math.sin(2 * Math.PI * u);
    const distance = baseDist * (1 - perigeeDip);
    const pitch = P0.pitch + u * (P1.pitch - P0.pitch) - 0.12 * Math.sin(Math.PI * u);
    const yaw = P0.yaw + u * shortestAngleDiff(P1.yaw, P0.yaw);

    return clampSphericalPose({ target, distance, pitch, yaw, roll, focalLengthMm });
  }

  // 7. 'recoil': Immediate impact impulse kick
  if (maneuver === 'recoil') {
    const target = {
      x: P0.target.x + u * (P1.target.x - P0.target.x),
      y: P0.target.y + u * (P1.target.y - P0.target.y),
      z: P0.target.z + u * (P1.target.z - P0.target.z),
    };
    const breathe = spec.breathe ?? 1.25;
    const kick = (breathe - 1) * P0.distance * 3.5 * tRaw * Math.exp(-5.0 * tRaw);
    const distance = P0.distance + u * (P1.distance - P0.distance) + kick;
    const pitch = P0.pitch + u * (P1.pitch - P0.pitch);
    const yaw = P0.yaw + u * shortestAngleDiff(P1.yaw, P0.yaw);

    return clampSphericalPose({ target, distance, pitch, yaw, roll, focalLengthMm });
  }

  // Default fallback linear interpolation
  const target = {
    x: P0.target.x + u * (P1.target.x - P0.target.x),
    y: P0.target.y + u * (P1.target.y - P0.target.y),
    z: P0.target.z + u * (P1.target.z - P0.target.z),
  };
  const distance = P0.distance + u * (P1.distance - P0.distance);
  const pitch = P0.pitch + u * (P1.pitch - P0.pitch);
  const yaw = P0.yaw + u * shortestAngleDiff(P1.yaw, P0.yaw);
  return clampSphericalPose({ target, distance, pitch, yaw, roll, focalLengthMm });
}

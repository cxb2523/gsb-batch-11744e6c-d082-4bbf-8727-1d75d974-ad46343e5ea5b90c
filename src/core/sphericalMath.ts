/**
 * Pure spherical and Cartesian coordinate mathematics for 3D camera blocking.
 * Uses Three.js right-handed Y-up convention:
 *   +X = Stage Right
 *   +Y = Up (Floor is Y = 0)
 *   +Z = Stage Front (Toward default viewer)
 */

import type { CameraTransform3D, SphericalPose, Vec3 } from './types';
import {
  CAMERA_LIMITS,
  DEFAULT_ASPECT_RATIO,
  DEG_TO_RAD,
  RAD_TO_DEG,
} from './constants';
import { clampFocalLengthMm, focalLengthToVerticalFovDeg } from './opticsMath';

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export type SphericalPoseInput = Omit<SphericalPose, 'roll'> & {
  roll?: number;
};

export function cloneSphericalPose(pose: SphericalPoseInput): SphericalPose {
  return {
    target: { ...pose.target },
    distance: pose.distance,
    pitch: pose.pitch,
    yaw: pose.yaw,
    roll: Number.isFinite(pose.roll) ? pose.roll! : 0,
    focalLengthMm: pose.focalLengthMm,
  };
}

/**
 * Clamps a SphericalPose within valid pitch, distance, and optical bounds.
 */
export function clampSphericalPose(pose: SphericalPoseInput): SphericalPose {
  return {
    target: {
      x: Number.isFinite(pose.target.x) ? pose.target.x : 0,
      y: Number.isFinite(pose.target.y) ? pose.target.y : 0,
      z: Number.isFinite(pose.target.z) ? pose.target.z : 0,
    },
    distance: Math.max(
      CAMERA_LIMITS.MIN_DISTANCE_M,
      Math.min(
        CAMERA_LIMITS.MAX_DISTANCE_M,
        Number.isFinite(pose.distance) ? pose.distance : 5.0
      )
    ),
    pitch: Math.max(
      CAMERA_LIMITS.MIN_PITCH_RAD,
      Math.min(
        CAMERA_LIMITS.MAX_PITCH_RAD,
        Number.isFinite(pose.pitch) ? pose.pitch : 0.25
      )
    ),
    yaw: Number.isFinite(pose.yaw) ? pose.yaw : 0,
    roll: Number.isFinite(pose.roll) ? pose.roll! : 0,
    focalLengthMm: clampFocalLengthMm(pose.focalLengthMm),
  };
}

/**
 * Calculates shortest signed angular difference (in radians) from `currentRad` to `targetRad`
 * on the circle [-PI, PI], eliminating 360-degree rotation flips.
 */
export function shortestAngleDiff(targetRad: number, currentRad: number): number {
  let diff = (targetRad - currentRad) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

/**
 * Calculates signed angular difference from `currentRad` to `targetRad`.
 * When `direction` is explicitly provided ('cw' or 'ccw'), forces the rotation
 * along that direction in (0, 2*PI] or [-2*PI, 0); otherwise falls back to shortest arc [-PI, PI].
 *
 * In Three.js right-handed Y-up space (+X = stage right, +Z = downstage front):
 * - Yaw = 0 faces -Z (downstage front, 6:00 on floor clock).
 * - Yaw = +90° moves camera toward +X (stage right, 3:00 on floor clock).
 * - Increasing yaw (diff > 0) moves 6:00 -> 3:00 -> 12:00 (Counter-Clockwise / CCW).
 * - Decreasing yaw (diff < 0) moves 12:00 -> 3:00 -> 6:00 (Clockwise / CW).
 */
export function directedAngleDiff(
  targetRad: number,
  currentRad: number,
  direction?: 'cw' | 'ccw'
): number {
  const shortDiff = shortestAngleDiff(targetRad, currentRad);
  if (!direction || Math.abs(shortDiff) < 1e-6) {
    return shortDiff;
  }
  if (direction === 'ccw') {
    return shortDiff > 0 ? shortDiff : shortDiff + Math.PI * 2;
  }
  return shortDiff < 0 ? shortDiff : shortDiff - Math.PI * 2;
}

/**
 * Converts a SphericalPose into a 3D world-space CameraTransform3D.
 *
 * Equations:
 *   x = target.x + d * cos(pitch) * sin(yaw)
 *   y = target.y + d * sin(pitch)
 *   z = target.z + d * cos(pitch) * cos(yaw)
 *
 * Up-vector equation (with roll around forward sightline F):
 *   U_rolled = cos(roll) * U0 + sin(roll) * R0
 */
export function sphericalToCartesian(
  rawPose: SphericalPoseInput,
  aspectRatio = DEFAULT_ASPECT_RATIO
): CameraTransform3D {
  const pose = clampSphericalPose(rawPose);
  const cosPitch = Math.cos(pose.pitch);
  const sinPitch = Math.sin(pose.pitch);
  const sinYaw = Math.sin(pose.yaw);
  const cosYaw = Math.cos(pose.yaw);
  const cosRoll = Math.cos(pose.roll);
  const sinRoll = Math.sin(pose.roll);

  const position: Vec3 = {
    x: pose.target.x + pose.distance * cosPitch * sinYaw,
    y: pose.target.y + pose.distance * sinPitch,
    z: pose.target.z + pose.distance * cosPitch * cosYaw,
  };

  // Orthonormal unrolled camera up U0 = (-sinPitch*sinYaw, cosPitch, -sinPitch*cosYaw)
  // Orthonormal unrolled camera right R0 = (cosYaw, 0, -sinYaw)
  // U_rolled = cos(roll) * U0 + sin(roll) * R0
  const up: Vec3 = {
    x: -cosRoll * sinPitch * sinYaw + sinRoll * cosYaw,
    y: cosRoll * cosPitch,
    z: -cosRoll * sinPitch * cosYaw - sinRoll * sinYaw,
  };

  const fovDeg = focalLengthToVerticalFovDeg(pose.focalLengthMm, aspectRatio);

  return {
    pose,
    position,
    target: { ...pose.target },
    up,
    fovDeg,
    aspectRatio,
  };
}

/**
 * Inverse conversion: computes a SphericalPose from a 3D world-space eye position
 * and look-at target point (used when OrbitControls moves the camera freely).
 */
export function cartesianToSpherical(
  eye: Vec3,
  target: Vec3,
  focalLengthMm = 35,
  roll = 0
): SphericalPose {
  const dx = eye.x - target.x;
  const dy = eye.y - target.y;
  const dz = eye.z - target.z;

  const distance = Math.max(
    CAMERA_LIMITS.MIN_DISTANCE_M,
    Math.hypot(dx, dy, dz)
  );
  const horizDist = Math.hypot(dx, dz);
  const pitch = Math.atan2(dy, horizDist);
  const yaw = horizDist > 1e-5 ? Math.atan2(dx, dz) : 0;

  return clampSphericalPose({
    target: { ...target },
    distance,
    pitch,
    yaw,
    roll,
    focalLengthMm,
  });
}

/**
 * Computes the horizontal yaw angle (in radians) for an entity at `from` to face toward `to`.
 * In Three.js Y-up space, yaw = 0 faces +Z, yaw = PI/2 faces +X.
 */
export function computeLookAtYawRad(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 1e-5) {
    return 0;
  }
  return Math.atan2(dx, dz);
}

/**
 * Minimum allowable camera elevation in meters above the ground floor (Y = 0).
 */
export const MIN_FLOOR_CLEARANCE_M = 0.05;

/**
 * Maximum safe polar angle in radians (~176.4°) to prevent bottom-pole gimbal singularities.
 */
export const MAX_SAFE_POLAR_ANGLE_RAD = Math.PI * 0.98;

/**
 * Computes the maximum allowable OrbitControls polar angle (in radians) such that
 * the camera's world-space elevation never drops below `minFloorY`.
 *
 * Mathematical derivation:
 *   Y_cam = target.y + R * cos(phi) >= minFloorY
 *   cos(phi) >= (minFloorY - target.y) / R
 *
 * When the target is high in the air (target.y - minFloorY >= R), full vertical orbit
 * (up to MAX_SAFE_POLAR_ANGLE_RAD) is unlocked.
 */
export function computeFloorClampedMaxPolarAngle(
  targetY: number,
  distance: number,
  minFloorY: number = MIN_FLOOR_CLEARANCE_M,
  maxSafeAngleRad: number = MAX_SAFE_POLAR_ANGLE_RAD
): number {
  const safeDist = Math.max(0.001, distance);
  const cosMax = (minFloorY - targetY) / safeDist;

  // Fully elevated: even looking directly from below, camera remains above minFloorY
  if (cosMax <= -1.0) {
    return maxSafeAngleRad;
  }

  // Target is at or below floor clearance: clamp to horizontal or tighter
  if (cosMax >= 1.0) {
    return 0.01;
  }

  const calculatedAngle = Math.acos(cosMax);
  return Math.min(maxSafeAngleRad, calculatedAngle);
}


/**
 * Camera rig mount parser, 3D eye position kinematics, rail path sampling,
 * and inverse look-at pose evaluation (Tripod, Linear Track, and Spline Track).
 * Pure Layer 1 module with zero React or DOM dependencies.
 */

import type {
  CameraCueSpec,
  CameraRigSpec,
  CameraRigType,
  EvaluatedEntityState,
  SphericalPose,
  Vec3,
} from './types';
import { parseOptionalVec3 } from './scorePrimitives';
import {
  cartesianToSpherical,
  clampSphericalPose,
  shortestAngleDiff,
  sphericalToCartesian,
} from './sphericalMath';
import { catmullRomScalar, interpolateRoll } from './maneuvers';
import {
  ZERO_OFFSET,
  resolveShotDestOffset,
  resolveShotDestRoll,
  resolveTargetPoint3D,
} from './cameraTargetResolver';

/**
 * Parses an optional `rig:` block from a camera cue.
 */
export function parseCameraRigSpec(raw: unknown): CameraRigSpec | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const rawType = String(obj.type ?? obj.kind ?? obj.mode ?? '').trim().toLowerCase();

  let type: CameraRigType = 'tripod';
  if (
    ['track', 'dolly', 'rail', 'slider', 'linear'].includes(rawType) ||
    (rawType === '' && (obj.from !== undefined || obj.to !== undefined))
  ) {
    type = 'track';
  } else if (
    ['spline_track', 'spline-track', 'curved_track', 'curved-track', 'spline'].includes(rawType) ||
    Array.isArray(obj.points ?? obj.waypoints)
  ) {
    type = 'spline_track';
  }

  const position = parseOptionalVec3(obj.position ?? obj.pos ?? obj.at ?? obj.eye);
  const from = parseOptionalVec3(obj.from ?? obj.start);
  const to = parseOptionalVec3(obj.to ?? obj.end);

  const rawPoints = obj.points ?? obj.waypoints;
  const points: Vec3[] | undefined = Array.isArray(rawPoints)
    ? rawPoints.map((p) => parseOptionalVec3(p)).filter((p): p is Vec3 => Boolean(p))
    : undefined;

  return {
    type,
    ...(position ? { position } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(points && points.length > 0 ? { points } : {}),
  };
}

/**
 * Evaluates the 3D world-space camera nodal position on a rig at eased progress u in [0, 1].
 */
export function evaluateRigEyePosition(
  rig: CameraRigSpec,
  u: number,
  fallbackEye: Vec3
): Vec3 {
  const t = Math.max(0, Math.min(1, u));

  if (rig.type === 'tripod') {
    return rig.position ? { ...rig.position } : { ...fallbackEye };
  }

  if (rig.type === 'track') {
    const start = rig.from ?? fallbackEye;
    const end = rig.to ?? start;
    return {
      x: start.x + t * (end.x - start.x),
      y: start.y + t * (end.y - start.y),
      z: start.z + t * (end.z - start.z),
    };
  }

  // 'spline_track': Catmull-Rom interpolation across control points
  const rawPts = rig.points ?? [];
  const pts: Vec3[] =
    rawPts.length >= 2
      ? rawPts.map((p) => ({ ...p }))
      : rawPts.length === 1
      ? [{ ...fallbackEye }, { ...rawPts[0] }]
      : [{ ...fallbackEye }, { ...fallbackEye }];

  const numSegments = pts.length - 1;
  const scaledT = t * numSegments;
  const segIdx = Math.min(numSegments - 1, Math.floor(scaledT));
  const segFrac = scaledT - segIdx;

  const p0 = pts[Math.max(0, segIdx - 1)];
  const p1 = pts[segIdx];
  const p2 = pts[Math.min(pts.length - 1, segIdx + 1)];
  const p3 = pts[Math.min(pts.length - 1, segIdx + 2)];

  return {
    x: catmullRomScalar(p0.x, p1.x, p2.x, p3.x, segFrac),
    y: catmullRomScalar(p0.y, p1.y, p2.y, p3.y, segFrac),
    z: catmullRomScalar(p0.z, p1.z, p2.z, p3.z, segFrac),
  };
}

/**
 * Samples physical 3D rail coordinates for rendering in the 3D diorama.
 * Returns empty array for tripod; returns line endpoints or sampled spline points for tracks.
 */
export function sampleRigRailPoints(
  rig: CameraRigSpec,
  fallbackEye: Vec3,
  samples = 32
): Vec3[] {
  if (rig.type === 'tripod') {
    return [];
  }
  if (rig.type === 'track') {
    const start = rig.from ?? fallbackEye;
    const end = rig.to ?? start;
    return [
      { ...start },
      { ...end },
    ];
  }
  // 'spline_track'
  const points: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    points.push(evaluateRigEyePosition(rig, i / samples, fallbackEye));
  }
  return points;
}

/**
 * Evaluates the full SphericalPose for a camera mounted on a rig.
 */
export function evaluateRigCameraPose(
  P0: SphericalPose,
  spec: CameraCueSpec,
  u: number,
  entitiesById: Map<string, EvaluatedEntityState>,
  baselinePose?: SphericalPose,
  startOffset: Vec3 = ZERO_OFFSET,
  destOffset?: Vec3,
  isContinuous = false
): SphericalPose {
  const rig = spec.rig!;
  const startEye = sphericalToCartesian(P0).position;
  const eye = evaluateRigEyePosition(rig, u, startEye);

  const endOffset =
    destOffset ?? resolveShotDestOffset(spec, startOffset, isContinuous);
  const effectiveBaseline = baselinePose ?? { ...P0, roll: 0 };
  const destRoll = resolveShotDestRoll(P0, spec, effectiveBaseline, isContinuous);

  const destFocalLength =
    spec.focalLengthEndMm ?? spec.focalLengthMm ?? P0.focalLengthMm;
  const focalLengthMm = P0.focalLengthMm + u * (destFocalLength - P0.focalLengthMm);

  const P1_proto: SphericalPose = {
    ...P0,
    roll: destRoll,
    focalLengthMm: destFocalLength,
  };
  const roll = interpolateRoll(P0, P1_proto, spec, u);

  // Branch A: Target-Tracking Mode
  if (spec.target !== undefined || spec.from !== undefined) {
    const destTarget =
      spec.target !== undefined
        ? resolveTargetPoint3D(spec.target, entitiesById, P0.target, endOffset)
        : {
            x: P0.target.x + (endOffset.x - startOffset.x),
            y: P0.target.y + (endOffset.y - startOffset.y),
            z: P0.target.z + (endOffset.z - startOffset.z),
          };

    const startTarget =
      spec.from !== undefined
        ? resolveTargetPoint3D(spec.from, entitiesById, P0.target, startOffset)
        : {
            x: destTarget.x - (endOffset.x - startOffset.x),
            y: destTarget.y - (endOffset.y - startOffset.y),
            z: destTarget.z - (endOffset.z - startOffset.z),
          };

    const currentTarget: Vec3 = {
      x: startTarget.x + u * (destTarget.x - startTarget.x),
      y: startTarget.y + u * (destTarget.y - startTarget.y),
      z: startTarget.z + u * (destTarget.z - startTarget.z),
    };

    return cartesianToSpherical(eye, currentTarget, focalLengthMm, roll);
  }

  // Branch B: Fixed or Animated Gaze Mode (No Target Lock)
  let destYaw = P0.yaw;
  if (spec.yawEndRad !== undefined) {
    destYaw = spec.yawEndRad;
  } else if (spec.yawRad !== undefined) {
    destYaw = spec.yawRad;
  } else if (spec.yawDeltaRad !== undefined) {
    destYaw = P0.yaw + spec.yawDeltaRad;
  }

  const destPitch =
    spec.pitchEndRad ?? spec.pitchRad ?? P0.pitch;
  const currentPitch = P0.pitch + u * (destPitch - P0.pitch);
  const currentYaw = P0.yaw + u * shortestAngleDiff(destYaw, P0.yaw);

  const refDist = Math.max(
    0.4,
    spec.distanceEnd ?? spec.distance ?? P0.distance
  );
  const cosP = Math.cos(currentPitch);
  const sinP = Math.sin(currentPitch);
  const sinY = Math.sin(currentYaw);
  const cosY = Math.cos(currentYaw);

  // Derive target anchor T so that sphericalToCartesian(T, dist, pitch, yaw) yields eye
  const target: Vec3 = {
    x: eye.x - refDist * cosP * sinY,
    y: eye.y - refDist * sinP,
    z: eye.z - refDist * cosP * cosY,
  };

  return clampSphericalPose({
    target,
    distance: refDist,
    pitch: currentPitch,
    yaw: currentYaw,
    roll,
    focalLengthMm,
  });
}

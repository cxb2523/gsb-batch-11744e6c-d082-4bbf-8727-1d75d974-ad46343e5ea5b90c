/**
 * Single-shot camera pose evaluator, Catmull-Rom multi-waypoint spline interpolator,
 * and 32-point 3D world-space trajectory curve sampler.
 * Pure Layer 1 module with zero React or DOM dependencies.
 */

import type {
  CameraCueSpec,
  EvaluatedEntityState,
  SphericalPose,
  Vec3,
} from './types';
import {
  catmullRomScalar,
  evaluateCameraEasing,
  evaluateManeuverPose,
} from './maneuvers';
import {
  clampSphericalPose,
  cloneSphericalPose,
  shortestAngleDiff,
  sphericalToCartesian,
} from './sphericalMath';
import {
  ZERO_OFFSET,
  resolveShotDestOffset,
  resolveShotDestRoll,
  resolveTargetPoint3D,
} from './cameraTargetResolver';
import { evaluateRigCameraPose } from './cameraRigEvaluator';

/**
 * Evaluates a Catmull-Rom spline camera path across multiple waypoints.
 */
export function evaluateSplineCameraPose(
  startPose: SphericalPose,
  spec: CameraCueSpec,
  u: number,
  entitiesById: Map<string, EvaluatedEntityState>
): SphericalPose {
  const rawWaypoints = spec.waypoints ?? [];
  if (rawWaypoints.length === 0) {
    return cloneSphericalPose(startPose);
  }

  const resolvedWaypoints: SphericalPose[] = [cloneSphericalPose(startPose)];
  for (const wp of rawWaypoints) {
    const prev = resolvedWaypoints[resolvedWaypoints.length - 1];
    const target =
      wp.target !== undefined
        ? resolveTargetPoint3D(
            wp.target,
            entitiesById,
            prev.target,
            wp.targetOffset
          )
        : wp.targetOffset !== undefined
        ? {
            x: prev.target.x + wp.targetOffset.x,
            y: prev.target.y + wp.targetOffset.y,
            z: prev.target.z + wp.targetOffset.z,
          }
        : { ...prev.target };
    resolvedWaypoints.push(
      clampSphericalPose({
        target,
        distance: wp.distance ?? prev.distance,
        pitch: wp.pitchRad ?? prev.pitch,
        yaw: wp.yawRad ?? prev.yaw,
        roll: wp.rollRad ?? prev.roll,
        focalLengthMm: wp.focalLengthMm ?? prev.focalLengthMm,
      })
    );
  }

  if (resolvedWaypoints.length === 1) {
    return resolvedWaypoints[0];
  }

  // Unwrap yaw and roll angles across waypoints to prevent 360-deg spin flips
  for (let i = 1; i < resolvedWaypoints.length; i++) {
    const prevYaw = resolvedWaypoints[i - 1].yaw;
    const currYaw = resolvedWaypoints[i].yaw;
    resolvedWaypoints[i].yaw = prevYaw + shortestAngleDiff(currYaw, prevYaw);

    const prevRoll = resolvedWaypoints[i - 1].roll;
    const currRoll = resolvedWaypoints[i].roll;
    resolvedWaypoints[i].roll = prevRoll + shortestAngleDiff(currRoll, prevRoll);
  }

  const numSegments = resolvedWaypoints.length - 1;
  const scaledT = Math.max(0, Math.min(1, u)) * numSegments;
  const segIdx = Math.min(numSegments - 1, Math.floor(scaledT));
  const segFrac = scaledT - segIdx;

  const p0 = resolvedWaypoints[Math.max(0, segIdx - 1)];
  const p1 = resolvedWaypoints[segIdx];
  const p2 = resolvedWaypoints[Math.min(resolvedWaypoints.length - 1, segIdx + 1)];
  const p3 = resolvedWaypoints[Math.min(resolvedWaypoints.length - 1, segIdx + 2)];

  return clampSphericalPose({
    target: {
      x: catmullRomScalar(
        p0.target.x,
        p1.target.x,
        p2.target.x,
        p3.target.x,
        segFrac
      ),
      y: catmullRomScalar(
        p0.target.y,
        p1.target.y,
        p2.target.y,
        p3.target.y,
        segFrac
      ),
      z: catmullRomScalar(
        p0.target.z,
        p1.target.z,
        p2.target.z,
        p3.target.z,
        segFrac
      ),
    },
    distance: catmullRomScalar(
      p0.distance,
      p1.distance,
      p2.distance,
      p3.distance,
      segFrac
    ),
    pitch: catmullRomScalar(p0.pitch, p1.pitch, p2.pitch, p3.pitch, segFrac),
    yaw: catmullRomScalar(p0.yaw, p1.yaw, p2.yaw, p3.yaw, segFrac),
    roll: catmullRomScalar(p0.roll, p1.roll, p2.roll, p3.roll, segFrac),
    focalLengthMm: catmullRomScalar(
      p0.focalLengthMm,
      p1.focalLengthMm,
      p2.focalLengthMm,
      p3.focalLengthMm,
      segFrac
    ),
  });
}

/**
 * Evaluates a single shot's camera pose at normalized progress tRaw in [0, 1].
 */
export function evaluateShotCameraPose(
  P0: SphericalPose,
  spec: CameraCueSpec,
  tRaw: number,
  durationSec: number,
  entitiesById: Map<string, EvaluatedEntityState>,
  baselinePose?: SphericalPose,
  startOffset: Vec3 = ZERO_OFFSET,
  destOffset?: Vec3,
  isContinuous = false
): SphericalPose {
  const u = evaluateCameraEasing(spec.easing, tRaw);

  if (spec.rig) {
    return evaluateRigCameraPose(
      P0,
      spec,
      u,
      entitiesById,
      baselinePose,
      startOffset,
      destOffset,
      isContinuous
    );
  }

  if (spec.maneuver === 'spline' && spec.waypoints && spec.waypoints.length > 0) {
    return evaluateSplineCameraPose(P0, spec, u, entitiesById);
  }

  const endOffset =
    destOffset ?? resolveShotDestOffset(spec, startOffset, isContinuous);
  const destTarget =
    spec.target !== undefined
      ? resolveTargetPoint3D(spec.target, entitiesById, P0.target, endOffset)
      : {
          x: P0.target.x + (endOffset.x - startOffset.x),
          y: P0.target.y + (endOffset.y - startOffset.y),
          z: P0.target.z + (endOffset.z - startOffset.z),
        };

  let destYaw = P0.yaw;
  if (spec.yawEndRad !== undefined) {
    destYaw = spec.yawEndRad;
  } else if (spec.yawRad !== undefined) {
    destYaw = spec.yawRad;
  } else if (spec.yawDeltaRad !== undefined) {
    destYaw = P0.yaw + spec.yawDeltaRad;
  }

  const effectiveBaseline = baselinePose ?? { ...P0, roll: 0 };
  const destRoll = resolveShotDestRoll(P0, spec, effectiveBaseline, isContinuous);

  const P1: SphericalPose = clampSphericalPose({
    target: destTarget,
    distance: spec.distanceEnd ?? spec.distance ?? P0.distance,
    pitch: spec.pitchEndRad ?? spec.pitchRad ?? P0.pitch,
    yaw: destYaw,
    roll: destRoll,
    focalLengthMm:
      spec.focalLengthEndMm ?? spec.focalLengthMm ?? P0.focalLengthMm,
  });

  return evaluateManeuverPose(P0, P1, spec, tRaw, u, durationSec);
}

/**
 * Samples 3D world-space camera eye positions along a shot's trajectory for visual path rendering.
 */
export function sampleTrajectoryPoints(
  P0: SphericalPose,
  spec: CameraCueSpec,
  durationSec: number,
  entitiesById: Map<string, EvaluatedEntityState>,
  aspectRatio: number,
  baselinePose?: SphericalPose,
  startOffset: Vec3 = ZERO_OFFSET,
  destOffset?: Vec3,
  isContinuous = false,
  samples = 32
): Vec3[] {
  if (spec.maneuver === 'cut') {
    return [];
  }
  const points: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pose = evaluateShotCameraPose(
      P0,
      spec,
      t,
      durationSec,
      entitiesById,
      baselinePose,
      startOffset,
      destOffset,
      isContinuous
    );
    const cart = sphericalToCartesian(pose, aspectRatio);
    points.push(cart.position);
  }
  return points;
}

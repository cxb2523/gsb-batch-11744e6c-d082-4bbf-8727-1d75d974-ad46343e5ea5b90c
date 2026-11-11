/**
 * Stateless camera focus distance, rack-focus interpolation, and thin-lens
 * Depth-of-Field (DoF) evaluator for StageFlow.
 * Pure Layer 1 module with zero React or DOM dependencies.
 */

import type {
  CameraCueSpec,
  EvaluatedCameraTrack,
  EvaluatedDofState,
  EvaluatedEntityState,
  ShotCue,
  StageScore,
  TargetAnchor,
  Vec3,
} from './types';
import { CAMERA_LIMITS } from './constants';
import {
  apertureFStopToPreset,
  computeDepthOfFieldLimits,
  computeProjectedFocusDistanceM,
  presetToApertureFStop,
} from './opticsMath';
import { evaluateCameraEasing } from './maneuvers';
import { resolveTargetPoint3D } from './cameraTargetResolver';

interface ResolvedFocusAnchor {
  distanceM: number;
  point: Vec3;
  isEntityOrCoord: boolean;
}

/**
 * Computes a point along the camera's forward optical sightline at `distanceM` from `eye`.
 */
function pointAlongSightline(
  eye: Vec3,
  lookTarget: Vec3,
  distanceM: number
): Vec3 {
  const dx = lookTarget.x - eye.x;
  const dy = lookTarget.y - eye.y;
  const dz = lookTarget.z - eye.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    return { x: eye.x, y: eye.y, z: eye.z - distanceM };
  }
  const scale = distanceM / len;
  return {
    x: eye.x + dx * scale,
    y: eye.y + dy * scale,
    z: eye.z + dz * scale,
  };
}

/**
 * Resolves a single focus endpoint (target key/Vec3 or metric distance) at the current frame.
 */
function resolveFocusEndpoint(
  targetKey: TargetAnchor | undefined,
  explicitDistanceM: number | undefined,
  eye: Vec3,
  lookTarget: Vec3,
  defaultDistanceM: number,
  entitiesById: Map<string, EvaluatedEntityState>
): ResolvedFocusAnchor {
  if (targetKey !== undefined) {
    const pt = resolveTargetPoint3D(targetKey, entitiesById, lookTarget);
    const dist = computeProjectedFocusDistanceM(eye, lookTarget, pt);
    return {
      distanceM: dist,
      point: pt,
      isEntityOrCoord: true,
    };
  }

  if (explicitDistanceM !== undefined && Number.isFinite(explicitDistanceM)) {
    const clamped = Math.max(
      CAMERA_LIMITS.MIN_DISTANCE_M,
      Math.min(CAMERA_LIMITS.MAX_DISTANCE_M, explicitDistanceM)
    );
    return {
      distanceM: clamped,
      point: pointAlongSightline(eye, lookTarget, clamped),
      isEntityOrCoord: false,
    };
  }

  return {
    distanceM: defaultDistanceM,
    point: { ...lookTarget },
    isEntityOrCoord: false,
  };
}

/**
 * Evaluates spline waypoint focus interpolation when waypoints define focus/focusDistanceM.
 */
function evaluateWaypointFocus(
  spec: CameraCueSpec,
  u: number,
  baseAnchor: ResolvedFocusAnchor,
  eye: Vec3,
  lookTarget: Vec3,
  entitiesById: Map<string, EvaluatedEntityState>
): ResolvedFocusAnchor {
  const waypoints = spec.waypoints ?? [];
  const hasRootFocus =
    spec.focusStart !== undefined ||
    spec.focus !== undefined ||
    spec.focusDistanceStartM !== undefined ||
    spec.focusDistanceM !== undefined;

  const anchors: ResolvedFocusAnchor[] =
    hasRootFocus || waypoints.length <= 1 ? [baseAnchor] : [];

  for (const wp of waypoints) {
    const prev =
      anchors.length > 0 ? anchors[anchors.length - 1] : baseAnchor;
    if (wp.focus !== undefined || wp.focusDistanceM !== undefined) {
      anchors.push(
        resolveFocusEndpoint(
          wp.focus,
          wp.focusDistanceM,
          eye,
          lookTarget,
          prev.distanceM,
          entitiesById
        )
      );
    } else {
      anchors.push(prev);
    }
  }

  if (anchors.length <= 1) {
    return baseAnchor;
  }

  const numSegments = anchors.length - 1;
  const scaledT = Math.max(0, Math.min(1, u)) * numSegments;
  const segIdx = Math.min(numSegments - 1, Math.floor(scaledT));
  const segFrac = scaledT - segIdx;
  const a0 = anchors[segIdx];
  const a1 = anchors[segIdx + 1];

  return {
    distanceM: a0.distanceM + (a1.distanceM - a0.distanceM) * segFrac,
    point: {
      x: a0.point.x + (a1.point.x - a0.point.x) * segFrac,
      y: a0.point.y + (a1.point.y - a0.point.y) * segFrac,
      z: a0.point.z + (a1.point.z - a0.point.z) * segFrac,
    },
    isEntityOrCoord: a0.isEntityOrCoord || a1.isEntityOrCoord,
  };
}

/**
 * Deterministically evaluates Stage Camera focus distance, 3D focus point,
 * and Gaussian thin-lens Depth of Field (DoF) bounds at the current frame.
 */
export function evaluateStageCameraDof(
  score: StageScore,
  activeShot: ShotCue | null,
  shotProgress: number,
  stageTrack: EvaluatedCameraTrack,
  entitiesById: Map<string, EvaluatedEntityState>
): EvaluatedDofState {
  const eye = stageTrack.transform.position;
  const lookTarget = stageTrack.transform.target;
  const focalLengthMm = stageTrack.transform.pose.focalLengthMm;
  const defaultFocusM = Math.max(
    CAMERA_LIMITS.MIN_DISTANCE_M,
    stageTrack.transform.pose.distance
  );

  const scoreDefaultAperture =
    score.optics?.defaultApertureFStop ??
    presetToApertureFStop(score.optics?.defaultDof);

  const spec = activeShot?.stageCamera;
  if (!spec) {
    const limits = computeDepthOfFieldLimits(
      focalLengthMm,
      defaultFocusM,
      scoreDefaultAperture
    );
    return {
      ...limits,
      preset: apertureFStopToPreset(limits.apertureFStop),
      focusDistanceM: defaultFocusM,
      hasExplicitFocus: false,
    };
  }

  const u =
    spec.maneuver === 'cut'
      ? 1
      : evaluateCameraEasing(spec.easing, shotProgress);

  const hasWaypointFocus = Boolean(
    spec.waypoints?.some(
      (w) => w.focus !== undefined || w.focusDistanceM !== undefined
    )
  );

  const hasExplicitFocus =
    spec.focus !== undefined ||
    spec.focusStart !== undefined ||
    spec.focusEnd !== undefined ||
    spec.focusDistanceM !== undefined ||
    spec.focusDistanceStartM !== undefined ||
    spec.focusDistanceEndM !== undefined ||
    hasWaypointFocus;

  const hasRackFocus =
    spec.focusStart !== undefined ||
    spec.focusEnd !== undefined ||
    spec.focusDistanceStartM !== undefined ||
    spec.focusDistanceEndM !== undefined;

  let focusDistanceM = defaultFocusM;
  let focusTargetPoint: Vec3 | undefined;

  if (spec.maneuver === 'spline' && hasWaypointFocus) {
    const baseStart = resolveFocusEndpoint(
      spec.focusStart ?? spec.focus,
      spec.focusDistanceStartM ?? spec.focusDistanceM,
      eye,
      lookTarget,
      defaultFocusM,
      entitiesById
    );
    const wpResolved = evaluateWaypointFocus(
      spec,
      u,
      baseStart,
      eye,
      lookTarget,
      entitiesById
    );
    focusDistanceM = wpResolved.distanceM;
    focusTargetPoint = wpResolved.isEntityOrCoord ? wpResolved.point : undefined;
  } else if (hasRackFocus) {
    const startAnchor = resolveFocusEndpoint(
      spec.focusStart ?? spec.focus,
      spec.focusDistanceStartM ?? spec.focusDistanceM,
      eye,
      lookTarget,
      defaultFocusM,
      entitiesById
    );
    const endAnchor = resolveFocusEndpoint(
      spec.focusEnd ?? spec.focus,
      spec.focusDistanceEndM ?? spec.focusDistanceM,
      eye,
      lookTarget,
      startAnchor.distanceM,
      entitiesById
    );

    focusDistanceM =
      startAnchor.distanceM + (endAnchor.distanceM - startAnchor.distanceM) * u;
    if (startAnchor.isEntityOrCoord || endAnchor.isEntityOrCoord) {
      focusTargetPoint = {
        x: startAnchor.point.x + (endAnchor.point.x - startAnchor.point.x) * u,
        y: startAnchor.point.y + (endAnchor.point.y - startAnchor.point.y) * u,
        z: startAnchor.point.z + (endAnchor.point.z - startAnchor.point.z) * u,
      };
    }
  } else if (hasExplicitFocus) {
    const staticAnchor = resolveFocusEndpoint(
      spec.focus,
      spec.focusDistanceM,
      eye,
      lookTarget,
      defaultFocusM,
      entitiesById
    );
    focusDistanceM = staticAnchor.distanceM;
    focusTargetPoint = staticAnchor.isEntityOrCoord
      ? staticAnchor.point
      : undefined;
  }

  // Resolve effective aperture f-stop N
  let effectiveAperture =
    spec.apertureFStop ??
    (spec.dof !== undefined
      ? presetToApertureFStop(spec.dof)
      : scoreDefaultAperture);

  if (
    spec.apertureStartFStop !== undefined ||
    spec.apertureEndFStop !== undefined
  ) {
    const aStart = spec.apertureStartFStop ?? effectiveAperture;
    const aEnd = spec.apertureEndFStop ?? effectiveAperture;
    if (Number.isFinite(aStart) && Number.isFinite(aEnd)) {
      effectiveAperture = aStart + (aEnd - aStart) * u;
    } else {
      effectiveAperture = u < 0.5 ? aStart : aEnd;
    }
  }

  const limits = computeDepthOfFieldLimits(
    focalLengthMm,
    focusDistanceM,
    effectiveAperture
  );

  const preset =
    spec.dof !== undefined &&
    spec.apertureStartFStop === undefined &&
    spec.apertureEndFStop === undefined &&
    (spec.apertureFStop === undefined ||
      spec.apertureFStop === presetToApertureFStop(spec.dof))
      ? spec.dof
      : apertureFStopToPreset(limits.apertureFStop);

  return {
    ...limits,
    preset,
    focusDistanceM: Math.max(
      CAMERA_LIMITS.MIN_DISTANCE_M,
      Math.min(CAMERA_LIMITS.MAX_DISTANCE_M, focusDistanceM)
    ),
    ...(focusTargetPoint ? { focusTargetPoint } : {}),
    hasExplicitFocus,
  };
}

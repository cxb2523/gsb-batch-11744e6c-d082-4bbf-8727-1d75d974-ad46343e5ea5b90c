/**
 * Pure telemetry YAML snippet generator for CameraTelemetryCapsule.
 * Formats scoped `camera:` and `observer_camera:` blocks with metric meters
 * and human degrees, ready to paste directly into YAML choreography scores.
 * Layer 5 UI Utility.
 */

import type {
  CameraManeuver,
  EvaluatedCameraRigState,
  EvaluatedDofState,
  SphericalPose,
} from '../core/types';
import { radToDeg } from '../core/sphericalMath';
import { formatApertureFStop } from '../core/opticsMath';

export type TelemetryCameraSource = 'observer' | 'stage';

export interface TelemetryYamlOptions {
  source: TelemetryCameraSource;
  pose: SphericalPose;
  activeRig?: EvaluatedCameraRigState;
  dof?: EvaluatedDofState;
  maneuver?: CameraManeuver;
}

/**
 * Generates a scoped, indented YAML snippet for clipboard copying.
 * In 'stage' mode, outputs `camera:` with optical parameters (lens, focus, aperture).
 * In 'observer' mode, outputs `observer_camera:` with spatial diorama parameters.
 */
export function formatTelemetryYamlSnippet(options: TelemetryYamlOptions): string {
  const { source, pose, activeRig, dof } = options;

  const pitchDeg = radToDeg(pose.pitch).toFixed(1);
  const yawDeg = radToDeg(pose.yaw).toFixed(1);
  const rollVal = radToDeg(pose.roll);
  const rollDeg = rollVal.toFixed(1);
  const hasNonZeroRoll = Math.abs(rollVal) >= 0.05;
  const distMeters = pose.distance.toFixed(2);
  const tx = pose.target.x.toFixed(2);
  const ty = pose.target.y.toFixed(2);
  const tz = pose.target.z.toFixed(2);
  const lensMm = Math.round(pose.focalLengthMm);

  const blockKey = source === 'stage' ? 'camera:' : 'observer_camera:';

  if (activeRig?.type === 'tripod') {
    const ex = activeRig.eyePosition.x.toFixed(2);
    const ey = activeRig.eyePosition.y.toFixed(2);
    const ez = activeRig.eyePosition.z.toFixed(2);
    return [
      blockKey,
      '  rig:',
      '    type: tripod',
      `    position: [${ex}, ${ey}, ${ez}]`,
      ...(activeRig.hasTargetLock
        ? [`  target: [${tx}, ${ty}, ${tz}]`]
        : [`  pitch: ${pitchDeg}`, `  yaw: ${yawDeg}`]),
      ...(hasNonZeroRoll ? [`  roll: ${rollDeg}`] : []),
      `  lens: ${lensMm}mm`,
      ...(source === 'stage' && (dof?.hasExplicitFocus || dof?.enabled)
        ? [`  focus: ${dof.focusDistanceM.toFixed(2)}m`]
        : []),
      ...(source === 'stage' && dof?.enabled
        ? [`  aperture: ${formatApertureFStop(dof.apertureFStop)}`]
        : []),
    ].join('\n');
  }

  if (activeRig?.type === 'track') {
    const p0 = activeRig.railPoints[0] ?? activeRig.eyePosition;
    const p1 =
      activeRig.railPoints[activeRig.railPoints.length - 1] ??
      activeRig.eyePosition;
    return [
      blockKey,
      '  rig:',
      '    type: track',
      `    from: [${p0.x.toFixed(2)}, ${p0.y.toFixed(2)}, ${p0.z.toFixed(2)}]`,
      `    to: [${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p1.z.toFixed(2)}]`,
      ...(activeRig.hasTargetLock
        ? [`  target: [${tx}, ${ty}, ${tz}]`]
        : [`  pitch: ${pitchDeg}`, `  yaw: ${yawDeg}`]),
      ...(hasNonZeroRoll ? [`  roll: ${rollDeg}`] : []),
      `  lens: ${lensMm}mm`,
      ...(source === 'stage' && (dof?.hasExplicitFocus || dof?.enabled)
        ? [`  focus: ${dof.focusDistanceM.toFixed(2)}m`]
        : []),
      ...(source === 'stage' && dof?.enabled
        ? [`  aperture: ${formatApertureFStop(dof.apertureFStop)}`]
        : []),
    ].join('\n');
  }

  if (activeRig?.type === 'spline_track') {
    const ptsStr = activeRig.railPoints
      .filter(
        (_, idx) =>
          idx % Math.max(1, Math.floor(activeRig.railPoints.length / 4)) === 0 ||
          idx === activeRig.railPoints.length - 1
      )
      .map((p) => `      - [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`)
      .join('\n');
    return [
      blockKey,
      '  rig:',
      '    type: spline_track',
      '    points:',
      ptsStr,
      ...(activeRig.hasTargetLock
        ? [`  target: [${tx}, ${ty}, ${tz}]`]
        : [`  pitch: ${pitchDeg}`, `  yaw: ${yawDeg}`]),
      ...(hasNonZeroRoll ? [`  roll: ${rollDeg}`] : []),
      `  lens: ${lensMm}mm`,
      ...(source === 'stage' && (dof?.hasExplicitFocus || dof?.enabled)
        ? [`  focus: ${dof.focusDistanceM.toFixed(2)}m`]
        : []),
      ...(source === 'stage' && dof?.enabled
        ? [`  aperture: ${formatApertureFStop(dof.apertureFStop)}`]
        : []),
    ].join('\n');
  }

  return [
    blockKey,
    `  target: [${tx}, ${ty}, ${tz}]`,
    `  distance: ${distMeters}`,
    `  pitch: ${pitchDeg}`,
    `  yaw: ${yawDeg}`,
    ...(hasNonZeroRoll ? [`  roll: ${rollDeg}`] : []),
    `  lens: ${lensMm}mm`,
    ...(source === 'stage' && (dof?.hasExplicitFocus || dof?.enabled)
      ? [`  focus: ${dof.focusDistanceM.toFixed(2)}m`]
      : []),
    ...(source === 'stage' && dof?.enabled
      ? [`  aperture: ${formatApertureFStop(dof.apertureFStop)}`]
      : []),
  ].join('\n');
}


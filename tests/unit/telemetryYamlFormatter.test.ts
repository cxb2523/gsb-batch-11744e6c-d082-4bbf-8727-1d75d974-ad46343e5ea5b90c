import { describe, it, expect } from 'vitest';
import { formatTelemetryYamlSnippet } from '../../src/ui/telemetryYamlFormatter';
import type { SphericalPose, EvaluatedCameraRigState, EvaluatedDofState } from '../../src/core/types';
import { degToRad } from '../../src/core/sphericalMath';

describe('telemetryYamlFormatter — Scoped YAML Generation', () => {
  const basePose: SphericalPose = {
    target: { x: 0, y: 1.2, z: 0.5 },
    distance: 4.8,
    pitch: degToRad(15),
    yaw: degToRad(45),
    roll: 0,
    focalLengthMm: 50,
  };

  it('formats scoped observer_camera block correctly', () => {
    const yaml = formatTelemetryYamlSnippet({
      source: 'observer',
      pose: basePose,
    });

    expect(yaml).toBe([
      'observer_camera:',
      '  target: [0.00, 1.20, 0.50]',
      '  distance: 4.80',
      '  pitch: 15.0',
      '  yaw: 45.0',
      '  lens: 50mm',
    ].join('\n'));
  });

  it('formats scoped camera block for stage camera with focus and aperture', () => {
    const dof: EvaluatedDofState = {
      enabled: true,
      preset: 'shallow',
      focusDistanceM: 2.5934,
      hyperfocalDistanceM: 12.0,
      nearLimitM: 2.0,
      farLimitM: 3.5,
      depthOfFieldM: 1.5,
      apertureFStop: 2.5664,
      hasExplicitFocus: true,
    };

    const yaml = formatTelemetryYamlSnippet({
      source: 'stage',
      pose: basePose,
      dof,
    });

    expect(yaml).toBe([
      'camera:',
      '  target: [0.00, 1.20, 0.50]',
      '  distance: 4.80',
      '  pitch: 15.0',
      '  yaw: 45.0',
      '  lens: 50mm',
      '  focus: 2.59m',
      '  aperture: f/2.6',
    ].join('\n'));
  });

  it('includes non-zero roll angle when present', () => {
    const poseWithRoll: SphericalPose = {
      ...basePose,
      roll: degToRad(-12.5),
    };

    const yaml = formatTelemetryYamlSnippet({
      source: 'camera' as any, // stage
      pose: poseWithRoll,
    });

    expect(yaml).toContain('  roll: -12.5');
  });

  it('formats tripod rig correctly under scoped key', () => {
    const tripodRig: EvaluatedCameraRigState = {
      type: 'tripod',
      eyePosition: { x: 1.5, y: 1.6, z: 2.0 },
      railPoints: [],
      hasTargetLock: true,
      progress: 0,
    };

    const yaml = formatTelemetryYamlSnippet({
      source: 'stage',
      pose: basePose,
      activeRig: tripodRig,
    });

    expect(yaml).toBe([
      'camera:',
      '  rig:',
      '    type: tripod',
      '    position: [1.50, 1.60, 2.00]',
      '  target: [0.00, 1.20, 0.50]',
      '  lens: 50mm',
    ].join('\n'));
  });

  it('formats track rig correctly under scoped key', () => {
    const trackRig: EvaluatedCameraRigState = {
      type: 'track',
      eyePosition: { x: 1.0, y: 1.5, z: 2.0 },
      railPoints: [
        { x: -2.0, y: 0.0, z: 3.0 },
        { x: 2.0, y: 0.0, z: 3.0 },
      ],
      hasTargetLock: false,
      progress: 0.5,
    };

    const yaml = formatTelemetryYamlSnippet({
      source: 'stage',
      pose: basePose,
      activeRig: trackRig,
    });

    expect(yaml).toBe([
      'camera:',
      '  rig:',
      '    type: track',
      '    from: [-2.00, 0.00, 3.00]',
      '    to: [2.00, 0.00, 3.00]',
      '  pitch: 15.0',
      '  yaw: 45.0',
      '  lens: 50mm',
    ].join('\n'));
  });
});


/**
 * Unit tests for the Frustum Cone & Focus Plane diagnostics module
 * (src/stage/stageCamDiagnostics.ts) and its StageCameraRig integration
 * (buildStageCamSnapshot). Fully local: no network, credentials, or GPU.
 */

import { describe, expect, it } from 'vitest';
import { parseStageScore } from '../../src/core/scoreParser';
import { computeStageFrame } from '../../src/core/frameEngine';
import { computeFrustumGateDimensions } from '../../src/core/opticsMath';
import {
  diagnoseStageCam,
  type StageCamSnapshot,
} from '../../src/stage/stageCamDiagnostics';
import { buildStageCamSnapshot } from '../../src/stage/StageCameraRig';

const BASE_SNAPSHOT: StageCamSnapshot = {
  frustumDepth: 4,
  focalLengthMm: 50,
  aspectRatio: 16 / 9,
  maneuver: 'dolly',
  frustumColor: '#f59e0b',
};

describe('stageCamDiagnostics — normal path (explicit focus, DoF enabled)', () => {
  const rawYaml = `
version: "1.0"
id: "diag-test"
title: "Stage Cam Diagnostics Test"
duration: 4.0
stage:
  width: 10
  depth: 10
shots:
  - id: "s1"
    shot: 1
    start: 0.0
    end: 4.0
    stage_camera:
      target: [0, 1, 0]
      distance: 6.0
      lens: 50mm
      frustum_depth: 2.0
      focus_distance: 5.0
      dof: shallow
`;

  it('matches syncFrustumAndFocus & computeFrustumGateDimensions value-for-value, all checks pass', () => {
    const { score, error } = parseStageScore(rawYaml);
    expect(error).toBeNull();
    const frame = computeStageFrame(1.0, score!);
    const cam = frame.stageCamera;

    // Sanity: this frame really has explicit focus + enabled DoF
    expect(cam.dof.hasExplicitFocus).toBe(true);
    expect(cam.dof.enabled).toBe(true);

    const diag = buildStageCamSnapshot(frame);
    expect(diag.available).toBe(true);
    expect(diag.status).toBe('ok');
    expect(diag.degraded).toBe(false);
    expect(diag.degradedFields).toEqual([]);

    // Replicate syncFrustumAndFocus math independently
    const dof = cam.dof;
    const expectedFocusDepth =
      dof && (dof.hasExplicitFocus || dof.enabled)
        ? dof.focusDistanceM
        : cam.frustumDepth;
    const expectedConeDepth = Math.max(cam.frustumDepth, expectedFocusDepth);
    const focal = cam.transform.pose.focalLengthMm;
    const aspect = cam.transform.aspectRatio;
    const expectedConeGate = computeFrustumGateDimensions(
      focal,
      expectedConeDepth,
      aspect
    );
    const expectedFocusGate = computeFrustumGateDimensions(
      focal,
      expectedFocusDepth,
      aspect
    );

    // Depths & sources
    expect(diag.focusDepth).toBe(expectedFocusDepth);
    expect(diag.focusDepthSource).toBe('dof-focus');
    expect(diag.coneDepth).toBe(expectedConeDepth);
    expect(diag.coneDepthSource).toBe(
      expectedFocusDepth > cam.frustumDepth ? 'dof-focus' : 'frustum-depth'
    );

    // Gate dimensions (exact source precision)
    expect(diag.coneGate!.gateWidth).toBe(expectedConeGate.gateWidth);
    expect(diag.coneGate!.gateHeight).toBe(expectedConeGate.gateHeight);
    expect(diag.coneGate!.halfWidth).toBe(expectedConeGate.halfWidth);
    expect(diag.coneGate!.halfHeight).toBe(expectedConeGate.halfHeight);
    expect(diag.focusGate!.gateWidth).toBe(expectedFocusGate.gateWidth);
    expect(diag.focusGate!.gateHeight).toBe(expectedFocusGate.gateHeight);
    expect(diag.focusGate!.halfWidth).toBe(expectedFocusGate.halfWidth);
    expect(diag.focusGate!.halfHeight).toBe(expectedFocusGate.halfHeight);

    // Scale triplets & z placements
    expect(diag.frustumGroupScale).toEqual([
      expectedConeGate.halfWidth,
      expectedConeGate.halfHeight,
      expectedConeDepth,
    ]);
    expect(diag.focusPlaneGroupScale).toEqual([
      expectedFocusGate.halfWidth,
      expectedFocusGate.halfHeight,
      1,
    ]);
    expect(diag.focusPlaneGroupZ).toBe(expectedFocusDepth);
    expect(diag.targetRingZ).toBe(expectedFocusDepth);

    // Lens badge label
    expect(diag.lensLabel).toBe(
      `${Math.round(focal)}mm · ${cam.maneuver.toUpperCase()}`
    );
    expect(diag.frustumColor).toBe(cam.frustumColor);

    // Every check passes
    expect(diag.checks.length).toBeGreaterThan(0);
    for (const check of diag.checks) {
      expect(check.passed, `check "${check.name}" should pass`).toBe(true);
      expect(check.reason).toBeUndefined();
    }
  });

  it('is JSON-serializable and round-trips exactly', () => {
    const { score } = parseStageScore(rawYaml);
    const frame = computeStageFrame(1.0, score!);
    const diag = buildStageCamSnapshot(frame);
    const json = JSON.stringify(diag);
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toEqual(diag);
  });
});

describe('stageCamDiagnostics — fallback path (DoF missing or inactive)', () => {
  it('falls back to frustumDepth with annotated source when dof is missing', () => {
    const diag = diagnoseStageCam({ ...BASE_SNAPSHOT, frustumDepth: 3.25 });
    expect(diag.status).toBe('ok');
    expect(diag.focusDepth).toBe(3.25);
    expect(diag.focusDepthSource).toBe('frustum-depth-fallback');
    expect(diag.coneDepth).toBe(3.25);
    expect(diag.coneDepthSource).toBe('frustum-depth');
    expect(diag.focusPlaneGroupZ).toBe(3.25);
    expect(diag.targetRingZ).toBe(3.25);
    const fallbackCheck = diag.checks.find(
      (c) => c.name === 'focusDepth-fallback-source'
    );
    expect(fallbackCheck?.passed).toBe(true);
    for (const check of diag.checks) {
      expect(check.passed, `check "${check.name}" should pass`).toBe(true);
    }
  });

  it('falls back when dof exists but is disabled with no explicit focus', () => {
    const diag = diagnoseStageCam({
      ...BASE_SNAPSHOT,
      frustumDepth: 2.5,
      dof: {
        enabled: false,
        hasExplicitFocus: false,
        focusDistanceM: 9,
        apertureFStop: Infinity,
      },
    });
    expect(diag.focusDepth).toBe(2.5);
    expect(diag.focusDepthSource).toBe('frustum-depth-fallback');
    for (const check of diag.checks) {
      expect(check.passed, `check "${check.name}" should pass`).toBe(true);
    }
  });

  it('uses dof focus when only enabled (no explicit focus) and expands the cone', () => {
    const diag = diagnoseStageCam({
      ...BASE_SNAPSHOT,
      frustumDepth: 2,
      dof: { enabled: true, hasExplicitFocus: false, focusDistanceM: 6 },
    });
    expect(diag.focusDepth).toBe(6);
    expect(diag.focusDepthSource).toBe('dof-focus');
    expect(diag.coneDepth).toBe(6);
    expect(diag.coneDepthSource).toBe('dof-focus');
    const expectedConeGate = computeFrustumGateDimensions(50, 6, 16 / 9);
    expect(diag.coneGate!.halfWidth).toBe(expectedConeGate.halfWidth);
    expect(diag.frustumGroupScale).toEqual([
      expectedConeGate.halfWidth,
      expectedConeGate.halfHeight,
      6,
    ]);
    for (const check of diag.checks) {
      expect(check.passed, `check "${check.name}" should pass`).toBe(true);
    }
  });
});

describe('stageCamDiagnostics — degraded boundary inputs (never throws)', () => {
  it('degrades gracefully when frustumDepth is 0', () => {
    let diag: ReturnType<typeof diagnoseStageCam> | undefined;
    expect(() => {
      diag = diagnoseStageCam({ ...BASE_SNAPSHOT, frustumDepth: 0 });
    }).not.toThrow();
    expect(diag!.status).toBe('degraded');
    expect(diag!.degraded).toBe(true);
    expect(diag!.degradedFields).toContain('frustumDepth');
    const failed = diag!.checks.find((c) => c.name === 'frustumDepth-positive');
    expect(failed?.passed).toBe(false);
    expect(typeof failed?.reason).toBe('string');
    expect(failed!.reason!.length).toBeGreaterThan(0);
    // JSON-serializable even in degraded state
    expect(() => JSON.stringify(diag)).not.toThrow();
  });

  it('degrades gracefully when focalLengthMm is NaN', () => {
    const diag = diagnoseStageCam({ ...BASE_SNAPSHOT, focalLengthMm: NaN });
    expect(diag.status).toBe('degraded');
    expect(diag.degradedFields).toContain('focalLengthMm');
    const failed = diag.checks.find((c) => c.name === 'focalLengthMm-finite');
    expect(failed?.passed).toBe(false);
    expect(typeof failed?.reason).toBe('string');
    expect(() => JSON.stringify(diag)).not.toThrow();
  });

  it('degrades gracefully when dof.focusDistanceM is Infinity', () => {
    const diag = diagnoseStageCam({
      ...BASE_SNAPSHOT,
      dof: { enabled: true, hasExplicitFocus: true, focusDistanceM: Infinity },
    });
    expect(diag.status).toBe('degraded');
    expect(diag.degradedFields).toContain('dof.focusDistanceM');
    const failed = diag.checks.find(
      (c) => c.name === 'dof-focusDistance-finite'
    );
    expect(failed?.passed).toBe(false);
    expect(typeof failed?.reason).toBe('string');
    // Non-finite outputs are sanitized to null so JSON stays clean
    expect(diag.focusDepth).toBeNull();
    const parsed = JSON.parse(JSON.stringify(diag));
    expect(parsed.focusDepth).toBeNull();
    expect(parsed.status).toBe('degraded');
  });
});

describe('buildStageCamSnapshot — missing camera frames', () => {
  it('returns a no-camera result instead of throwing', () => {
    for (const frame of [null, undefined, {} as never]) {
      let diag: ReturnType<typeof buildStageCamSnapshot> | undefined;
      expect(() => {
        diag = buildStageCamSnapshot(frame);
      }).not.toThrow();
      expect(diag!.available).toBe(false);
      expect(diag!.status).toBe('no-camera');
      expect(typeof diag!.unavailableReason).toBe('string');
      expect(diag!.unavailableReason!.length).toBeGreaterThan(0);
      expect(() => JSON.stringify(diag)).not.toThrow();
    }
  });
});

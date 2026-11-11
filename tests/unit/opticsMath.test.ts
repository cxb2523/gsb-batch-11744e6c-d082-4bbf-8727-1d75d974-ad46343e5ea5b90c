import { describe, expect, it } from 'vitest';
import {
  apertureFStopToPreset,
  clampApertureFStop,
  computeAdaptiveDioramaFovDeg,
  computeContainedGateDimensionsPx,
  computeDepthOfFieldLimits,
  computeFrustumGateDimensions,
  computeNormalizedBlurCircleFraction,
  computeProjectedFocusDistanceM,
  computeViewfinderCanvasFovDeg,
  focalLengthToVerticalFovDeg,
  formatApertureFStop,
  parseAspectRatio,
  presetToApertureFStop,
  verticalFovDegToFocalLengthMm,
} from '../../src/core/opticsMath';

describe('opticsMath — Directorial Lens & Frustum Gate Calculations', () => {
  it('parses standard cinematic aspect ratio strings and numbers', () => {
    expect(parseAspectRatio('16:9')).toBeCloseTo(16 / 9, 5);
    expect(parseAspectRatio('2.39:1')).toBeCloseTo(2.39, 5);
    expect(parseAspectRatio('4:3')).toBeCloseTo(4 / 3, 5);
    expect(parseAspectRatio(1.85)).toBeCloseTo(1.85, 5);
    expect(parseAspectRatio(undefined)).toBeCloseTo(16 / 9, 5);
  });

  it('converts standard cinema focal lengths (24mm, 35mm, 50mm, 85mm) to vertical FOV and round-trips cleanly', () => {
    const lenses = [24, 35, 50, 85];
    for (const lensMm of lenses) {
      const fov16x9 = focalLengthToVerticalFovDeg(lensMm, 16 / 9);
      expect(fov16x9).toBeGreaterThan(5);
      expect(fov16x9).toBeLessThan(90);

      const roundTrip = verticalFovDegToFocalLengthMm(fov16x9, 16 / 9);
      expect(roundTrip).toBeCloseTo(lensMm, 4);
    }

    // Longer focal lengths must produce narrower vertical FOVs
    const fov24 = focalLengthToVerticalFovDeg(24, 16 / 9);
    const fov50 = focalLengthToVerticalFovDeg(50, 16 / 9);
    const fov85 = focalLengthToVerticalFovDeg(85, 16 / 9);
    expect(fov24).toBeGreaterThan(fov50);
    expect(fov50).toBeGreaterThan(fov85);
  });

  it('computes rectangular film gate frustum dimensions matching the target aspect ratio', () => {
    const gate16x9 = computeFrustumGateDimensions(50, 4.0, 16 / 9);
    expect(gate16x9.gateWidth / gate16x9.gateHeight).toBeCloseTo(16 / 9, 5);
    expect(gate16x9.halfWidth).toBeCloseTo(gate16x9.gateWidth * 0.5, 5);

    const gateScope = computeFrustumGateDimensions(35, 6.5, 2.39);
    expect(gateScope.gateWidth / gateScope.gateHeight).toBeCloseTo(2.39, 5);
  });

  it('computes contained viewfinder gate pixel dimensions across wide and tall viewports', () => {
    // 16:9 gate in a wide 1600x900 viewport (scale = 0.84)
    const wide = computeContainedGateDimensionsPx(1600, 900, 16 / 9, 0.84);
    expect(wide.height).toBeCloseTo(900 * 0.84, 5);
    expect(wide.width).toBeCloseTo(wide.height * (16 / 9), 5);

    // 16:9 gate in a narrow 500x1000 viewport (scale = 0.84)
    const tall = computeContainedGateDimensionsPx(500, 1000, 16 / 9, 0.84);
    expect(tall.width).toBeCloseTo(500 * 0.84, 5);
    expect(tall.height).toBeCloseTo(tall.width / (16 / 9), 5);
  });

  it('calculates compensated canvas FOV so framing inside the contained gate matches target lens FOV', () => {
    // In a wide canvas (height constrained), canvas FOV must scale with canvasHeight / gateHeight
    const targetGateFov = 39.6; // ~50mm lens vertical FOV
    const canvasFov = computeViewfinderCanvasFovDeg(targetGateFov, 1600, 900, 16 / 9, 0.84);
    expect(canvasFov).toBeGreaterThan(targetGateFov);

    // In a tall canvas where gate height is much smaller than canvas height, canvas FOV widens further
    const tallCanvasFov = computeViewfinderCanvasFovDeg(targetGateFov, 500, 1000, 16 / 9, 0.84);
    expect(tallCanvasFov).toBeGreaterThan(canvasFov);
  });

  it('computes adaptive diorama FOV preserving horizontal stage framing in split workspace layouts (Approach A)', () => {
    const baseFov = 38.0; // ~35mm lens vertical FOV at 16:9

    // 1. In standard 16:9 viewport (1920x1080), aspect == 16:9, must return baseFov exactly
    const full16x9Fov = computeAdaptiveDioramaFovDeg(baseFov, 1920, 1080, 16 / 9);
    expect(full16x9Fov).toBeCloseTo(baseFov, 5);

    // 2. In ultrawide viewport (2560x1080, aspect > 16:9), must also return baseFov
    const ultraWideFov = computeAdaptiveDioramaFovDeg(baseFov, 2560, 1080, 16 / 9);
    expect(ultraWideFov).toBeCloseTo(baseFov, 5);

    // 3. In 50/50 split workspace (960x900, aspect = 1.0667 < 16:9), vertical FOV must expand
    const splitFov = computeAdaptiveDioramaFovDeg(baseFov, 960, 900, 16 / 9);
    expect(splitFov).toBeGreaterThan(baseFov);

    // Verify that the resulting horizontal FOV in split matches the baseline 16:9 horizontal FOV
    const baselineHalfHRad = (baseFov * 0.5 * Math.PI) / 180;
    const expectedHalfHorizTan = (16 / 9) * Math.tan(baselineHalfHRad);

    const splitAspect = 960 / 900;
    const splitHalfHRad = (splitFov * 0.5 * Math.PI) / 180;
    const splitActualHorizTan = splitAspect * Math.tan(splitHalfHRad);

    expect(splitActualHorizTan).toBeCloseTo(expectedHalfHorizTan, 5);
  });

  it('computes orthogonal focus plane projection distance and prevents off-axis cosine overshoot', () => {
    const camPos = { x: 0, y: 1.5, z: 5 };
    const camTarget = { x: 0, y: 1.5, z: 0 }; // forward is (0, 0, -1)

    // Subject directly on optical axis at z = 2 (3m away)
    expect(
      computeProjectedFocusDistanceM(camPos, camTarget, { x: 0, y: 1.5, z: 2 })
    ).toBeCloseTo(3.0, 5);

    // Off-axis subject at [2.0, 1.5, 2.0]: Euclidean distance is sqrt(4+9) = 3.605m,
    // but orthogonal depth along optical axis is strictly 3.0m
    expect(
      computeProjectedFocusDistanceM(camPos, camTarget, { x: 2.0, y: 1.5, z: 2.0 })
    ).toBeCloseTo(3.0, 5);

    // Subject behind camera clamps to MIN_FOCUS_DISTANCE_M (0.4m)
    expect(
      computeProjectedFocusDistanceM(camPos, camTarget, { x: 0, y: 1.5, z: 10 })
    ).toBeCloseTo(0.4, 5);
  });

  it('computes thin-lens hyperfocal distance, near/far DoF limits, and blur circle fractions', () => {
    // 50mm lens, focus at 3.0m, shallow DoF (f/2.8), CoC = 0.03mm
    const shallow50 = computeDepthOfFieldLimits(50, 3.0, 2.8);
    expect(shallow50.hyperfocalDistanceM).toBeCloseTo(29.812, 2);
    expect(shallow50.nearLimitM).toBeCloseTo(2.73, 2);
    expect(shallow50.farLimitM).toBeCloseTo(3.33, 2);
    expect(shallow50.depthOfFieldM).toBeCloseTo(0.60, 2);

    // 50mm lens, focus at 3.0m, medium DoF (f/5.6)
    const medium50 = computeDepthOfFieldLimits(50, 3.0, 5.6);
    expect(medium50.nearLimitM).toBeCloseTo(2.504, 2);
    expect(medium50.farLimitM).toBeCloseTo(3.742, 2);
    expect(medium50.depthOfFieldM).toBeCloseTo(1.238, 2);

    // Hyperfocal infinity case: 24mm lens at f/16 focused at 15m (d >= H)
    const deep24 = computeDepthOfFieldLimits(24, 15.0, 16.0);
    expect(deep24.farLimitM).toBe(Number.POSITIVE_INFINITY);
    expect(deep24.depthOfFieldM).toBe(Number.POSITIVE_INFINITY);

    // Blur circle at exact focus plane is 0, and increases monotonically away from focus
    expect(computeNormalizedBlurCircleFraction(3.0, 50, 3.0, 2.8)).toBeCloseTo(0, 6);
    const blurAt4m = computeNormalizedBlurCircleFraction(4.0, 50, 3.0, 2.8);
    const blurAt8m = computeNormalizedBlurCircleFraction(8.0, 50, 3.0, 2.8);
    expect(blurAt4m).toBeGreaterThan(0);
    expect(blurAt8m).toBeGreaterThan(blurAt4m);

    // Preset mappings and clamping
    expect(presetToApertureFStop('shallow')).toBe(2.8);
    expect(presetToApertureFStop('medium')).toBe(5.6);
    expect(presetToApertureFStop('deep')).toBe(Number.POSITIVE_INFINITY);
    expect(apertureFStopToPreset(2.8)).toBe('shallow');
    expect(apertureFStopToPreset(5.6)).toBe('medium');
    expect(apertureFStopToPreset(16)).toBe('deep');
    expect(clampApertureFStop(0.2)).toBe(0.7);
    expect(clampApertureFStop(128)).toBe(64.0);
  });

  it('formats aperture f-stops with at most 1 decimal digit and strips trailing .0', () => {
    expect(formatApertureFStop(1.4)).toBe('f/1.4');
    expect(formatApertureFStop(2.0)).toBe('f/2');
    expect(formatApertureFStop(2.8)).toBe('f/2.8');
    expect(formatApertureFStop(4)).toBe('f/4');
    expect(formatApertureFStop(5.6)).toBe('f/5.6');
    expect(formatApertureFStop(8.0)).toBe('f/8');
    expect(formatApertureFStop(11.0)).toBe('f/11');
    expect(formatApertureFStop(2.566423732871568)).toBe('f/2.6');
    expect(formatApertureFStop(Infinity)).toBe('f/∞');
    expect(formatApertureFStop(-1)).toBe('f/∞');
    expect(formatApertureFStop(Number.NaN)).toBe('f/∞');
  });
});

import { describe, expect, it } from 'vitest';
import {
  cartesianToSpherical,
  clampSphericalPose,
  computeFloorClampedMaxPolarAngle,
  computeLookAtYawRad,
  degToRad,
  directedAngleDiff,
  MAX_SAFE_POLAR_ANGLE_RAD,
  MIN_FLOOR_CLEARANCE_M,
  radToDeg,
  shortestAngleDiff,
  sphericalToCartesian,
} from '../../src/core/sphericalMath';
import { CAMERA_LIMITS } from '../../src/core/constants';
import type { SphericalPose } from '../../src/core/types';

describe('sphericalMath — Metric Coordinates & Shortest-Angle Unwrapping', () => {
  it('converts degrees to radians and back accurately', () => {
    expect(radToDeg(degToRad(45))).toBeCloseTo(45, 6);
    expect(radToDeg(degToRad(-135))).toBeCloseTo(-135, 6);
  });

  it('unwraps shortestAngleDiff across the -PI / +PI boundary without 360-deg spin flips', () => {
    const a = degToRad(170);
    const b = degToRad(-170);
    // Moving from +170 deg to -170 deg should be +20 deg, never -340 deg
    const diff = shortestAngleDiff(b, a);
    expect(radToDeg(diff)).toBeCloseTo(20, 4);

    const reverseDiff = shortestAngleDiff(a, b);
    expect(radToDeg(reverseDiff)).toBeCloseTo(-20, 4);
  });

  it('round-trips SphericalPose -> Cartesian -> SphericalPose identically', () => {
    const initialPose: SphericalPose = {
      target: { x: -0.9, y: 1.35, z: 0.4 },
      distance: 3.4,
      pitch: degToRad(18),
      yaw: degToRad(-35),
      roll: 0,
      focalLengthMm: 50,
    };

    const transform = sphericalToCartesian(initialPose, 16 / 9);
    const recovered = cartesianToSpherical(
      transform.position,
      transform.target,
      initialPose.focalLengthMm
    );

    expect(recovered.target.x).toBeCloseTo(initialPose.target.x, 5);
    expect(recovered.target.y).toBeCloseTo(initialPose.target.y, 5);
    expect(recovered.target.z).toBeCloseTo(initialPose.target.z, 5);
    expect(recovered.distance).toBeCloseTo(initialPose.distance, 5);
    expect(recovered.pitch).toBeCloseTo(initialPose.pitch, 5);
    expect(recovered.yaw).toBeCloseTo(initialPose.yaw, 5);
    expect(recovered.roll).toBeCloseTo(0, 5);
    expect(recovered.focalLengthMm).toBe(50);
  });

  it('preserves position invariance across arbitrary camera roll angles', () => {
    const basePose: SphericalPose = {
      target: { x: 1.2, y: 0.8, z: -2.1 },
      distance: 4.5,
      pitch: degToRad(22),
      yaw: degToRad(40),
      roll: 0,
      focalLengthMm: 35,
    };

    const tLevel = sphericalToCartesian(basePose, 16 / 9);
    const tRolled15 = sphericalToCartesian({ ...basePose, roll: degToRad(15) }, 16 / 9);
    const tRolled90 = sphericalToCartesian({ ...basePose, roll: degToRad(90) }, 16 / 9);
    const tRolledNeg45 = sphericalToCartesian({ ...basePose, roll: degToRad(-45) }, 16 / 9);

    // Camera 3D Eye Position must be 100% bit-for-bit identical regardless of roll
    expect(tRolled15.position.x).toBeCloseTo(tLevel.position.x, 8);
    expect(tRolled15.position.y).toBeCloseTo(tLevel.position.y, 8);
    expect(tRolled15.position.z).toBeCloseTo(tLevel.position.z, 8);

    expect(tRolled90.position.x).toBeCloseTo(tLevel.position.x, 8);
    expect(tRolled90.position.y).toBeCloseTo(tLevel.position.y, 8);
    expect(tRolled90.position.z).toBeCloseTo(tLevel.position.z, 8);

    expect(tRolledNeg45.position.x).toBeCloseTo(tLevel.position.x, 8);
    expect(tRolledNeg45.position.y).toBeCloseTo(tLevel.position.y, 8);
    expect(tRolledNeg45.position.z).toBeCloseTo(tLevel.position.z, 8);
  });

  it('computes orthonormal rolled up-vector math accurately across cardinal angles', () => {
    // 1. Level horizon at pitch = 0, yaw = 0 -> Up must be (0, 1, 0)
    const t0 = sphericalToCartesian({
      target: { x: 0, y: 0, z: 0 },
      distance: 5,
      pitch: 0,
      yaw: 0,
      roll: 0,
      focalLengthMm: 50,
    });
    expect(t0.up.x).toBeCloseTo(0, 5);
    expect(t0.up.y).toBeCloseTo(1, 5);
    expect(t0.up.z).toBeCloseTo(0, 5);

    // 2. Roll = +90 deg (CW tilt from operator POV) -> Top of camera points toward camera right (+X)
    const t90 = sphericalToCartesian({
      target: { x: 0, y: 0, z: 0 },
      distance: 5,
      pitch: 0,
      yaw: 0,
      roll: degToRad(90),
      focalLengthMm: 50,
    });
    expect(t90.up.x).toBeCloseTo(1, 5);
    expect(t90.up.y).toBeCloseTo(0, 5);
    expect(t90.up.z).toBeCloseTo(0, 5);

    // 3. Roll = -90 deg (CCW tilt from operator POV) -> Top of camera points toward camera left (-X)
    const tNeg90 = sphericalToCartesian({
      target: { x: 0, y: 0, z: 0 },
      distance: 5,
      pitch: 0,
      yaw: 0,
      roll: degToRad(-90),
      focalLengthMm: 50,
    });
    expect(tNeg90.up.x).toBeCloseTo(-1, 5);
    expect(tNeg90.up.y).toBeCloseTo(0, 5);
    expect(tNeg90.up.z).toBeCloseTo(0, 5);

    // 4. Roll = 180 deg (Inverted upside-down camera) -> Up must be (0, -1, 0)
    const t180 = sphericalToCartesian({
      target: { x: 0, y: 0, z: 0 },
      distance: 5,
      pitch: 0,
      yaw: 0,
      roll: degToRad(180),
      focalLengthMm: 50,
    });
    expect(t180.up.x).toBeCloseTo(0, 5);
    expect(t180.up.y).toBeCloseTo(-1, 5);
    expect(t180.up.z).toBeCloseTo(0, 5);

    // 5. Verification of orthonormality under combined pitch, yaw, and roll
    const tArbitrary = sphericalToCartesian({
      target: { x: -1.5, y: 1.2, z: 3.0 },
      distance: 6.2,
      pitch: degToRad(-35),
      yaw: degToRad(70),
      roll: degToRad(25),
      focalLengthMm: 85,
    });

    // Magnitude must be 1.0
    const upLen = Math.hypot(tArbitrary.up.x, tArbitrary.up.y, tArbitrary.up.z);
    expect(upLen).toBeCloseTo(1.0, 5);

    // Forward sightline vector from eye to target
    const dx = tArbitrary.target.x - tArbitrary.position.x;
    const dy = tArbitrary.target.y - tArbitrary.position.y;
    const dz = tArbitrary.target.z - tArbitrary.position.z;
    const fLen = Math.hypot(dx, dy, dz);
    const fx = dx / fLen;
    const fy = dy / fLen;
    const fz = dz / fLen;

    // Up vector must be strictly orthogonal to forward sightline (dot product = 0)
    const dotProduct = tArbitrary.up.x * fx + tArbitrary.up.y * fy + tArbitrary.up.z * fz;
    expect(dotProduct).toBeCloseTo(0, 5);
  });

  it('computes horizontal lookAt facing yaw in Y-up space', () => {
    // Facing +Z
    expect(
      radToDeg(computeLookAtYawRad({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 }))
    ).toBeCloseTo(0, 5);
    // Facing +X
    expect(
      radToDeg(computeLookAtYawRad({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }))
    ).toBeCloseTo(90, 5);
    // Facing -X
    expect(
      radToDeg(computeLookAtYawRad({ x: 0, y: 0, z: 0 }, { x: -5, y: 0, z: 0 }))
    ).toBeCloseTo(-90, 5);
  });

  it('calculates directedAngleDiff according to explicit cw and ccw directions', () => {
    // 1. From 30 deg to 330 deg:
    // On Three.js floor, 30 deg (~5:00) to 330 deg (~7:00) moves with the clock (CW) along -60 deg
    const start = degToRad(30);
    const target = degToRad(330);

    // Without direction (fallback to shortest arc)
    expect(radToDeg(directedAngleDiff(target, start))).toBeCloseTo(-60, 4);

    // With explicit CW: moves directly along negative arc (-60 deg)
    expect(radToDeg(directedAngleDiff(target, start, 'cw'))).toBeCloseTo(-60, 4);

    // With explicit CCW: must take the positive long way around (+300 deg)
    expect(radToDeg(directedAngleDiff(target, start, 'ccw'))).toBeCloseTo(300, 4);

    // 2. The Expansion case: from 180 deg (12:00) to 225 deg (10:30)
    // Moving 12:00 -> 10:30 is counter-clockwise (CCW) along positive arc (+45 deg)
    const startOner = degToRad(180);
    const targetOner = degToRad(225);

    // Without direction: shortest arc is +45 deg
    expect(radToDeg(directedAngleDiff(targetOner, startOner))).toBeCloseTo(45, 4);

    // With explicit CCW: directly along positive arc (+45 deg)
    expect(radToDeg(directedAngleDiff(targetOner, startOner, 'ccw'))).toBeCloseTo(45, 4);

    // With explicit CW: long way around clockwise (-315 deg)
    expect(radToDeg(directedAngleDiff(targetOner, startOner, 'cw'))).toBeCloseTo(-315, 4);

    // 3. From 175 deg to 0 deg:
    const start2 = degToRad(175);
    const target2 = degToRad(0);
    // CW: moves along negative arc (-175 deg)
    expect(radToDeg(directedAngleDiff(target2, start2, 'cw'))).toBeCloseTo(-175, 4);
    // CCW: moves along positive arc (+185 deg)
    expect(radToDeg(directedAngleDiff(target2, start2, 'ccw'))).toBeCloseTo(185, 4);
  });

  describe('computeFloorClampedMaxPolarAngle — Dynamic Floor Clearance', () => {
    it('allows ground actor to be viewed from knee/floor level (> 90 deg)', () => {
      // Actor chest at Y = 1.2m, camera distance = 4.0m
      const maxAngle = computeFloorClampedMaxPolarAngle(1.2, 4.0);
      const angleDeg = radToDeg(maxAngle);

      // (0.05 - 1.2) / 4.0 = -0.2875 -> acos(-0.2875) = ~106.7 deg
      expect(angleDeg).toBeGreaterThan(90);
      expect(angleDeg).toBeCloseTo(106.71, 1);

      // Verify camera at this max angle sits exactly at MIN_FLOOR_CLEARANCE_M (0.05m)
      const camY = 1.2 + 4.0 * Math.cos(maxAngle);
      expect(camY).toBeCloseTo(MIN_FLOOR_CLEARANCE_M, 4);
    });

    it('unlocks full bottom view (~176.4 deg) for high aerial / flying entities', () => {
      // Flying entity at Y = 10.0m, camera distance = 4.0m
      // Lowest camera point at bottom pole would be Y = 10 - 4 = 6.0m (well above 0.05m)
      const maxAngle = computeFloorClampedMaxPolarAngle(10.0, 4.0);
      expect(maxAngle).toBeCloseTo(MAX_SAFE_POLAR_ANGLE_RAD, 6);
      expect(radToDeg(maxAngle)).toBeCloseTo(176.4, 1);
    });

    it('dynamically tightens allowed polar angle as distance to elevated subject increases', () => {
      // Balcony / 2nd-floor actor at Y = 3.5m
      // At distance = 2.0m: min cam Y is 1.5m -> full bottom orbit unlocked
      const angleClose = computeFloorClampedMaxPolarAngle(3.5, 2.0);
      expect(angleClose).toBeCloseTo(MAX_SAFE_POLAR_ANGLE_RAD, 5);

      // At distance = 5.0m: min cam Y would dip below ground -> clamped to ~133.6 deg
      const angleFar = computeFloorClampedMaxPolarAngle(3.5, 5.0);
      expect(radToDeg(angleFar)).toBeLessThan(176.4);
      expect(radToDeg(angleFar)).toBeCloseTo(133.63, 1);

      const camYFar = 3.5 + 5.0 * Math.cos(angleFar);
      expect(camYFar).toBeCloseTo(MIN_FLOOR_CLEARANCE_M, 4);
    });

    it('clamps to horizontal (90 deg) when target is exactly at floor clearance', () => {
      // Object on floor at Y = 0.05m
      const maxAngle = computeFloorClampedMaxPolarAngle(0.05, 3.0);
      expect(radToDeg(maxAngle)).toBeCloseTo(90, 4);
    });

    it('clamps tightly when target is at or below floor level', () => {
      // Target below floor clearance (e.g. Y = 0.0m or Y = -0.5m)
      const maxAngleZero = computeFloorClampedMaxPolarAngle(0.0, 3.0);
      expect(radToDeg(maxAngleZero)).toBeLessThan(90);

      const maxAngleDeep = computeFloorClampedMaxPolarAngle(-1.0, 0.5);
      expect(maxAngleDeep).toBe(0.01);
    });

    it('handles near-zero distance gracefully without NaN', () => {
      const angle = computeFloorClampedMaxPolarAngle(1.0, 0.0);
      expect(Number.isFinite(angle)).toBe(true);
      expect(angle).toBeGreaterThan(0);
    });

    it('enforces metric camera distance bounds up to MAX_DISTANCE_M (100.0m)', () => {
      expect(CAMERA_LIMITS.MAX_DISTANCE_M).toBe(100.0);

      // Distance below minimum (0.4m) clamps to 0.4m
      const clampedMin = clampSphericalPose({
        target: { x: 0, y: 1, z: 0 },
        distance: 0.1,
        pitch: 0,
        yaw: 0,
        focalLengthMm: 35,
      });
      expect(clampedMin.distance).toBe(CAMERA_LIMITS.MIN_DISTANCE_M);

      // Valid long distance up to 100m preserves exactly
      const validLong = clampSphericalPose({
        target: { x: 0, y: 1, z: 0 },
        distance: 95.0,
        pitch: 0,
        yaw: 0,
        focalLengthMm: 35,
      });
      expect(validLong.distance).toBe(95.0);

      // Distance exceeding 100m clamps to MAX_DISTANCE_M
      const clampedMax = clampSphericalPose({
        target: { x: 0, y: 1, z: 0 },
        distance: 150.0,
        pitch: 0,
        yaw: 0,
        focalLengthMm: 35,
      });
      expect(clampedMax.distance).toBe(100.0);
    });
  });
});

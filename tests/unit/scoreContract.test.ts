/**
 * Universal Choreography Score Contract Test Suite.
 * Project-agnostic validation verifying that any choreography score (especially user-provided
 * and study scores) complies 100% with StageFlow kinematic, optical, and mathematical invariants.
 */

import { describe, expect, it } from 'vitest';
import { INITIAL_CATALOG_ITEMS } from '../../src/core/scoreCatalog';
import { computeStageFrame } from '../../src/core/frameEngine';
import type { StageScore } from '../../src/core/types';
import { CAMERA_LIMITS } from '../../src/core/constants';

const VALID_MANEUVERS = new Set([
  'cut',
  'dolly',
  'straight',
  'arc',
  'swoop',
  'orbit',
  'sweep',
  'spiral',
  'dive',
  'recoil',
  'spline',
]);

const VALID_EASINGS = new Set([
  'smooth',
  'linear',
  'accel',
  'deccel',
  'cruise',
  'ease-in',
  'ease-out',
  'expo',
  'pop',
  'ease-in-out',
  'sine',
]);

/**
 * Validates any StageScore against all universal StageFlow mathematical,
 * kinematic, and optical contract invariants without project-specific assumptions.
 */
export function validateScoreContract(score: StageScore): void {
  // 1. Root Metadata Invariants
  expect(score.id, 'score.id must be a non-empty string').toBeTruthy();
  expect(typeof score.id).toBe('string');
  expect(score.title, 'score.title must be a non-empty string').toBeTruthy();
  expect(score.aspectRatio, 'score.aspectRatio must be greater than 0').toBeGreaterThan(0);
  expect(score.durationSec, 'score.durationSec must be greater than 0').toBeGreaterThan(0);
  expect(score.stage.width, 'stage.width must be positive').toBeGreaterThan(0);
  expect(score.stage.depth, 'stage.depth must be positive').toBeGreaterThan(0);

  // 2. Baseline Camera Presets
  const obs = score.stage.defaultObserverPose;
  expect(obs.focalLengthMm).toBeGreaterThanOrEqual(10);
  expect(obs.distance).toBeGreaterThanOrEqual(0.1);
  expect(obs.distance).toBeLessThanOrEqual(CAMERA_LIMITS.MAX_DISTANCE_M);
  expect(Number.isFinite(obs.pitch)).toBe(true);
  expect(Number.isFinite(obs.yaw)).toBe(true);

  const stg = score.stage.defaultStageCameraPose;
  expect(stg.focalLengthMm).toBeGreaterThanOrEqual(10);
  expect(stg.distance).toBeGreaterThanOrEqual(0.1);
  expect(stg.distance).toBeLessThanOrEqual(CAMERA_LIMITS.MAX_DISTANCE_M);

  // 3. Entity Declarations
  const declaredEntityIds = new Set<string>();
  for (const ent of score.entities) {
    expect(ent.id, 'Entity id must be non-empty').toBeTruthy();
    expect(declaredEntityIds.has(ent.id), `Duplicate entity id "${ent.id}"`).toBe(false);
    declaredEntityIds.add(ent.id);

    expect(Number.isFinite(ent.position.x)).toBe(true);
    expect(Number.isFinite(ent.position.y)).toBe(true);
    expect(Number.isFinite(ent.position.z)).toBe(true);
    expect(ent.height).toBeGreaterThan(0);
  }

  // 4. Shots & Cinematography Chronology
  expect(score.shots.length, 'Score must contain at least one shot cue').toBeGreaterThan(0);

  for (let i = 0; i < score.shots.length; i++) {
    const shot = score.shots[i];
    expect(shot.id, `Shot at index ${i} missing id`).toBeTruthy();
    expect(shot.startSec, `Shot "${shot.id}" start must be non-negative`).toBeGreaterThanOrEqual(0);
    expect(shot.endSec, `Shot "${shot.id}" end must be strictly greater than start`).toBeGreaterThan(shot.startSec);
    expect(
      shot.endSec,
      `Shot "${shot.id}" end (${shot.endSec}s) exceeds score duration (${score.durationSec}s)`
    ).toBeLessThanOrEqual(score.durationSec + 0.1);

    if (shot.stageCamera) {
      const cam = shot.stageCamera;
      if (cam.maneuver) {
        expect(
          VALID_MANEUVERS.has(cam.maneuver),
          `Unrecognized maneuver "${cam.maneuver}" in shot "${shot.id}"`
        ).toBe(true);
      }
      if (cam.easing) {
        expect(
          VALID_EASINGS.has(cam.easing),
          `Unrecognized easing "${cam.easing}" in shot "${shot.id}"`
        ).toBe(true);
      }

      if (cam.focalLengthMm !== undefined) {
        expect(cam.focalLengthMm).toBeGreaterThanOrEqual(10);
        expect(cam.focalLengthMm).toBeLessThanOrEqual(500);
      }

      if (cam.distance !== undefined) {
        expect(cam.distance).toBeGreaterThanOrEqual(0.1);
        expect(cam.distance).toBeLessThanOrEqual(CAMERA_LIMITS.MAX_DISTANCE_M);
      }

      // Target Anchor Resolution
      if (typeof cam.target === 'string' && cam.target !== 'center') {
        expect(
          declaredEntityIds.has(cam.target),
          `Shot "${shot.id}" targets undeclared entity "${cam.target}"`
        ).toBe(true);
      }
    }
  }

  // 5. Decoupled Blocking Timeline (if defined)
  if (score.blocking) {
    for (let i = 0; i < score.blocking.length; i++) {
      const block = score.blocking[i];
      expect(block.id, `Blocking cue ${i} missing id`).toBeTruthy();
      expect(block.startSec).toBeGreaterThanOrEqual(0);
      expect(block.endSec).toBeGreaterThanOrEqual(block.startSec);
      expect(
        declaredEntityIds.has(block.entityId),
        `Blocking cue "${block.id}" references undeclared entity "${block.entityId}"`
      ).toBe(true);
    }
  }

  // 6. Decoupled Observer Shots (if defined)
  if (score.observerShots) {
    for (let i = 0; i < score.observerShots.length; i++) {
      const obsShot = score.observerShots[i];
      expect(obsShot.id, `Observer shot ${i} missing id`).toBeTruthy();
      expect(obsShot.startSec).toBeGreaterThanOrEqual(0);
      expect(obsShot.endSec).toBeGreaterThan(obsShot.startSec);

      if (typeof obsShot.camera?.target === 'string' && obsShot.camera.target !== 'center') {
        expect(
          declaredEntityIds.has(obsShot.camera.target),
          `Observer shot "${obsShot.id}" targets undeclared entity "${obsShot.camera.target}"`
        ).toBe(true);
      }
    }
  }

  // 7. Stateless Timeline Evaluation Invariant (Frame_t = f(t))
  const duration = score.durationSec;
  const sampleTimes = [0.0, duration * 0.25, duration * 0.5, duration * 0.75, duration];

  for (const t of sampleTimes) {
    const frame = computeStageFrame(t, score);

    // Stage Camera transform must be fully finite
    expect(Number.isFinite(frame.stageCamera.transform.position.x)).toBe(true);
    expect(Number.isFinite(frame.stageCamera.transform.position.y)).toBe(true);
    expect(Number.isFinite(frame.stageCamera.transform.position.z)).toBe(true);
    expect(Number.isFinite(frame.stageCamera.transform.target.x)).toBe(true);
    expect(Number.isFinite(frame.stageCamera.transform.target.y)).toBe(true);
    expect(Number.isFinite(frame.stageCamera.transform.target.z)).toBe(true);
    expect(frame.stageCamera.transform.fovDeg).toBeGreaterThan(10);
    expect(frame.stageCamera.transform.fovDeg).toBeLessThan(140);

    // Stage Camera DoF & Focus Distance invariants
    expect(frame.stageCamera.dof.focusDistanceM).toBeGreaterThanOrEqual(0.4);
    expect(frame.stageCamera.dof.nearLimitM).toBeLessThanOrEqual(
      frame.stageCamera.dof.focusDistanceM
    );
    expect(frame.stageCamera.dof.farLimitM).toBeGreaterThanOrEqual(
      frame.stageCamera.dof.focusDistanceM
    );

    // Observer Camera transform must be fully finite
    expect(Number.isFinite(frame.observerCamera.transform.position.x)).toBe(true);
    expect(Number.isFinite(frame.observerCamera.transform.position.y)).toBe(true);
    expect(Number.isFinite(frame.observerCamera.transform.position.z)).toBe(true);
    expect(Number.isFinite(frame.observerCamera.transform.target.x)).toBe(true);
    expect(Number.isFinite(frame.observerCamera.transform.target.y)).toBe(true);
    expect(Number.isFinite(frame.observerCamera.transform.target.z)).toBe(true);
    expect(frame.observerCamera.transform.fovDeg).toBeGreaterThan(10);
    expect(frame.observerCamera.transform.fovDeg).toBeLessThan(140);

    // Entity count preserved
    expect(frame.entitiesList.length).toBe(score.entities.length);
  }

  // Determinism check: jumping directly back to t = 0.5 * duration gives identical vectors
  const midTime = duration * 0.5;
  const frameDirect = computeStageFrame(midTime, score);
  // Do some random scrubs
  computeStageFrame(0.1, score);
  computeStageFrame(duration * 0.9, score);
  const frameScrubbed = computeStageFrame(midTime, score);

  expect(frameScrubbed.stageCamera.transform.position).toEqual(frameDirect.stageCamera.transform.position);
  expect(frameScrubbed.stageCamera.transform.target).toEqual(frameDirect.stageCamera.transform.target);
  expect(frameScrubbed.observerCamera.transform.position).toEqual(frameDirect.observerCamera.transform.position);
}

describe('Universal Choreography Score Contract Tests', () => {
  const studyItems = INITIAL_CATALOG_ITEMS.filter((item) => item.category === 'study');
  const blueprintItems = INITIAL_CATALOG_ITEMS.filter((item) => item.category === 'blueprint');

  describe('Scene Studies (Authored by Taruma Sakti)', () => {
    it('contains at least one official study score (default scene)', () => {
      expect(studyItems.length).toBeGreaterThan(0);
      expect(studyItems[0].id).toBe('vector-field');
      expect(studyItems[0].aliases).toContain('vector-field-taruma-sakti');
    });

    for (const item of studyItems) {
      it(`complies with all universal contract invariants: "${item.title}" (${item.id})`, () => {
        validateScoreContract(item.score);
      });
    }
  });

  describe('Factory Blueprints (Educational Presets & Testbeds)', () => {
    it('contains all 7 bundled blueprints', () => {
      expect(blueprintItems.length).toBe(7);
    });

    for (const item of blueprintItems) {
      it(`complies with all universal contract invariants: "${item.title}" (${item.id})`, () => {
        validateScoreContract(item.score);
      });
    }
  });
});

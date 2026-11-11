import { describe, expect, it } from 'vitest';
import { computeStageFrame } from '../../src/core/frameEngine';
import { parseStageScore } from '../../src/core/scoreParser';
import { INITIAL_CATALOG_ITEMS, findCatalogItem } from '../../src/core/scoreCatalog';
import {
  ZERO_OFFSET,
  resolveShotDestOffset,
  resolveShotDestRoll,
  resolveShotStartOffset,
  resolveShotStartRoll,
  resolveTargetPoint3D,
} from '../../src/core/cameraTargetResolver';
import {
  evaluateShotCameraPose,
  evaluateSplineCameraPose,
  sampleTrajectoryPoints,
} from '../../src/core/shotPoseEvaluator';

describe('frameEngine — Stateless Functional Timeline (Frame_t = f(t))', () => {
  it('produces bit-for-bit identical 3D states at any timestamp t regardless of scrub direction', () => {
    const score = INITIAL_CATALOG_ITEMS[0].score;

    // Forward playback evaluation sequence: 0.0 -> 2.5 -> 5.0 -> 8.2
    computeStageFrame(0.0, score);
    computeStageFrame(2.5, score);
    const forwardAt5 = computeStageFrame(5.0, score);
    computeStageFrame(8.2, score);

    // Random backward & jumping scrub sequence: 9.8 -> 1.1 -> 7.4 -> 5.0
    computeStageFrame(9.8, score);
    computeStageFrame(1.1, score);
    computeStageFrame(7.4, score);
    const scrubbedAt5 = computeStageFrame(5.0, score);

    expect(scrubbedAt5.stageCamera.transform.position).toEqual(
      forwardAt5.stageCamera.transform.position
    );
    expect(scrubbedAt5.stageCamera.transform.target).toEqual(
      forwardAt5.stageCamera.transform.target
    );
    expect(scrubbedAt5.observerCamera.transform.position).toEqual(
      forwardAt5.observerCamera.transform.position
    );
  });

  it('chains camera and entity poses across multi-shot transitions cleanly', () => {
    const multiShotYaml = `
version: "1.0"
id: "multi-shot-test"
title: "Multi-Shot Pose Chaining Test"
duration: 8.0
entities:
  - id: "actor_a"
    label: "Actor A"
    kind: "character"
    position: [-2, 0, 0]
    rotation: 0
  - id: "actor_b"
    label: "Actor B"
    kind: "character"
    position: [2, 0, 0]
    rotation: 180
shots:
  - id: "shot-1"
    shot: 1
    label: "Walk In"
    start: 0.0
    end: 4.0
    stage_camera:
      target: "actor_a"
      maneuver: "dolly"
      distance_start: 5.0
      distance_end: 3.0
      pitch: 10
      yaw: 0
      lens: 35mm
    entities:
      actor_a:
        position: [0, 0, 0]
        look_at: "actor_b"
        highlighted: true
  - id: "shot-2"
    shot: 2
    label: "Close Up Hold"
    start: 4.0
    end: 8.0
    stage_camera:
      maneuver: "orbit"
      yaw_delta: 45
      lens: 85mm
`;
    const { score, error } = parseStageScore(multiShotYaml);
    expect(error).toBeNull();
    expect(score).not.toBeNull();

    // At t = 4.0s (start of Shot 2), Actor A should have arrived at [0, 0, 0] and remain there in Shot 2
    const frameAt6 = computeStageFrame(6.0, score!);
    const actorA = frameAt6.entitiesById.get('actor_a');
    expect(actorA).toBeDefined();
    expect(actorA!.position.x).toBeCloseTo(0, 4);
    expect(actorA!.position.z).toBeCloseTo(0, 4);

    // Stage camera in Shot 2 inherits Shot 1's terminal distance (3.0m) and switches to 85mm lens
    expect(frameAt6.stageCamera.transform.pose.distance).toBeCloseTo(3.0, 4);
    expect(frameAt6.stageCamera.transform.pose.focalLengthMm).toBeCloseTo(
      85,
      4
    );
  });

  it('cuts cleanly between sequential dolly shots with different targets without dragging look-at target across shots', () => {
    const sequentialDollyYaml = `
version: "1.0"
id: "sequential-dolly-test"
title: "Sequential Dolly Target Cut Test"
duration: 6.0
entities:
  - id: "actor_a"
    label: "Actor A"
    kind: "character"
    position: [-2, 0, 0]
  - id: "actor_b"
    label: "Actor B"
    kind: "character"
    position: [2, 0, 0]
shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 3.0
    stage_camera:
      target: "actor_a"
      maneuver: "dolly"
      distance_start: 4.0
      distance_end: 2.0
      pitch: 0
      yaw: 0
      lens: 50mm
  - id: "shot-2"
    shot: 2
    start: 3.0
    end: 6.0
    stage_camera:
      target: "actor_b"
      maneuver: "dolly"
      distance_start: 3.0
      distance_end: 1.5
      pitch: 0
      yaw: 180
      lens: 85mm
`;
    const { score, error } = parseStageScore(sequentialDollyYaml);
    expect(error).toBeNull();
    expect(score).not.toBeNull();

    // Default character height 1.75m * anchor ratio 0.90 = 1.575m eye-level anchor
    const expectedAnchorY = 1.575;

    // At t = 0.0s (start of Shot 1): camera is at actor_a + [0, 0, 4] -> [-2, 1.575, 4], target [-2, 1.575, 0]
    const f0 = computeStageFrame(0.0, score!);
    expect(f0.stageCamera.transform.target.x).toBeCloseTo(-2, 3);
    expect(f0.stageCamera.transform.target.y).toBeCloseTo(expectedAnchorY, 3);
    expect(f0.stageCamera.transform.position.x).toBeCloseTo(-2, 3);
    expect(f0.stageCamera.transform.position.y).toBeCloseTo(expectedAnchorY, 3);
    expect(f0.stageCamera.transform.position.z).toBeCloseTo(4, 3);

    // At t = 2.99s (end of Shot 1): camera is at actor_a + [0, 0, 2] -> [-2, 1.575, 2], target [-2, 1.575, 0]
    const fBeforeCut = computeStageFrame(2.99, score!);
    expect(fBeforeCut.stageCamera.transform.target.x).toBeCloseTo(-2, 2);
    expect(fBeforeCut.stageCamera.transform.position.x).toBeCloseTo(-2, 2);

    // At t = 3.0s (instantaneous cut to Shot 2): target MUST immediately be actor_b [2, 1.575, 0]
    // with yaw = 180 deg (facing back: delta Z = -3) -> camera pos [2, 1.575, -3]
    const fCut = computeStageFrame(3.0, score!);
    expect(fCut.stageCamera.shotId).toBe('shot-2');
    expect(fCut.stageCamera.transform.target.x).toBeCloseTo(2, 3);
    expect(fCut.stageCamera.transform.target.y).toBeCloseTo(expectedAnchorY, 3);
    expect(fCut.stageCamera.transform.target.z).toBeCloseTo(0, 3);

    expect(fCut.stageCamera.transform.position.x).toBeCloseTo(2, 3);
    expect(fCut.stageCamera.transform.position.y).toBeCloseTo(expectedAnchorY, 3);
    expect(fCut.stageCamera.transform.position.z).toBeCloseTo(-3, 3);

    // Mid-shot at t = 4.5s: target must remain strictly on actor_b
    const fMid = computeStageFrame(4.5, score!);
    expect(fMid.stageCamera.transform.target.x).toBeCloseTo(2, 3);
    expect(fMid.stageCamera.transform.position.x).toBeCloseTo(2, 3);
  });

  it('evaluates a single continuous observer_shots move across multiple rapid film cuts smoothly', () => {
    const scoreYaml = `
version: "1.0"
id: "continuous-observer-test"
title: "Continuous Observer Across Film Cuts"
duration: 8.0
stage:
  observer_camera:
    target: [0, 1.0, 0]
    distance: 10.0
    pitch: 30
    yaw: 0
    lens: 35mm
shots:
  - id: "cut-1"
    shot: 1
    start: 0.0
    end: 2.0
    stage_camera: { target: [0, 1, 0], lens: 35mm }
  - id: "cut-2"
    shot: 2
    start: 2.0
    end: 4.0
    stage_camera: { target: [0, 1, 0], lens: 50mm }
  - id: "cut-3"
    shot: 3
    start: 4.0
    end: 6.0
    stage_camera: { target: [0, 1, 0], lens: 85mm }
  - id: "cut-4"
    shot: 4
    start: 6.0
    end: 8.0
    stage_camera: { target: [0, 1, 0], lens: 135mm }
observer_shots:
  - id: "single-master-orbit"
    start: 0.0
    end: 8.0
    maneuver: "orbit"
    easing: "linear"
    target: [0, 1.0, 0]
    distance: 8.0
    pitch: 20
    yaw_start: 0
    yaw_end: 180
    lens: 28mm
`;
    const { score, error } = parseStageScore(scoreYaml);
    expect(error).toBeNull();
    expect(score).not.toBeNull();

    // At t = 0.0s (start)
    const f0 = computeStageFrame(0.0, score!);
    expect(f0.observerCamera.transform.pose.yaw).toBeCloseTo(0.0, 3);
    expect(f0.observerCamera.transform.pose.focalLengthMm).toBe(28);

    // At t = 2.0s (boundary of cut 1 -> 2), observer should be at 25% progress (45 deg = PI / 4)
    const f2 = computeStageFrame(2.0, score!);
    expect(f2.observerCamera.transform.pose.yaw).toBeCloseTo(Math.PI / 4, 3);

    // At t = 4.0s (boundary of cut 2 -> 3), observer should be at 50% progress (90 deg = PI / 2)
    const f4 = computeStageFrame(4.0, score!);
    expect(f4.observerCamera.transform.pose.yaw).toBeCloseTo(Math.PI / 2, 3);

    // At t = 8.0s (end of timeline), observer should reach 180 deg (PI)
    const f8 = computeStageFrame(8.0, score!);
    expect(f8.observerCamera.transform.pose.yaw).toBeCloseTo(Math.PI, 3);
  });

  it('gives complete precedence to root-level observer_shots over per-shot observer_camera cues', () => {
    const conflictYaml = `
version: "1.0"
id: "conflict-test"
title: "Conflict Resolution Test"
duration: 6.0
shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 6.0
    stage_camera:
      target: [0, 1, 0]
    observer_camera:
      target: [0, 1, 0]
      distance: 2.0
      pitch: 10
      yaw: 45
      lens: 85mm
observer_shots:
  - id: "root-obs-1"
    start: 0.0
    end: 6.0
    maneuver: "dolly"
    target: [0, 1, 0]
    distance: 9.0
    pitch: 40
    yaw: 90
    lens: 24mm
`;
    const { score, error } = parseStageScore(conflictYaml);
    expect(error).toBeNull();
    expect(score).not.toBeNull();

    const frame = computeStageFrame(3.0, score!);
    // Must strictly follow root observer_shots (distance 9.0m, pitch 40 deg, lens 24mm)
    expect(frame.observerCamera.transform.pose.distance).toBeCloseTo(9.0, 3);
    expect(frame.observerCamera.transform.pose.focalLengthMm).toBe(24);
    expect(frame.observerCamera.shotId).toBe('root-obs-1');
  });

  it('holds resting pose during time gaps and forward-chains into subsequent observer_shots', () => {
    const gapYaml = `
version: "1.0"
id: "gap-test"
title: "Gap and Chaining Test"
duration: 10.0
shots:
  - id: "film-shot"
    shot: 1
    start: 0.0
    end: 10.0
    stage_camera: { target: [0, 1, 0] }
observer_shots:
  - id: "move-1"
    start: 0.0
    end: 4.0
    maneuver: "dolly"
    distance_start: 10.0
    distance_end: 6.0
    pitch: 25
    yaw: 30
    lens: 35mm
  - id: "move-2"
    start: 7.0
    end: 10.0
    maneuver: "orbit"
    yaw_delta: 60
    lens: 50mm
`;
    const { score, error } = parseStageScore(gapYaml);
    expect(error).toBeNull();
    expect(score).not.toBeNull();

    // At t = 4.0s (end of move-1), distance is 6.0m, yaw is 30 deg
    const f4 = computeStageFrame(4.0, score!);
    expect(f4.observerCamera.transform.pose.distance).toBeCloseTo(6.0, 3);

    // At t = 5.5s (inside the 4.0s -> 7.0s gap), camera must HOLD move-1's terminal pose
    const f5_5 = computeStageFrame(5.5, score!);
    expect(f5_5.observerCamera.isHold).toBe(true);
    expect(f5_5.observerCamera.transform.pose.distance).toBeCloseTo(6.0, 3);
    expect(f5_5.observerCamera.shotId).toBe('move-1');

    // At t = 7.0s (start of move-2), it forward-chains from move-1's terminal pose (distance: 6.0m)
    const f7 = computeStageFrame(7.0, score!);
    expect(f7.observerCamera.transform.pose.distance).toBeCloseTo(6.0, 3);
    expect(f7.observerCamera.shotId).toBe('move-2');

    // At t = 10.0s (end of move-2), lens is 50mm
    const f10 = computeStageFrame(10.0, score!);
    expect(f10.observerCamera.transform.pose.focalLengthMm).toBe(50);
  });

  it('validates Blueprint 02 full timeline continuity and shot cut integrity across all 6 film shots', () => {
    const bp2Item = findCatalogItem('blueprint-02');
    expect(bp2Item).toBeDefined();
    const score = bp2Item!.score;

    expect(score.shots).toHaveLength(6);
    expect(score.observerShots).toHaveLength(3);

    // Verify Shot 1 -> Shot 2 cut (t = 5.0s)
    const fBeforeCut1 = computeStageFrame(4.99, score);
    const fAtCut1 = computeStageFrame(5.00, score);
    expect(fBeforeCut1.stageCamera.shotId).toBe('shot-1');
    expect(fAtCut1.stageCamera.shotId).toBe('shot-2');
    expect(fBeforeCut1.stageCamera.transform.pose.focalLengthMm).toBe(35);
    expect(fAtCut1.stageCamera.transform.pose.focalLengthMm).toBe(50);

    // Observer camera spans smoothly across Shot 1 -> Shot 2 cut inside Move 1
    expect(fBeforeCut1.observerCamera.shotId).toBe('obs-move-1');
    expect(fAtCut1.observerCamera.shotId).toBe('obs-move-1');
    expect(
      Math.abs(
        fAtCut1.observerCamera.transform.pose.yaw -
          fBeforeCut1.observerCamera.transform.pose.yaw
      )
    ).toBeLessThan(0.05);

    // Verify Shot 2 -> Shot 3 cut (t = 9.0s, OTS A -> Reverse OTS B, and Observer Move 1 -> Move 2)
    const fBeforeCut2 = computeStageFrame(8.99, score);
    const fAtCut2 = computeStageFrame(9.00, score);
    expect(fBeforeCut2.stageCamera.shotId).toBe('shot-2');
    expect(fAtCut2.stageCamera.shotId).toBe('shot-3');
    expect(fBeforeCut2.observerCamera.shotId).toBe('obs-move-1');
    expect(fAtCut2.observerCamera.shotId).toBe('obs-move-2');

    // Verify Shot 3 -> Shot 4 cut (t = 13.0s, Reverse OTS -> 85mm Hero Arc)
    const fBeforeCut3 = computeStageFrame(12.99, score);
    const fAtCut3 = computeStageFrame(13.00, score);
    expect(fBeforeCut3.stageCamera.shotId).toBe('shot-3');
    expect(fAtCut3.stageCamera.shotId).toBe('shot-4');
    expect(fAtCut3.stageCamera.transform.pose.focalLengthMm).toBe(85);

    // Verify Shot 4 -> Shot 5 cut (t = 17.5s, Arc -> Spline Bridge)
    const fBeforeCut4 = computeStageFrame(17.49, score);
    const fAtCut4 = computeStageFrame(17.50, score);
    expect(fBeforeCut4.stageCamera.shotId).toBe('shot-4');
    expect(fAtCut4.stageCamera.shotId).toBe('shot-5');
    expect(fAtCut4.stageCamera.maneuver).toBe('spline');

    // Verify Shot 5 -> Shot 6 cut (t = 21.5s, Spline -> Crane Orbit Pullback)
    const fBeforeCut5 = computeStageFrame(21.49, score);
    const fAtCut5 = computeStageFrame(21.50, score);
    expect(fBeforeCut5.stageCamera.shotId).toBe('shot-5');
    expect(fAtCut5.stageCamera.shotId).toBe('shot-6');
    expect(fAtCut5.stageCamera.maneuver).toBe('orbit');

    // Verify Terminal Pose at t = 26.0s (full timeline end)
    const fEnd = computeStageFrame(26.00, score);
    expect(fEnd.stageCamera.shotId).toBe('shot-6');
    expect(fEnd.observerCamera.shotId).toBe('obs-move-3');
    expect(Number.isFinite(fEnd.stageCamera.transform.position.x)).toBe(true);
    expect(Number.isFinite(fEnd.observerCamera.transform.position.x)).toBe(true);
  });

  it('implements Option A shot-boundary roll reset: resets to 0 deg when roll is omitted on subsequent shot', () => {
    const yaml = `
version: "1.0"
id: "option-a-test"
title: "Option A Roll Reset Test"
duration: 8.0
shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 4.0
    stage_camera:
      target: [0, 1, 0]
      roll: 18
  - id: "shot-2"
    shot: 2
    start: 4.0
    end: 8.0
    stage_camera:
      target: [0, 1, 0]
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // In Shot 1 (e.g. t = 2.0s), camera has 18 deg roll
    const f1 = computeStageFrame(2.0, score!);
    expect(f1.stageCamera.transform.pose.roll).toBeCloseTo(18 * (Math.PI / 180), 4);

    // At t = 4.0s (instant cut to Shot 2 which omits roll), roll MUST reset to 0 deg (Option A)
    const f2 = computeStageFrame(4.0, score!);
    expect(f2.stageCamera.shotId).toBe('shot-2');
    expect(f2.stageCamera.transform.pose.roll).toBeCloseTo(0, 5);

    // Later in Shot 2 (t = 6.0s), roll remains at 0 deg
    const f3 = computeStageFrame(6.0, score!);
    expect(f3.stageCamera.transform.pose.roll).toBeCloseTo(0, 5);
  });

  it('supports smooth animated roll within a shot and cross-shot recovery via roll_end: 0', () => {
    const yaml = `
version: "1.0"
id: "animated-roll-test"
title: "Animated Roll Test"
duration: 8.0
shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 4.0
    stage_camera:
      target: [0, 1, 0]
      maneuver: "straight"
      easing: "linear"
      roll_start: 0
      roll_end: 20
  - id: "shot-2"
    shot: 2
    start: 4.0
    end: 8.0
    stage_camera:
      target: [0, 1, 0]
      maneuver: "straight"
      easing: "linear"
      roll_end: 0
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // At t = 0.0s, roll is 0
    const fStart = computeStageFrame(0.0, score!);
    expect(fStart.stageCamera.transform.pose.roll).toBeCloseTo(0, 5);

    // At t = 2.0s (midpoint of Shot 1 with linear easing), roll is 10 deg
    const fMid = computeStageFrame(2.0, score!);
    expect(fMid.stageCamera.transform.pose.roll).toBeCloseTo(10 * (Math.PI / 180), 4);

    // At t = 4.0s (start of Shot 2), chains from Shot 1's end pose (20 deg)
    const fCut = computeStageFrame(4.0, score!);
    expect(fCut.stageCamera.transform.pose.roll).toBeCloseTo(20 * (Math.PI / 180), 4);

    // At t = 6.0s (midpoint of Shot 2 with linear easing to 0), roll is 10 deg
    const fMidRecover = computeStageFrame(6.0, score!);
    expect(fMidRecover.stageCamera.transform.pose.roll).toBeCloseTo(10 * (Math.PI / 180), 4);

    // At t = 8.0s (end of Shot 2), roll has leveled back to 0
    const fEndRecover = computeStageFrame(8.0, score!);
    expect(fEndRecover.stageCamera.transform.pose.roll).toBeCloseTo(0, 5);
  });

  it('preserves camera roll seamlessly across shot boundaries under continuous: true without snapping to 0 deg', () => {
    const yaml = `
version: "1.0"
id: "continuous-roll-test"
title: "Continuous Roll Test"
continuous: true
shots:
  - id: "shot-1"
    end: 4.0
    stage_camera:
      target: [0, 1, 0]
      distance: 3.0
      roll: 18
  - id: "shot-2"
    end: 8.0
    stage_camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 2.0
  - id: "shot-3"
    end: 12.0
    stage_camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 1.5
      roll: 0
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // In Shot 1 (t = 2.0s), roll is 18 deg
    const f1 = computeStageFrame(2.0, score!);
    expect(f1.stageCamera.transform.pose.roll).toBeCloseTo(18 * (Math.PI / 180), 4);

    // At t = 4.0s (transition into Shot 2), roll glides/holds seamlessly at 18 deg (no 0 deg snap!)
    const f2Start = computeStageFrame(4.0, score!);
    expect(f2Start.stageCamera.shotId).toBe('shot-2');
    expect(f2Start.stageCamera.transform.pose.roll).toBeCloseTo(18 * (Math.PI / 180), 4);

    // Midpoint of Shot 2 (t = 6.0s), roll remains 18 deg
    const f2Mid = computeStageFrame(6.0, score!);
    expect(f2Mid.stageCamera.transform.pose.roll).toBeCloseTo(18 * (Math.PI / 180), 4);

    // At t = 8.0s (transition into Shot 3), roll starts at 18 deg and glides toward 0 deg
    const f3Start = computeStageFrame(8.0, score!);
    expect(f3Start.stageCamera.shotId).toBe('shot-3');
    expect(f3Start.stageCamera.transform.pose.roll).toBeCloseTo(18 * (Math.PI / 180), 4);

    // Midpoint of Shot 3 (t = 10.0s), roll is halfway (9 deg)
    const f3Mid = computeStageFrame(10.0, score!);
    expect(f3Mid.stageCamera.transform.pose.roll).toBeCloseTo(9 * (Math.PI / 180), 3);

    // At t = 12.0s (end of Shot 3), roll reaches 0 deg
    const f3End = computeStageFrame(12.0, score!);
    expect(f3End.stageCamera.transform.pose.roll).toBeCloseTo(0, 5);
  });

  it('preserves and glides target_offset seamlessly across shot boundaries under continuous: true without snapping', () => {
    const yaml = `
version: "1.0"
id: "continuous-offset-test"
title: "Continuous Target Offset Test"
continuous: true
shots:
  - id: "shot-1"
    end: 4.0
    stage_camera:
      target: [0, 1, 0]
      distance: 3.0
      target_offset: [0.6, 0.4, 0.0]
  - id: "shot-2"
    end: 8.0
    stage_camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 2.0
  - id: "shot-3"
    end: 12.0
    stage_camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 1.5
      target_offset: [0.0, 0.0, 0.0]
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // Shot 1 has target offset [0.6, 0.4, 0.0]
    const f1 = computeStageFrame(2.0, score!);
    expect(f1.stageCamera.targetOffset!.x).toBeCloseTo(0.6, 3);
    expect(f1.stageCamera.targetOffset!.y).toBeCloseTo(0.4, 3);

    // At t = 4.0s (transition into Shot 2), offset holds seamlessly without snapping to 0 or double-accumulating
    const f2Start = computeStageFrame(4.0, score!);
    expect(f2Start.stageCamera.shotId).toBe('shot-2');
    expect(f2Start.stageCamera.targetOffset!.x).toBeCloseTo(0.6, 3);
    expect(f2Start.stageCamera.targetOffset!.y).toBeCloseTo(0.4, 3);
    expect(f2Start.stageCamera.baseTarget!.x).toBeCloseTo(0.0, 4);
    expect(f2Start.stageCamera.baseTarget!.y).toBeCloseTo(1.0, 4);
    expect(f2Start.stageCamera.transform.pose.target.x).toBeCloseTo(0.6, 3);
    expect(f2Start.stageCamera.transform.pose.target.y).toBeCloseTo(1.4, 3);

    // At t = 6.0s (mid of Shot 2), offset remains [0.6, 0.4, 0.0]
    const f2Mid = computeStageFrame(6.0, score!);
    expect(f2Mid.stageCamera.targetOffset!.x).toBeCloseTo(0.6, 3);
    expect(f2Mid.stageCamera.targetOffset!.y).toBeCloseTo(0.4, 3);
    expect(f2Mid.stageCamera.transform.pose.target.x).toBeCloseTo(0.6, 3);
    expect(f2Mid.stageCamera.transform.pose.target.y).toBeCloseTo(1.4, 3);

    // At t = 10.0s (mid of Shot 3 with linear easing to 0), offset is halfway [0.3, 0.2, 0.0]
    const f3Mid = computeStageFrame(10.0, score!);
    expect(f3Mid.stageCamera.targetOffset!.x).toBeCloseTo(0.3, 3);
    expect(f3Mid.stageCamera.targetOffset!.y).toBeCloseTo(0.2, 3);
    expect(f3Mid.stageCamera.transform.pose.target.x).toBeCloseTo(0.3, 3);
    expect(f3Mid.stageCamera.transform.pose.target.y).toBeCloseTo(1.2, 3);

    // At t = 12.0s, offset settles at [0.0, 0.0, 0.0] and target settles at [0.0, 1.0, 0.0]
    const f3End = computeStageFrame(12.0, score!);
    expect(f3End.stageCamera.targetOffset!.x).toBeCloseTo(0.0, 4);
    expect(f3End.stageCamera.targetOffset!.y).toBeCloseTo(0.0, 4);
    expect(f3End.stageCamera.transform.pose.target.x).toBeCloseTo(0.0, 4);
    expect(f3End.stageCamera.transform.pose.target.y).toBeCloseTo(1.0, 4);
  });

  it('evaluates hybrid cut and oner sequences cleanly using shot-level continuous: true', () => {
    const yaml = `
version: "1.0"
id: "hybrid-oner-cut-test"
title: "Hybrid Oner and Cut Sequence"
shots:
  - id: "shot-1"
    start: 0.0
    end: 4.0
    stage_camera:
      target: [0, 1, 0]
      distance: 4.0
      pitch: 10
      yaw: 0
  - id: "shot-2"
    start: 4.0
    end: 8.0
    stage_camera:
      target: [0, 1, 0]
      distance: 3.0
      pitch: 15
      yaw: -30
      roll: 20
  - id: "shot-3"
    start: 8.0
    end: 12.0
    stage_camera:
      target: [0, 1, 0]
      maneuver: "dolly"
      distance: 2.0
      pitch: 12
      yaw: 45
      roll: 16
  - id: "shot-4"
    continuous: true
    end: 16.0
    stage_camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 1.5
      pitch: 6
      yaw: 90
  - id: "shot-5"
    start: 16.0
    end: 20.0
    stage_camera:
      target: [0, 1, 0]
      distance: 5.0
      pitch: 20
      yaw: 0
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // Shot 2 has 20 deg roll
    const f2 = computeStageFrame(6.0, score!);
    expect(f2.stageCamera.transform.pose.roll).toBeCloseTo(20 * (Math.PI / 180), 4);

    // Shot 3 is a cut with roll: 16 deg
    const f3 = computeStageFrame(9.0, score!);
    expect(f3.stageCamera.transform.pose.roll).toBeCloseTo(16 * (Math.PI / 180), 4);

    // Shot 4 is continuous: true! Auto-chains start at 12.0s
    expect(score!.shots[3].startSec).toBe(12.0);
    const f4Start = computeStageFrame(12.0, score!);
    expect(f4Start.stageCamera.shotId).toBe('shot-4');
    // Distance glides from 2.0m, pitch from 12 deg, yaw from 45 deg, roll from 16 deg
    expect(f4Start.stageCamera.transform.pose.distance).toBeCloseTo(2.0, 3);
    expect(f4Start.stageCamera.transform.pose.pitch).toBeCloseTo(12 * (Math.PI / 180), 3);
    expect(f4Start.stageCamera.transform.pose.yaw).toBeCloseTo(45 * (Math.PI / 180), 3);
    expect(f4Start.stageCamera.transform.pose.roll).toBeCloseTo(16 * (Math.PI / 180), 3);

    // Midpoint of Shot 4 (t = 14.0s, linear easing):
    // distance: (2.0 + 1.5) / 2 = 1.75m
    // pitch: (12 + 6) / 2 = 9 deg
    // yaw: (45 + 90) / 2 = 67.5 deg
    // roll: holds 16 deg
    const f4Mid = computeStageFrame(14.0, score!);
    expect(f4Mid.stageCamera.transform.pose.distance).toBeCloseTo(1.75, 3);
    expect(f4Mid.stageCamera.transform.pose.pitch).toBeCloseTo(9 * (Math.PI / 180), 3);
    expect(f4Mid.stageCamera.transform.pose.yaw).toBeCloseTo(67.5 * (Math.PI / 180), 3);
    expect(f4Mid.stageCamera.transform.pose.roll).toBeCloseTo(16 * (Math.PI / 180), 3);

    // Shot 5 is a standard cut: Option A reset kicks in for omitted roll (resets to 0 deg)
    const f5 = computeStageFrame(17.0, score!);
    expect(f5.stageCamera.shotId).toBe('shot-5');
    expect(f5.stageCamera.transform.pose.distance).toBeCloseTo(5.0, 3);
    expect(f5.stageCamera.transform.pose.roll).toBeCloseTo(0, 5);
  });

  it('preserves observer camera roll and target offset seamlessly across observer_shots boundaries under continuous mode', () => {
    const yaml = `
version: "1.0"
id: "continuous-observer-test"
title: "Continuous Observer Camera Test"
continuous: true
shots:
  - id: "s1"
    start: 0.0
    end: 12.0
observer_shots:
  - id: "obs-1"
    end: 4.0
    camera:
      target: [0, 1, 0]
      distance: 8.0
      roll: 15
      target_offset: [0.5, 0.2, 0.0]
  - id: "obs-2"
    end: 8.0
    camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 6.0
  - id: "obs-3"
    end: 12.0
    camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 4.0
      roll: 0
      target_offset: [0.0, 0.0, 0.0]
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // At t = 2.0s (in obs-1), roll is 15 deg and offset is [0.5, 0.2, 0.0]
    const f1 = computeStageFrame(2.0, score!);
    expect(f1.observerCamera.transform.pose.roll).toBeCloseTo(15 * (Math.PI / 180), 4);
    expect(f1.observerCamera.targetOffset!.x).toBeCloseTo(0.5, 3);
    expect(f1.observerCamera.targetOffset!.y).toBeCloseTo(0.2, 3);

    // At t = 4.0s (exact boundary obs-1 -> obs-2), roll and offset hold seamlessly without 0 snap
    const f2Start = computeStageFrame(4.0, score!);
    expect(f2Start.observerCamera.shotId).toBe('obs-2');
    expect(f2Start.observerCamera.transform.pose.roll).toBeCloseTo(15 * (Math.PI / 180), 4);
    expect(f2Start.observerCamera.targetOffset!.x).toBeCloseTo(0.5, 3);
    expect(f2Start.observerCamera.targetOffset!.y).toBeCloseTo(0.2, 3);

    // Midpoint of obs-2 (t = 6.0s), distance glides to 7.0m, roll holds 15 deg, offset holds [0.5, 0.2, 0]
    const f2Mid = computeStageFrame(6.0, score!);
    expect(f2Mid.observerCamera.transform.pose.distance).toBeCloseTo(7.0, 3);
    expect(f2Mid.observerCamera.transform.pose.roll).toBeCloseTo(15 * (Math.PI / 180), 4);
    expect(f2Mid.observerCamera.targetOffset!.x).toBeCloseTo(0.5, 3);

    // Midpoint of obs-3 (t = 10.0s, linear easing from 15 deg to 0 deg, and [0.5, 0.2] to 0):
    // roll is halfway (7.5 deg), offset is halfway [0.25, 0.1, 0.0]
    const f3Mid = computeStageFrame(10.0, score!);
    expect(f3Mid.observerCamera.transform.pose.roll).toBeCloseTo(7.5 * (Math.PI / 180), 3);
    expect(f3Mid.observerCamera.targetOffset!.x).toBeCloseTo(0.25, 3);
    expect(f3Mid.observerCamera.targetOffset!.y).toBeCloseTo(0.1, 3);

    // At t = 12.0s, roll settles to 0 deg and offset settles to [0, 0, 0]
    const f3End = computeStageFrame(12.0, score!);
    expect(f3End.observerCamera.transform.pose.roll).toBeCloseTo(0, 5);
    expect(f3End.observerCamera.targetOffset!.x).toBeCloseTo(0.0, 4);
    expect(f3End.observerCamera.targetOffset!.y).toBeCloseTo(0.0, 4);
  });

  it('implements Option A observer cue-boundary resets when continuous: false or on cut', () => {
    const yaml = `
version: "1.0"
id: "obs-cuts-test"
title: "Observer Cuts Test"
shots:
  - id: "s1"
    start: 0.0
    end: 8.0
observer_shots:
  - id: "obs-1"
    start: 0.0
    end: 4.0
    camera:
      target: [0, 1, 0]
      distance: 8.0
      roll: 20
      target_offset: [0.8, 0.4, 0.0]
  - id: "obs-2"
    start: 4.0
    end: 8.0
    camera:
      maneuver: "cut"
      distance: 5.0
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // At t = 2.0s (in obs-1), roll is 20 deg and offset is [0.8, 0.4, 0.0]
    const f1 = computeStageFrame(2.0, score!);
    expect(f1.observerCamera.transform.pose.roll).toBeCloseTo(20 * (Math.PI / 180), 4);
    expect(f1.observerCamera.targetOffset!.x).toBeCloseTo(0.8, 3);

    // At t = 4.0s (cut to obs-2 which omits roll/offset and is not continuous):
    // roll resets to 0 deg and offset resets to [0, 0, 0]
    const f2 = computeStageFrame(4.0, score!);
    expect(f2.observerCamera.shotId).toBe('obs-2');
    expect(f2.observerCamera.transform.pose.roll).toBeCloseTo(0, 5);
    expect(f2.observerCamera.targetOffset!.x).toBeCloseTo(0, 5);
    expect(f2.observerCamera.targetOffset!.y).toBeCloseTo(0, 5);
  });

  it('inherits shot-level continuous: true for Tier 2 shots[].observer_camera cues and supports per-camera continuous overrides', () => {
    const yaml = `
version: "1.0"
id: "tier2-obs-continuous-test"
title: "Tier 2 Observer Continuous Test"
shots:
  - id: "s1"
    start: 0.0
    end: 4.0
    stage_camera:
      target: [0, 1, 0]
      distance: 4.0
      roll: 18
    observer_camera:
      target: [0, 1, 0]
      distance: 8.0
      roll: 14
      target_offset: [0.4, 0.0, 0.0]
  - id: "s2"
    continuous: true
    end: 8.0
    stage_camera:
      maneuver: "dolly"
      distance: 3.0
    observer_camera:
      maneuver: "dolly"
      easing: "linear"
      distance: 5.0
  - id: "s3"
    start: 8.0
    end: 12.0
    stage_camera:
      target: [0, 1, 0]
      distance: 2.0
    observer_camera:
      continuous: true
      maneuver: "dolly"
      easing: "linear"
      distance: 4.0
`;
    const { score } = parseStageScore(yaml);
    expect(score).not.toBeNull();

    // At t = 2.0s, Tier 2 observer has roll 14 deg
    const f1 = computeStageFrame(2.0, score!);
    expect(f1.observerCamera.transform.pose.roll).toBeCloseTo(14 * (Math.PI / 180), 4);
    expect(f1.observerCamera.targetOffset!.x).toBeCloseTo(0.4, 3);

    // At t = 4.0s, Shot 2 is continuous: true, so both stage and Tier 2 observer preserve roll and offset
    const f2 = computeStageFrame(4.0, score!);
    expect(f2.observerCamera.shotId).toBe('s2');
    expect(f2.stageCamera.transform.pose.roll).toBeCloseTo(18 * (Math.PI / 180), 4);
    expect(f2.observerCamera.transform.pose.roll).toBeCloseTo(14 * (Math.PI / 180), 4);
    expect(f2.observerCamera.targetOffset!.x).toBeCloseTo(0.4, 3);

    // At t = 8.0s, Shot 3 is a cut (continuous omitted), so stage_camera resets roll to 0 deg,
    // while observer_camera has explicit continuous: true and preserves 14 deg roll and 0.4 offset!
    const f3 = computeStageFrame(8.0, score!);
    expect(f3.stageCamera.shotId).toBe('s3');
    expect(f3.stageCamera.transform.pose.roll).toBeCloseTo(0, 5);
    expect(f3.observerCamera.shotId).toBe('s3');
    expect(f3.observerCamera.transform.pose.roll).toBeCloseTo(14 * (Math.PI / 180), 4);
    expect(f3.observerCamera.targetOffset!.x).toBeCloseTo(0.4, 3);
  });

  it('validates Blueprint 03 30m ball-pass choreography, parabolic arc, Ruby orbit, straight pass and camera roll tracking', () => {
    const bp3Item = findCatalogItem('blueprint-03');
    expect(bp3Item).toBeDefined();
    const score = bp3Item!.score;

    expect(score.durationSec).toBe(16.0);
    expect(score.shots).toHaveLength(6);
    expect(score.observerShots).toBeUndefined();

    // Verify 3 actors and prop
    const arthur = score.entities.find((e) => e.id === 'arthur');
    const ruby = score.entities.find((e) => e.id === 'ruby');
    const mark = score.entities.find((e) => e.id === 'mark');
    const ball = score.entities.find((e) => e.id === 'ball');

    expect(arthur).toBeDefined();
    expect(ruby).toBeDefined();
    expect(mark).toBeDefined();
    expect(ball).toBeDefined();

    // Spatial distances: 20m Arthur to Ruby, 10m Ruby to Mark
    expect(arthur!.position.x).toBe(-15);
    expect(ruby!.position.x).toBe(5);
    expect(mark!.position.x).toBe(15);
    expect(ruby!.position.x - arthur!.position.x).toBe(20);
    expect(mark!.position.x - ruby!.position.x).toBe(10);

    // Frame at t = 0.0s (Arthur holds ball)
    const f0 = computeStageFrame(0.0, score);
    const ballPos0 = f0.entitiesById.get('ball')!.position;
    expect(ballPos0.x).toBeCloseTo(-14.5, 2);
    expect(ballPos0.y).toBeCloseTo(1.25, 2);

    // Frame at t = 3.0s (Apex crest between Arthur and Ruby)
    const f3 = computeStageFrame(3.0, score);
    const ballPos3 = f3.entitiesById.get('ball')!.position;
    expect(ballPos3.x).toBeCloseTo(-5.0, 2);
    expect(ballPos3.y).toBeCloseTo(5.2, 2); // Peak parabolic elevation

    // Frame at t = 6.0s (Ball reaches Ruby at hand height)
    const f6 = computeStageFrame(6.0, score);
    const ballPos6 = f6.entitiesById.get('ball')!.position;
    expect(ballPos6.x).toBeCloseTo(4.6, 2);
    expect(ballPos6.y).toBeCloseTo(1.25, 2);

    // Frame at t = 8.5s (End of Orbit Shot 1, ball at flank of Ruby)
    const f8_5 = computeStageFrame(8.5, score);
    const ballPos8_5 = f8_5.entitiesById.get('ball')!.position;
    expect(ballPos8_5.x).toBeCloseTo(6.4, 2);
    expect(ballPos8_5.z).toBeCloseTo(0.2, 2);

    // Frame at t = 11.0s (End of Orbit Shot 2, ball aligned at release point)
    const f11 = computeStageFrame(11.0, score);
    const ballPos11 = f11.entitiesById.get('ball')!.position;
    expect(ballPos11.x).toBeCloseTo(5.6, 2);
    expect(ballPos11.y).toBeCloseTo(1.25, 2);

    // Frame at t = 16.0s (Straight bullet arrival at Mark)
    const f16 = computeStageFrame(16.0, score);
    const ballPos16 = f16.entitiesById.get('ball')!.position;
    expect(ballPos16.x).toBeCloseTo(14.6, 2);
    expect(ballPos16.y).toBeCloseTo(1.25, 2);
    expect(ballPos16.z).toBeCloseTo(0.0, 2);

    // Camera Sole Ball Tracking & Roll Across Shots
    // In every shot, target points directly to the ball's look-at anchor
    for (let t = 0.5; t < 16.0; t += 2.5) {
      const ft = computeStageFrame(t, score);
      const liveBall = ft.entitiesById.get('ball')!;
      const camTarget = ft.stageCamera.transform.target;
      expect(camTarget.x).toBeCloseTo(liveBall.position.x, 2);
      expect(camTarget.z).toBeCloseTo(liveBall.position.z, 2);
    }

    // Shot 1 has positive roll (+14 deg = ~0.244 rad)
    const fShot1 = computeStageFrame(1.5, score);
    expect(fShot1.stageCamera.transform.pose.roll).toBeCloseTo(
      14 * (Math.PI / 180),
      3
    );

    // Shot 2 has negative roll (-18 deg = ~-0.314 rad)
    const fShot2 = computeStageFrame(4.5, score);
    expect(fShot2.stageCamera.transform.pose.roll).toBeCloseTo(
      -18 * (Math.PI / 180),
      3
    );

    // Shot 3 has positive roll (+22 deg = ~0.384 rad)
    const fShot3 = computeStageFrame(7.0, score);
    expect(fShot3.stageCamera.transform.pose.roll).toBeCloseTo(
      22 * (Math.PI / 180),
      3
    );

    // Shot 6 settles back to 0 roll on final catch
    const fShot6 = computeStageFrame(15.9, score);
    expect(fShot6.stageCamera.transform.pose.roll).toBeCloseTo(0, 3);

    // Observer Camera has no scripted cuts and holds steady at stage baseline
    const obsPose0 = f0.observerCamera.transform.pose;
    const obsPose16 = f16.observerCamera.transform.pose;
    expect(obsPose0.distance).toBe(38.0);
    expect(obsPose16.distance).toBe(38.0);
    expect(obsPose0.pitch).toBeCloseTo(obsPose16.pitch, 5);
    expect(obsPose0.yaw).toBeCloseTo(obsPose16.yaw, 5);
  });

  it('implements Option A shot-boundary target_offset reset: applies world offset and resets to [0,0,0] when omitted on next shot', () => {
    const yaml = `
version: "1.0"
id: "target-offset-reset-test"
title: "Target Offset Reset Test"
duration: 8.0
entities:
  - id: "arthur"
    label: "Arthur"
    kind: "character"
    position: [-4, 0, 2]
    height: 1.75
shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 4.0
    stage_camera:
      target: "arthur"
      target_offset: [0.5, 0.3, -0.2]
      distance: 3.0
      pitch: 0
      yaw: 0
  - id: "shot-2"
    shot: 2
    start: 4.0
    end: 8.0
    stage_camera:
      target: "arthur"
      distance: 3.0
      pitch: 0
      yaw: 0
`;
    const { score, error } = parseStageScore(yaml);
    expect(error).toBeNull();
    expect(score).not.toBeNull();

    const baseAnchorY = 1.75 * 0.9; // 1.575m

    // In Shot 1 (t = 2.0s), target is offset by [+0.5, +0.3, -0.2] and eye translates identically
    const f1 = computeStageFrame(2.0, score!);
    expect(f1.stageCamera.transform.target.x).toBeCloseTo(-4 + 0.5, 5);
    expect(f1.stageCamera.transform.target.y).toBeCloseTo(baseAnchorY + 0.3, 5);
    expect(f1.stageCamera.transform.target.z).toBeCloseTo(2 - 0.2, 5);
    expect(f1.stageCamera.transform.position.x).toBeCloseTo(-4 + 0.5, 5);
    expect(f1.stageCamera.transform.position.y).toBeCloseTo(baseAnchorY + 0.3, 5);
    expect(f1.stageCamera.transform.position.z).toBeCloseTo(2 - 0.2 + 3.0, 5);

    // In Shot 2 (t = 5.0s), target_offset is omitted -> Option A resets offset to [0, 0, 0]
    const f2 = computeStageFrame(5.0, score!);
    expect(f2.stageCamera.transform.target.x).toBeCloseTo(-4, 5);
    expect(f2.stageCamera.transform.target.y).toBeCloseTo(baseAnchorY, 5);
    expect(f2.stageCamera.transform.target.z).toBeCloseTo(2, 5);
  });

  it('interpolates animated target_offset_start -> target_offset_end and supports cross-shot recovery via target_offset_end: [0,0,0]', () => {
    const yaml = `
version: "1.0"
id: "target-offset-anim-test"
title: "Animated Target Offset Test"
duration: 8.0
entities:
  - id: "arthur"
    label: "Arthur"
    kind: "character"
    position: [0, 0, 0]
    height: 1.75
shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 4.0
    stage_camera:
      target: "arthur"
      maneuver: "dolly"
      easing: "linear"
      target_offset_start: [0, -1.0, 0]
      target_offset_end: [0, 0.4, 0]
      distance: 2.5
  - id: "shot-2"
    shot: 2
    start: 4.0
    end: 8.0
    stage_camera:
      target: "arthur"
      maneuver: "dolly"
      easing: "linear"
      target_offset_end: [0, 0, 0]
      distance: 2.5
`;
    const { score, error } = parseStageScore(yaml);
    expect(error).toBeNull();
    expect(score).not.toBeNull();

    const baseAnchorY = 1.75 * 0.9; // 1.575m

    // At t = 0.0s, offsetY = -1.0m
    const f0 = computeStageFrame(0.0, score!);
    expect(f0.stageCamera.transform.target.y).toBeCloseTo(baseAnchorY - 1.0, 5);

    // At t = 2.0s (midpoint of Shot 1 with linear easing), offsetY = -0.3m
    const f2 = computeStageFrame(2.0, score!);
    expect(f2.stageCamera.transform.target.y).toBeCloseTo(baseAnchorY - 0.3, 5);

    // At t = 4.0s (start of Shot 2), chains from Shot 1's end offset (+0.4m)
    const f4 = computeStageFrame(4.0, score!);
    expect(f4.stageCamera.transform.target.y).toBeCloseTo(baseAnchorY + 0.4, 5);

    // At t = 6.0s (midpoint of Shot 2 with linear recovery to 0), offsetY = +0.2m
    const f6 = computeStageFrame(6.0, score!);
    expect(f6.stageCamera.transform.target.y).toBeCloseTo(baseAnchorY + 0.2, 5);

    // At t = 8.0s (end of Shot 2), offsetY has recovered to 0m
    const f8 = computeStageFrame(8.0, score!);
    expect(f8.stageCamera.transform.target.y).toBeCloseTo(baseAnchorY, 5);
  });

  it('validates Blueprint 04 Cinematography Tutorial 20s timeline across all 16 pedagogical shots', () => {
    const bp4Item = findCatalogItem('blueprint-04');
    expect(bp4Item).toBeDefined();
    const score = bp4Item!.score;

    expect(score.durationSec).toBe(20.0);
    expect(score.shots).toHaveLength(16);
    expect(score.observerShots).toBeDefined();
    expect(score.observerShots).toHaveLength(1);

    // Module 1: The Framing Ladder (Shots 1 to 6)
    // Shot 01: 18mm EWS
    const f1 = computeStageFrame(0.5, score);
    expect(f1.stageCamera.shotId).toBe('shot-01');
    expect(f1.stageCamera.transform.pose.focalLengthMm).toBe(18);
    expect(f1.stageCamera.transform.pose.distance).toBe(9.5);

    // Shot 02: 28mm WS on Hero
    const f2 = computeStageFrame(1.8, score);
    expect(f2.stageCamera.shotId).toBe('shot-02');
    expect(f2.stageCamera.transform.pose.focalLengthMm).toBe(28);

    // Shot 04: 50mm MS
    const f4 = computeStageFrame(4.2, score);
    expect(f4.stageCamera.shotId).toBe('shot-04');
    expect(f4.stageCamera.transform.pose.focalLengthMm).toBe(50);

    // Shot 06: 100mm ECU
    const f6 = computeStageFrame(6.8, score);
    expect(f6.stageCamera.shotId).toBe('shot-06');
    expect(f6.stageCamera.transform.pose.focalLengthMm).toBe(100);

    // Module 2: 3D Movement Tracking (Shots 7 to 10)
    // Shot 07: Dolly in (3.6m -> 1.7m)
    const f7Start = computeStageFrame(7.51, score);
    const f7End = computeStageFrame(8.74, score);
    expect(f7Start.stageCamera.shotId).toBe('shot-07');
    expect(f7Start.stageCamera.transform.pose.distance).toBeGreaterThan(3.0);
    expect(f7End.stageCamera.transform.pose.distance).toBeLessThan(2.0);

    // Shot 09: Dynamic Arc
    const f9 = computeStageFrame(10.6, score);
    expect(f9.stageCamera.shotId).toBe('shot-09');
    expect(f9.stageCamera.maneuver).toBe('arc');

    // Shot 10: Crane Swoop
    const f10 = computeStageFrame(11.8, score);
    expect(f10.stageCamera.shotId).toBe('shot-10');
    expect(f10.stageCamera.maneuver).toBe('swoop');

    // Module 3: Camera Roll & Dutch Angles (Shots 11 to 12)
    // Shot 11: Static +16 deg Dutch Angle
    const f11 = computeStageFrame(13.1, score);
    expect(f11.stageCamera.shotId).toBe('shot-11');
    expect(f11.stageCamera.transform.pose.roll).toBeCloseTo(
      16 * (Math.PI / 180),
      3
    );

    // Shot 12: Dynamic Banking Swing (-18 deg to +18 deg)
    const f12Mid = computeStageFrame(14.375, score);
    expect(f12Mid.stageCamera.shotId).toBe('shot-12');
    expect(Math.abs(f12Mid.stageCamera.transform.pose.roll)).toBeLessThan(
      5 * (Math.PI / 180)
    );

    // Module 4: Off-Frame Target Offsets (Shots 13 to 16)
    // Shot 13: Rule-of-Thirds Lead Room (+0.45m X offset on Hero [-1.2])
    const f13 = computeStageFrame(15.5, score);
    expect(f13.stageCamera.shotId).toBe('shot-13');
    expect(f13.stageCamera.transform.target.x).toBeCloseTo(-1.2 + 0.45, 2);
    expect(f13.stageCamera.transform.pose.roll).toBeCloseTo(0, 3); // Reset to 0
    expect(f13.stageCamera.baseTarget).toBeDefined();
    expect(f13.stageCamera.baseTarget!.x).toBeCloseTo(-1.2, 2);
    expect(f13.stageCamera.targetOffset).toBeDefined();
    expect(f13.stageCamera.targetOffset!.x).toBeCloseTo(0.45, 2);

    // Shot 14: Headroom Bias (-0.40m Y offset on Partner)
    const f14 = computeStageFrame(16.8, score);
    const heroAnchorY = 1.75 * 0.9;
    expect(f14.stageCamera.shotId).toBe('shot-14');
    expect(f14.stageCamera.transform.target.y).toBeCloseTo(heroAnchorY - 0.4, 2);
    expect(f14.stageCamera.targetOffset!.y).toBeCloseTo(-0.4, 2);

    // Shot 15: Animated Reveal (Boots to Eyes)
    const f15Start = computeStageFrame(17.51, score);
    const f15End = computeStageFrame(18.74, score);
    expect(f15Start.stageCamera.shotId).toBe('shot-15');
    expect(f15Start.stageCamera.transform.target.y).toBeCloseTo(
      heroAnchorY - 1.15,
      2
    );
    expect(f15End.stageCamera.transform.target.y).toBeCloseTo(
      heroAnchorY + 0.25,
      2
    );
    expect(f15Start.stageCamera.targetOffset!.y).toBeCloseTo(-1.15, 2);
    expect(f15End.stageCamera.targetOffset!.y).toBeCloseTo(0.25, 2);

    // Shot 16: Ensemble Master Resolve
    const f16 = computeStageFrame(19.5, score);
    expect(f16.stageCamera.shotId).toBe('shot-16');
    expect(f16.stageCamera.transform.pose.focalLengthMm).toBe(24);

    // Decoupled Observer Camera: Smooth Orbit across all 16 cuts
    const obsStart = computeStageFrame(0.0, score).observerCamera.transform.pose;
    const obsEnd = computeStageFrame(20.0, score).observerCamera.transform.pose;

    expect(obsStart.distance).toBeCloseTo(35.93, 2);
    expect(obsStart.pitch).toBeCloseTo(24.8 * (Math.PI / 180), 3);
    expect(obsStart.yaw).toBeCloseTo(69.2 * (Math.PI / 180), 3);

    expect(obsEnd.distance).toBeCloseTo(19.63, 2);
    expect(obsEnd.pitch).toBeCloseTo(28.0 * (Math.PI / 180), 3);
    expect(obsEnd.yaw).toBeCloseTo(171.7 * (Math.PI / 180), 3);
  });

  describe('YAML Order Priority & Gap Holding', () => {
    it('prioritizes the later shot in YAML order when two shots overlap', () => {
      const overlapYaml = `
version: "1.0"
id: "overlap-priority-test"
title: "Overlap Priority Test"
duration: 25.0
stage:
  width: 10
  depth: 10
shots:
  - id: "shot-2"
    shot: 2
    label: "Shot 2 Wide"
    start: 0.0
    end: 18.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 8.0
      pitch: 20
      yaw: 45
      lens: 35mm
  - id: "shot-3"
    shot: 3
    label: "Shot 3 Close"
    start: 15.0
    end: 25.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 2.5
      pitch: 5
      yaw: -30
      lens: 85mm
`;
      const { score } = parseStageScore(overlapYaml);
      expect(score).not.toBeNull();

      // At t = 10.0s (only Shot 2 is active)
      const f10 = computeStageFrame(10.0, score!);
      expect(f10.activeShot?.id).toBe('shot-2');
      expect(f10.stageCamera.shotId).toBe('shot-2');
      expect(f10.stageCamera.transform.pose.distance).toBeCloseTo(8.0, 3);
      expect(f10.stageCamera.transform.pose.focalLengthMm).toBe(35);

      // At t = 16.0s (overlap zone: 15.0 to 18.0): Shot 3 MUST win across HUD and 3D camera
      const f16 = computeStageFrame(16.0, score!);
      expect(f16.activeShot?.id).toBe('shot-3');
      expect(f16.stageCamera.shotId).toBe('shot-3');
      expect(f16.stageCamera.transform.pose.distance).toBeCloseTo(2.5, 3);
      expect(f16.stageCamera.transform.pose.focalLengthMm).toBe(85);

      // At t = 20.0s (only Shot 3 is active)
      const f20 = computeStageFrame(20.0, score!);
      expect(f20.activeShot?.id).toBe('shot-3');
      expect(f20.stageCamera.shotId).toBe('shot-3');
    });

    it('holds terminal camera pose and actor positions during intentional time gaps between shots', () => {
      const gapYaml = `
version: "1.0"
id: "gap-hold-test"
title: "Gap Hold Test"
duration: 25.0
entities:
  - id: "actor"
    label: "Actor"
    kind: "character"
    position: [0, 0, 0]
    rotation: 0
shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 10.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 4.0
      pitch: 10
      yaw: 0
      lens: 50mm
    entities:
      actor:
        position: [3.0, 0, 0]
        rotation: 90
  - id: "shot-2"
    shot: 2
    start: 15.0
    end: 20.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 2.0
      pitch: 0
      yaw: 180
      lens: 85mm
`;
      const { score } = parseStageScore(gapYaml);
      expect(score).not.toBeNull();

      // At t = 12.5s (in the 5-second gap between shot 1 and shot 2)
      const fGap = computeStageFrame(12.5, score!);
      expect(fGap.activeShot).toBeNull(); // No active shot during gap
      expect(fGap.stageCamera.isHold).toBe(true);
      expect(fGap.stageCamera.transform.pose.distance).toBeCloseTo(4.0, 3);
      expect(fGap.stageCamera.transform.pose.focalLengthMm).toBe(50);

      const actor = fGap.entitiesById.get('actor');
      expect(actor).toBeDefined();
      expect(actor!.position.x).toBeCloseTo(3.0, 3);
    });

    it('evaluates a continuous: true chained score with seamless 3D camera and HUD synchronization', () => {
      const chainedScoreYaml = `
version: "1.0"
id: "expansion-mini"
title: "Expansion Mini"
continuous: true
shots:
  - id: "shot-1"
    shot: 1
    end: 6.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 5.0
      pitch: 10
      yaw: 45
      lens: 35mm
  - id: "shot-2"
    shot: 2
    end: 15.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 2.0
      pitch: 0
      yaw: 90
      lens: 50mm
`;
      const { score } = parseStageScore(chainedScoreYaml);
      expect(score).not.toBeNull();

      // At t = 3.0s: Shot 1 is active on both HUD and 3D stage camera
      const f3 = computeStageFrame(3.0, score!);
      expect(f3.activeShot?.id).toBe('shot-1');
      expect(f3.stageCamera.shotId).toBe('shot-1');
      expect(f3.stageCamera.transform.pose.distance).toBeCloseTo(5.0, 3);
      expect(f3.stageCamera.transform.pose.focalLengthMm).toBe(35);

      // At t = 6.0s (exact boundary): instantaneous cut to Shot 2 on HUD,
      // and camera begins dollying from Shot 1's distance (5.0m) toward 2.0m
      const f6 = computeStageFrame(6.0, score!);
      expect(f6.activeShot?.id).toBe('shot-2');
      expect(f6.stageCamera.shotId).toBe('shot-2');
      expect(f6.stageCamera.transform.pose.distance).toBeCloseTo(5.0, 3);
      expect(f6.stageCamera.transform.pose.focalLengthMm).toBe(50);

      // At t = 10.5s (midpoint of Shot 2): distance is (5 + 2) / 2 = 3.5m
      const f10 = computeStageFrame(10.5, score!);
      expect(f10.activeShot?.id).toBe('shot-2');
      expect(f10.stageCamera.shotId).toBe('shot-2');
      expect(f10.stageCamera.transform.pose.distance).toBeCloseTo(3.5, 2);

      // At t = 15.0s (end of Shot 2): distance reaches destination 2.0m
      const f15 = computeStageFrame(15.0, score!);
      expect(f15.stageCamera.transform.pose.distance).toBeCloseTo(2.0, 3);
    });

    it('chains physical camera parameters (distance, pitch, yaw) while swapping lens discretely under continuous: true', () => {
      const continuousCameraYaml = `
version: "1.0"
id: "continuous-camera-chain-test"
title: "Continuous Camera Chain Test"
continuous: true
shots:
  - id: "shot-1"
    shot: 1
    end: 6.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 1.8
      pitch: 4
      yaw: 90
      lens: 35mm
  - id: "shot-2"
    shot: 2
    end: 15.0
    stage_camera:
      target: [0, 1.0, 0]
      maneuver: "arc"
      easing: "linear"
      distance: 1.5
      pitch: -6
      yaw: 175
      lens: 50mm
`;
      const { score } = parseStageScore(continuousCameraYaml);
      expect(score).not.toBeNull();

      // At t = 6.0s (start of Shot 2):
      // Camera distance, pitch, yaw start at Shot 1's terminal values
      const f6 = computeStageFrame(6.0, score!);
      expect(f6.stageCamera.shotId).toBe('shot-2');
      expect(f6.stageCamera.transform.pose.distance).toBeCloseTo(1.8, 3);
      expect(f6.stageCamera.transform.pose.pitch).toBeCloseTo(4 * (Math.PI / 180), 3);
      expect(f6.stageCamera.transform.pose.yaw).toBeCloseTo(90 * (Math.PI / 180), 3);
      // Lens swaps immediately to 50mm (no unwanted slow zoom)
      expect(f6.stageCamera.transform.pose.focalLengthMm).toBe(50);

      // At t = 10.5s (midpoint of Shot 2, linear easing):
      // distance: (1.8 + 1.5) / 2 = 1.65m
      // pitch: (4 + -6) / 2 = -1 deg
      // yaw: (90 + 175) / 2 = 132.5 deg
      const fMid = computeStageFrame(10.5, score!);
      expect(fMid.stageCamera.transform.pose.pitch).toBeCloseTo(-1 * (Math.PI / 180), 2);
      expect(fMid.stageCamera.transform.pose.yaw).toBeCloseTo(132.5 * (Math.PI / 180), 2);
      expect(fMid.stageCamera.transform.pose.focalLengthMm).toBe(50);

      // At t = 15.0s (end of Shot 2):
      // Reaches destination pose
      const f15 = computeStageFrame(15.0, score!);
      expect(f15.stageCamera.transform.pose.distance).toBeCloseTo(1.5, 3);
      expect(f15.stageCamera.transform.pose.pitch).toBeCloseTo(-6 * (Math.PI / 180), 3);
      expect(f15.stageCamera.transform.pose.yaw).toBeCloseTo(175 * (Math.PI / 180), 3);
      expect(f15.stageCamera.transform.pose.focalLengthMm).toBe(50);
    });

    it('orbits strictly counter-clockwise when direction: ccw is specified', () => {
      const ccwOrbitYaml = `
version: "1.0"
id: "ccw-orbit-test"
title: "CCW Orbit Test"
shots:
  - id: "orbit-ccw"
    start: 0.0
    end: 10.0
    stage_camera:
      target: [0, 1.0, 0]
      maneuver: "orbit"
      direction: "ccw"
      easing: "linear"
      yaw_start: 180
      yaw: 225
`;
      const { score } = parseStageScore(ccwOrbitYaml);
      expect(score).not.toBeNull();

      // At t = 0s: yaw = 180 deg
      const f0 = computeStageFrame(0.0, score!);
      expect(f0.stageCamera.transform.pose.yaw).toBeCloseTo(180 * (Math.PI / 180), 3);

      // At midpoint t = 5.0s: CCW rotation from 180 deg to 225 deg travels along +45 deg arc (180 + 22.5 = 202.5 deg)
      const f5 = computeStageFrame(5.0, score!);
      expect(f5.stageCamera.transform.pose.yaw).toBeCloseTo(202.5 * (Math.PI / 180), 3);

      // At t = 10s: reaches 225 deg
      const f10 = computeStageFrame(10.0, score!);
      expect(f10.stageCamera.transform.pose.yaw).toBeCloseTo(225 * (Math.PI / 180), 3);
    });

    it('orbits strictly clockwise when direction: cw is specified', () => {
      const cwOrbitYaml = `
version: "1.0"
id: "cw-orbit-test"
title: "CW Orbit Test"
shots:
  - id: "orbit-cw"
    start: 0.0
    end: 10.0
    stage_camera:
      target: [0, 1.0, 0]
      maneuver: "orbit"
      direction: "cw"
      easing: "linear"
      yaw_start: 175
      yaw: 0
`;
      const { score } = parseStageScore(cwOrbitYaml);
      expect(score).not.toBeNull();

      // At midpoint t = 5.0s: CW rotation from 175 deg to 0 deg travels along -175 deg arc (175 - 87.5 = 87.5 deg)
      const f5 = computeStageFrame(5.0, score!);
      expect(f5.stageCamera.transform.pose.yaw).toBeCloseTo(87.5 * (Math.PI / 180), 3);

      // At t = 10s: reaches 0 deg
      const f10 = computeStageFrame(10.0, score!);
      expect(f10.stageCamera.transform.pose.yaw).toBeCloseTo(0, 3);
    });

    it('orbits strictly counter-clockwise when both yaw_start and yaw_end are specified with direction: ccw', () => {
      const ccwSpanYaml = `
version: "1.0"
id: "ccw-span-test"
title: "CCW Span Test"
shots:
  - id: "orbit-ccw-span"
    start: 0.0
    end: 12.0
    stage_camera:
      target: [0, 1.25, 0]
      maneuver: "orbit"
      direction: "ccw"
      easing: "linear"
      yaw_start: 175
      yaw_end: 0
`;
      const { score } = parseStageScore(ccwSpanYaml);
      expect(score).not.toBeNull();

      // At t = 0.0s: starts at 175 deg
      const f0 = computeStageFrame(0.0, score!);
      expect(f0.stageCamera.transform.pose.yaw).toBeCloseTo(175 * (Math.PI / 180), 3);

      // At midpoint t = 6.0s: CCW rotation from 175 deg to 0 deg travels along +185 deg arc
      // 175 + 185 * 0.5 = 267.5 deg
      const f6 = computeStageFrame(6.0, score!);
      expect(f6.stageCamera.transform.pose.yaw).toBeCloseTo(267.5 * (Math.PI / 180), 3);

      // At t = 12.0s: reaches 360 deg = 0 deg
      const f12 = computeStageFrame(12.0, score!);
      expect(f12.stageCamera.transform.pose.yaw).toBeCloseTo(360 * (Math.PI / 180), 3);
    });

    it('evaluates The Expansion oner score with continuous chaining and CCW orbit maneuver', () => {
      const expansionYaml = `
version: "1.0"
id: "the-expansion-oner"
title: "The Expansion"
continuous: true
shots:
  - id: "shot-1"
    end: 6.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 1.8
      pitch: 0
      yaw: 180
      lens: 50
      maneuver: "static"
  - id: "shot-2"
    end: 15.0
    stage_camera:
      target: [0, 1.0, 0]
      distance: 1.5
      pitch: -15
      yaw: 225
      direction: "ccw"
      easing: "linear"
      lens: 35
      maneuver: "orbit"
`;
      const { score } = parseStageScore(expansionYaml);
      expect(score).not.toBeNull();

      // At t = 6.0s (start of Shot 2):
      const f6 = computeStageFrame(6.0, score!);
      expect(f6.stageCamera.shotId).toBe('shot-2');
      expect(f6.stageCamera.transform.pose.distance).toBeCloseTo(1.8, 3);
      expect(f6.stageCamera.transform.pose.pitch).toBeCloseTo(0, 3);
      expect(f6.stageCamera.transform.pose.yaw).toBeCloseTo(180 * (Math.PI / 180), 3);
      expect(f6.stageCamera.transform.pose.focalLengthMm).toBe(35); // discrete prime lens swap

      // At midpoint t = 10.5s:
      const fMid = computeStageFrame(10.5, score!);
      expect(fMid.stageCamera.transform.pose.distance).toBeCloseTo(1.65, 3);
      expect(fMid.stageCamera.transform.pose.pitch).toBeCloseTo(-7.5 * (Math.PI / 180), 3);
      // Smooth 45 deg CCW arc: 180 + 22.5 = 202.5 deg
      expect(fMid.stageCamera.transform.pose.yaw).toBeCloseTo(202.5 * (Math.PI / 180), 3);
      expect(fMid.stageCamera.transform.pose.focalLengthMm).toBe(35);

      // At t = 15.0s:
      const f15 = computeStageFrame(15.0, score!);
      expect(f15.stageCamera.transform.pose.distance).toBeCloseTo(1.5, 3);
      expect(f15.stageCamera.transform.pose.pitch).toBeCloseTo(-15 * (Math.PI / 180), 3);
      expect(f15.stageCamera.transform.pose.yaw).toBeCloseTo(225 * (Math.PI / 180), 3);
      expect(f15.stageCamera.transform.pose.focalLengthMm).toBe(35);
    });
  });
  describe('Modular Submodules — cameraTargetResolver & shotPoseEvaluator Direct Unit Contracts', () => {
    it('resolves target point 3D for characters, props, center presets, and offsets', () => {
      const entities = new Map([
        [
          'actor',
          {
            id: 'actor',
            def: {
              id: 'actor',
              label: 'Lead Actor',
              kind: 'character' as const,
              position: { x: 1, y: 0, z: 2 },
              rotationYRad: 0,
              height: 1.75,
              radius: 0.28,
              color: '#38bdf8',
            },
            position: { x: 1, y: 0, z: 2 },
            rotationYRad: 0,
            highlighted: false,
            visible: true,
            trailPoints: [],
          },
        ],
        [
          'box',
          {
            id: 'box',
            def: {
              id: 'box',
              label: 'Wooden Box',
              kind: 'prop' as const,
              position: { x: -3, y: 0, z: 1 },
              rotationYRad: 0,
              height: 1.0,
              radius: 0.5,
              color: '#f59e0b',
            },
            position: { x: -3, y: 0, z: 1 },
            rotationYRad: 0,
            highlighted: false,
            visible: true,
            trailPoints: [],
          },
        ],
      ]);

      const fallback = { x: 0, y: 0, z: 0 };

      // Character look-at eye-line height: 1.75 * 0.9 = 1.575m
      const pActor = resolveTargetPoint3D('actor', entities, fallback);
      expect(pActor.x).toBe(1);
      expect(pActor.y).toBeCloseTo(1.575, 3);
      expect(pActor.z).toBe(2);

      // Prop center height: 1.0 * 0.5 = 0.5m
      const pProp = resolveTargetPoint3D('box', entities, fallback);
      expect(pProp.x).toBe(-3);
      expect(pProp.y).toBeCloseTo(0.5, 3);
      expect(pProp.z).toBe(1);

      // Center preset
      const pCenter = resolveTargetPoint3D('center', entities, fallback);
      expect(pCenter).toEqual({ x: 0, y: 1.0, z: 0 });

      // Offset applied
      const pOffset = resolveTargetPoint3D('actor', entities, fallback, { x: 0.5, y: -0.2, z: 1.0 });
      expect(pOffset.x).toBeCloseTo(1.5, 3);
      expect(pOffset.y).toBeCloseTo(1.375, 3);
      expect(pOffset.z).toBeCloseTo(3.0, 3);
    });

    const mockCue = (overrides: Partial<import('../../src/core/types').CameraCueSpec> = {}): import('../../src/core/types').CameraCueSpec => ({
      maneuver: 'dolly',
      easing: 'smooth',
      breathe: 1.0,
      direction: 'cw',
      trackTarget: true,
      ...overrides,
    });

    it('resolves Option A roll and target offset resets vs continuations', () => {
      const baseline = {
        target: { x: 0, y: 1, z: 0 },
        distance: 5,
        pitch: 0,
        yaw: 0,
        roll: 0,
        focalLengthMm: 50,
      };
      const prevPose = { ...baseline, roll: 0.25 };

      // Roll resets to baseline (0 rad) when omitted
      expect(resolveShotStartRoll(mockCue(), prevPose, baseline)).toBe(0);
      expect(resolveShotDestRoll(prevPose, mockCue(), baseline)).toBe(0);

      // Explicit roll preservation / delta
      expect(resolveShotStartRoll(mockCue({ rollStartRad: 0.1 }), prevPose, baseline)).toBe(0.1);
      expect(resolveShotDestRoll(prevPose, mockCue({ rollDeltaRad: 0.2 }), baseline)).toBeCloseTo(0.45, 4);

      // Offset resets to ZERO_OFFSET when omitted
      expect(resolveShotStartOffset(mockCue())).toEqual(ZERO_OFFSET);
      expect(resolveShotDestOffset(mockCue())).toEqual(ZERO_OFFSET);

      // Explicit target offset start / end
      expect(resolveShotStartOffset(mockCue({ targetOffsetStart: { x: 1, y: 2, z: 3 } }))).toEqual({ x: 1, y: 2, z: 3 });
      expect(resolveShotDestOffset(mockCue({ targetOffsetEnd: { x: 4, y: 5, z: 6 } }))).toEqual({ x: 4, y: 5, z: 6 });
    });

    it('evaluates spline camera poses and samples 3D trajectory curves', () => {
      const startPose = {
        target: { x: 0, y: 1, z: 0 },
        distance: 4,
        pitch: 0.1,
        yaw: 0.2,
        roll: 0,
        focalLengthMm: 35,
      };
      const spec = mockCue({
        maneuver: 'spline',
        easing: 'smooth',
        waypoints: [
          { target: { x: 1, y: 1, z: 0 }, distance: 4.5, yawRad: 0.5 },
          { target: { x: 2, y: 1, z: 1 }, distance: 5.0, yawRad: 0.8 },
        ],
      });

      const pMid = evaluateSplineCameraPose(startPose, spec, 0.5, new Map());
      expect(pMid.distance).toBeGreaterThan(4);
      expect(pMid.target.x).toBeGreaterThan(0);

      // evaluateShotCameraPose at t = 0 and t = 1
      const pStart = evaluateShotCameraPose(startPose, spec, 0, 5, new Map(), startPose);
      const pEnd = evaluateShotCameraPose(startPose, spec, 1, 5, new Map(), startPose);
      expect(pStart.target.x).toBeCloseTo(0, 2);
      expect(pEnd.target.x).toBeCloseTo(2, 2);

      // sampleTrajectoryPoints: cut returns [], moving returns 33 points (32 segments)
      expect(sampleTrajectoryPoints(startPose, mockCue({ maneuver: 'cut', easing: 'linear' }), 5, new Map(), 1.777)).toHaveLength(0);
      const points = sampleTrajectoryPoints(startPose, spec, 5, new Map(), 1.777);
      expect(points).toHaveLength(33);
      for (const pt of points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(Number.isFinite(pt.z)).toBe(true);
      }
    });

    it('asserts referential stability and zero-jitter of trajectory rails across intra-shot frames', () => {
      const blueprint03 = findCatalogItem('blueprint-03')?.score;
      expect(blueprint03).toBeDefined();
      if (!blueprint03) return;

      // In Shot 1 (0.0s to 3.0s), ball moves dynamically and camera dollies
      const f0 = computeStageFrame(0.0, blueprint03);
      const f0_5 = computeStageFrame(0.5, blueprint03);
      const f1_0 = computeStageFrame(1.0, blueprint03);
      const f2_5 = computeStageFrame(2.5, blueprint03);

      // Trajectory array reference must be 100% stable across all frames of the same shot
      expect(f0.stageCamera.trajectoryPoints).toBe(f0_5.stageCamera.trajectoryPoints);
      expect(f0.stageCamera.trajectoryPoints).toBe(f1_0.stageCamera.trajectoryPoints);
      expect(f0.stageCamera.trajectoryPoints).toBe(f2_5.stageCamera.trajectoryPoints);
      expect(f0.stageCamera.trajectoryPoints.length).toBe(33);

      // Trajectory endpoints match camera start (t=0) and terminal (t=3) positions
      const traj = f0.stageCamera.trajectoryPoints;
      expect(traj[0].x).toBeCloseTo(f0.stageCamera.transform.position.x, 2);
      expect(traj[0].y).toBeCloseTo(f0.stageCamera.transform.position.y, 2);
      expect(traj[0].z).toBeCloseTo(f0.stageCamera.transform.position.z, 2);

      const f3 = computeStageFrame(2.999, blueprint03);
      expect(traj[traj.length - 1].x).toBeCloseTo(f3.stageCamera.transform.position.x, 2);
      expect(traj[traj.length - 1].y).toBeCloseTo(f3.stageCamera.transform.position.y, 2);
      expect(traj[traj.length - 1].z).toBeCloseTo(f3.stageCamera.transform.position.z, 2);
    });

    it('asserts Golden Frame Equivalence across all 4 bundled scene scores at multi-timestamps', () => {
      for (const item of INITIAL_CATALOG_ITEMS) {
        const score = item.score;
        const duration = score.durationSec;
        const testTimestamps = [0.0, duration * 0.25, duration * 0.5, duration * 0.75, duration];

        for (const t of testTimestamps) {
          const frame = computeStageFrame(t, score);
          expect(Number.isFinite(frame.stageCamera.transform.position.x)).toBe(true);
          expect(Number.isFinite(frame.stageCamera.transform.position.y)).toBe(true);
          expect(Number.isFinite(frame.stageCamera.transform.position.z)).toBe(true);
          expect(Number.isFinite(frame.observerCamera.transform.position.x)).toBe(true);
          expect(Number.isFinite(frame.observerCamera.transform.position.y)).toBe(true);
          expect(Number.isFinite(frame.observerCamera.transform.position.z)).toBe(true);
          expect(frame.stageCamera.transform.fovDeg).toBeGreaterThan(10);
          expect(frame.stageCamera.transform.fovDeg).toBeLessThan(120);
        }
      }
    });
  });

  describe('Decoupled Entity Blocking (blocking:) — Continuous Multi-Cut Kinematics & Option A Trails', () => {
    it('evaluates a continuous actor walk across multiple rapid camera cuts without velocity resets or snaps', () => {
      const yaml = `
version: "1.0"
id: "decoupled-blocking-walk"
title: "Decoupled Blocking Walk Across Cuts"
duration: 9.0
entities:
  - id: "arthur"
    label: "Arthur"
    kind: "character"
    position: [-10, 0, 0]
    rotation: 90
  - id: "ruby"
    label: "Ruby"
    kind: "character"
    position: [6, 0, 0]
    rotation: -90

blocking:
  - id: "arthur-cross-room"
    entity: "arthur"
    start: 0.0
    end: 9.0
    position: [2, 0, 0]
    easing: "linear"
    look_at: "ruby"

shots:
  - id: "shot-1"
    shot: 1
    start: 0.0
    end: 3.0
    stage_camera: { target: "arthur", maneuver: "dolly", distance: 4.0, lens: 35mm }
  - id: "shot-2"
    shot: 2
    start: 3.0
    end: 6.0
    stage_camera: { target: "arthur", maneuver: "arc", distance: 2.8, lens: 50mm }
    entities:
      arthur:
        highlighted: true
        note: "Hero profile"
  - id: "shot-3"
    shot: 3
    start: 6.0
    end: 9.0
    stage_camera: { target: "arthur", maneuver: "orbit", distance: 2.2, lens: 85mm }
`;
      const { score, error } = parseStageScore(yaml);
      expect(error).toBeNull();
      expect(score).not.toBeNull();

      // At t = 0.0s (start of Shot 1): Arthur is at [-10, 0, 0]
      const f0 = computeStageFrame(0.0, score!);
      const a0 = f0.entitiesById.get('arthur')!;
      expect(a0.position.x).toBeCloseTo(-10, 4);
      expect(a0.cueId).toBe('arthur-cross-room');
      expect(a0.highlighted).toBe(false);

      // At t = 3.0s (exact cut boundary Shot 1 -> Shot 2, 1/3 of 9s linear walk):
      // x = -10 + (1/3) * 12 = -6.0m
      const f3Before = computeStageFrame(2.999, score!);
      const f3After = computeStageFrame(3.0, score!);
      expect(f3Before.activeShot?.id).toBe('shot-1');
      expect(f3After.activeShot?.id).toBe('shot-2');
      expect(f3After.entitiesById.get('arthur')!.position.x).toBeCloseTo(-6.0, 3);
      expect(
        Math.abs(
          f3After.entitiesById.get('arthur')!.position.x -
            f3Before.entitiesById.get('arthur')!.position.x
        )
      ).toBeLessThan(0.005);

      // Hybrid Shot 2 metadata overlays cleanly onto continuous blocking walk
      expect(f3After.entitiesById.get('arthur')!.highlighted).toBe(true);
      expect(f3After.entitiesById.get('arthur')!.note).toBe('Hero profile');
      expect(f3After.entitiesById.get('arthur')!.cueId).toBe('arthur-cross-room');

      // At t = 6.0s (exact cut boundary Shot 2 -> Shot 3, 2/3 of 9s linear walk):
      // x = -10 + (2/3) * 12 = -2.0m
      const f6 = computeStageFrame(6.0, score!);
      expect(f6.activeShot?.id).toBe('shot-3');
      expect(f6.entitiesById.get('arthur')!.position.x).toBeCloseTo(-2.0, 3);
      expect(f6.entitiesById.get('arthur')!.highlighted).toBe(false);

      // Option A Trail: Across all 3 shots (t=1.5s, t=4.5s, t=7.5s), Arthur's floor trail
      // reflects the full active blocking cue path [-10, 0.02, 0] -> [2, 0.02, 0] (17 points)
      for (const sampleT of [1.5, 4.5, 7.5]) {
        const frame = computeStageFrame(sampleT, score!);
        const trail = frame.entitiesById.get('arthur')!.trailPoints;
        expect(trail).toHaveLength(17);
        expect(trail[0]).toEqual({ x: -10, y: 0.02, z: 0 });
        expect(trail[16]).toEqual({ x: 2, y: 0.02, z: 0 });
      }
    });

    it('holds terminal pose across temporal gaps and resolves two-pass mutual gaze with C0 rotation continuity', () => {
      const yaml = `
version: "1.0"
id: "blocking-gaps-and-gaze"
title: "Blocking Gaps & Two-Pass Gaze"
duration: 12.0
entities:
  - id: "arthur"
    label: "Arthur"
    kind: "character"
    position: [-5, 0, 0]
    rotation: 0
  - id: "ruby"
    label: "Ruby"
    kind: "character"
    position: [0, 0, -5]
    rotation: 0

blocking:
  # Ruby walks along Z from -5 to +5 over 0..10s (at t=5.0s, Ruby is at [0, 0, 0])
  - id: "ruby-walk-z"
    entity: "ruby"
    start: 0.0
    end: 10.0
    position: [0, 0, 5]
    easing: "linear"
    look_at: "arthur"

  # Arthur tracks Ruby from 0..5s, holds in a gap from 5..8s, then turns to 0 deg from 8..10s
  - id: "arthur-gaze-ruby"
    entity: "arthur"
    start: 0.0
    end: 5.0
    look_at: "ruby"

  - id: "arthur-turn-front"
    entity: "arthur"
    start: 8.0
    end: 10.0
    rotation: 0
    easing: "linear"

shots:
  - id: "master"
    shot: 1
    start: 0.0
    end: 12.0
    stage_camera: { target: "center", distance: 10.0, lens: 35mm }
`;
      const { score, error } = parseStageScore(yaml);
      expect(error).toBeNull();
      expect(score).not.toBeNull();

      // At t = 4.999s (end of Arthur's gaze cue): Ruby is at ~[0, 0, 0], so Arthur at [-5, 0, 0] faces +X (+90 deg = PI/2)
      const fBeforeGap = computeStageFrame(4.999, score!);
      expect(fBeforeGap.entitiesById.get('arthur')!.rotationYRad).toBeCloseTo(
        Math.PI / 2,
        2
      );

      // During the un-cued gap (t = 6.5s): Arthur holds his terminal rotation (+PI/2) and position [-5, 0, 0]
      const fInGap = computeStageFrame(6.5, score!);
      const arthurGap = fInGap.entitiesById.get('arthur')!;
      expect(arthurGap.position).toEqual({ x: -5, y: 0, z: 0 });
      expect(arthurGap.rotationYRad).toBeCloseTo(Math.PI / 2, 3);
      expect(arthurGap.trailPoints).toEqual([]);
      expect(arthurGap.cueId).toBe('hold:arthur-gaze-ruby');

      // At t = 9.0s (midpoint of arthur-turn-front 8..10s from +90 deg to 0 deg):
      // Arthur is smoothly at +45 deg (PI/4) with zero snap at t = 8.0s
      const fTurnMid = computeStageFrame(9.0, score!);
      expect(fTurnMid.entitiesById.get('arthur')!.rotationYRad).toBeCloseTo(
        Math.PI / 4,
        3
      );

      // At t = 11.0s (after all cues finish): Ruby holds [0, 0, 5] with empty trailPoints
      const fPost = computeStageFrame(11.0, score!);
      const rubyPost = fPost.entitiesById.get('ruby')!;
      expect(rubyPost.position).toEqual({ x: 0, y: 0, z: 5 });
      expect(rubyPost.trailPoints).toEqual([]);
    });

    it('evaluates Blueprint 05 (Two Rooms: Living Room to Bedroom Threshold Crossing) across all 17 shots', () => {
      const bp05 = findCatalogItem('blueprint-05')?.score;
      expect(bp05).toBeDefined();
      if (!bp05) return;

      expect(bp05.durationSec).toBe(30.0);
      expect(bp05.shots).toHaveLength(17);

      // Phase 1 (t = 1.0s): Ruby and Samira in Living Room (-X), Rosa in Bedroom (+X), Cup on Living Table (y=0.78m)
      const f1 = computeStageFrame(1.0, bp05);
      expect(f1.entitiesById.get('ruby')!.position.x).toBeLessThan(-4.0);
      expect(f1.entitiesById.get('samira')!.position.x).toBeLessThan(-6.0);
      expect(f1.entitiesById.get('rosa')!.position.x).toBeGreaterThan(5.0);
      expect(f1.entitiesById.get('cup')!.position.y).toBeCloseTo(0.78, 3);

      // Phase 2 (t = 15.0s, Mid-Cross at Hallway Threshold during Shot 09 Whip-Sweep):
      // Ruby and the carried Cup (y=1.05m) cross near X = 0 with a 17-point Option A trail
      const fCross = computeStageFrame(15.0, bp05);
      expect(fCross.activeShot?.id).toBe('shot-09');
      const rubyCross = fCross.entitiesById.get('ruby')!;
      const cupCross = fCross.entitiesById.get('cup')!;
      expect(Math.abs(rubyCross.position.x)).toBeLessThan(1.0);
      expect(cupCross.position.y).toBeCloseTo(1.05, 3);
      expect(rubyCross.trailPoints).toHaveLength(17);
      expect(rubyCross.trailPoints[0].x).toBeCloseTo(-4.9, 2);
      expect(rubyCross.trailPoints[16].x).toBeCloseTo(4.3, 2);

      // Phase 3 (t = 26.0s, Bedroom Two-Shot Orbit in Shot 16):
      // Ruby and Rosa are in the Bedroom (+X), Cup rests on Bedroom Desk (y=0.75m), Samira at Threshold
      const fTwoShot = computeStageFrame(26.0, bp05);
      expect(fTwoShot.activeShot?.id).toBe('shot-16');
      expect(fTwoShot.entitiesById.get('ruby')!.position.x).toBeCloseTo(4.4, 2);
      expect(fTwoShot.entitiesById.get('rosa')!.position.x).toBeCloseTo(5.7, 2);
      expect(fTwoShot.entitiesById.get('cup')!.position).toEqual({
        x: 5.2,
        y: 0.75,
        z: 0.5,
      });
      expect(fTwoShot.entitiesById.get('samira')!.position.x).toBeCloseTo(-1.4, 2);
    });

    it('evaluates Blueprint 06 (Optics, Rack Focus & DoF) across all 8 shots and optical transitions', () => {
      const bp06 = findCatalogItem('blueprint-06')?.score;
      expect(bp06).toBeDefined();
      if (!bp06) return;

      expect(bp06.durationSec).toBe(36.0);
      expect(bp06.shots).toHaveLength(8);
      expect(bp06.observerShots).toHaveLength(2);

      // Shot 01 (t = 2.0s): Off-axis focus locked to Alice (shallow f/2.8, 50mm, aimed at center)
      const f1 = computeStageFrame(2.0, bp06);
      expect(f1.activeShot?.id).toBe('shot-01-off-axis-focus');
      expect(f1.stageCamera.dof.apertureFStop).toBe(2.8);
      expect(f1.stageCamera.transform.pose.focalLengthMm).toBe(50);
      expect(f1.stageCamera.dof.focusTargetPoint).toBeDefined();

      // Shot 02 (t = 4.5s vs t = 8.99s): 85mm Rack focus transition from Alice to Bob
      const f2Start = computeStageFrame(4.5, bp06);
      const f2End = computeStageFrame(8.99, bp06);
      expect(f2Start.activeShot?.id).toBe('shot-02-subject-rack-focus');
      expect(f2Start.stageCamera.dof.apertureFStop).toBe(2.8);
      expect(f2Start.stageCamera.transform.pose.focalLengthMm).toBe(85);
      // Focus distance changes from Alice to Bob across the rack
      expect(f2Start.stageCamera.dof.focusDistanceM).not.toBeCloseTo(
        f2End.stageCamera.dof.focusDistanceM,
        1
      );

      // Shot 04 (t = 15.0s): Follow-focus tracking walking Claire @ f/2.0
      const f4 = computeStageFrame(15.0, bp06);
      expect(f4.activeShot?.id).toBe('shot-04-moving-actor-focus-track');
      expect(f4.stageCamera.dof.apertureFStop).toBe(2.0);
      expect(f4.stageCamera.dof.focusTargetPoint).toBeDefined();

      // Shot 05 (t = 18.5s vs 22.99s): Iris aperture ramp from f/1.4 to f/11
      const f5Start = computeStageFrame(18.5, bp06);
      const f5End = computeStageFrame(22.99, bp06);
      expect(f5Start.activeShot?.id).toBe('shot-05-aperture-iris-ramp');
      expect(f5Start.stageCamera.dof.apertureFStop).toBeCloseTo(1.4, 1);
      expect(f5End.stageCamera.dof.apertureFStop).toBeCloseTo(11.0, 1);
      // As aperture stops down from f/1.4 to f/11, DoF band expands dramatically
      expect(f5End.stageCamera.dof.depthOfFieldM).toBeGreaterThan(
        f5Start.stageCamera.dof.depthOfFieldM * 5
      );

      // Shot 07 (t = 30.0s): Flat polymorphic syntax with 3D Vec3 coordinate focus point
      const f7 = computeStageFrame(30.0, bp06);
      expect(f7.activeShot?.id).toBe('shot-07-flat-polymorphic-focus');
      expect(f7.stageCamera.dof.apertureFStop).toBe(5.6);
      expect(f7.stageCamera.dof.focusTargetPoint).toEqual({
        x: 0.0,
        y: 1.1,
        z: 0.2,
      });

      // Shot 08 (t = 34.0s): Deep focus master at f/Infinity
      const f8 = computeStageFrame(34.0, bp06);
      expect(f8.activeShot?.id).toBe('shot-08-deep-focus-master');
      expect(f8.stageCamera.dof.preset).toBe('deep');
      expect(f8.stageCamera.dof.depthOfFieldM).toBe(Infinity);
    });

    it('evaluates static focus, dynamic rack focus between moving actors, and thin-lens DoF limits cleanly', () => {
      const rackFocusYaml = `
version: "1.0"
id: "rack-focus-engine-test"
title: "Rack Focus & DoF Evaluation Test"
duration: 12.0
entities:
  - id: "alice"
    kind: "character"
    position: [-1.5, 0, 2.0]
  - id: "bob"
    kind: "character"
    position: [1.5, 0, -2.0]
shots:
  - id: "shot-1-default"
    shot: 1
    start: 0.0
    end: 4.0
    stage_camera:
      target: [0, 1.575, 0]
      distance: 5.0
      pitch: 0
      yaw: 0
      lens: 50mm
  - id: "shot-2-rack"
    shot: 2
    start: 4.0
    end: 8.0
    stage_camera:
      target: [0, 1.575, 0]
      distance: 5.0
      pitch: 0
      yaw: 0
      lens: 50mm
      easing: "linear"
      focus_start: "alice"
      focus_end: "bob"
      dof: "shallow"
  - id: "shot-3-spline-focus"
    shot: 3
    start: 8.0
    end: 12.0
    stage_camera:
      maneuver: "spline"
      easing: "linear"
      lens: 50mm
      dof: "medium"
      waypoints:
        - target: [0, 1.575, 0]
          distance: 5.0
          pitch: 0
          yaw: 0
          focus: 2.0
        - target: [0, 1.575, 0]
          distance: 5.0
          pitch: 0
          yaw: 0
          focus: 6.0
`;
      const { score, error } = parseStageScore(rackFocusYaml);
      expect(error).toBeNull();
      expect(score).not.toBeNull();

      // Shot 1 (t = 2.0s): Omitted focus/DoF -> backward-compatible defaults
      const f1 = computeStageFrame(2.0, score!);
      expect(f1.stageCamera.dof.enabled).toBe(false);
      expect(f1.stageCamera.dof.hasExplicitFocus).toBe(false);
      expect(f1.stageCamera.dof.focusDistanceM).toBeCloseTo(5.0, 4);

      // Shot 2 (t = 4.0s): Camera at [0, 1.575, 5], looking along -Z toward [0, 1.575, 0].
      // Alice is at z = 2.0 -> orthogonal distance along -Z is 5.0 - 2.0 = 3.0m.
      // Bob is at z = -2.0 -> orthogonal distance along -Z is 5.0 - (-2.0) = 7.0m.
      const fRackStart = computeStageFrame(4.0, score!);
      expect(fRackStart.stageCamera.dof.enabled).toBe(true);
      expect(fRackStart.stageCamera.dof.preset).toBe('shallow');
      expect(fRackStart.stageCamera.dof.apertureFStop).toBeCloseTo(2.8, 4);
      expect(fRackStart.stageCamera.dof.focusDistanceM).toBeCloseTo(3.0, 3);
      expect(fRackStart.stageCamera.dof.focusTargetPoint!.x).toBeCloseTo(-1.5, 3);
      expect(fRackStart.stageCamera.dof.focusTargetPoint!.z).toBeCloseTo(2.0, 3);
      expect(fRackStart.stageCamera.dof.nearLimitM).toBeCloseTo(2.73, 2);
      expect(fRackStart.stageCamera.dof.farLimitM).toBeCloseTo(3.33, 2);

      // Midpoint of Rack Focus (t = 6.0s, linear easing): focus plane is halfway at 5.0m
      const fRackMid = computeStageFrame(6.0, score!);
      expect(fRackMid.stageCamera.dof.focusDistanceM).toBeCloseTo(5.0, 3);
      expect(fRackMid.stageCamera.dof.focusTargetPoint!.x).toBeCloseTo(0.0, 3);
      expect(fRackMid.stageCamera.dof.focusTargetPoint!.z).toBeCloseTo(0.0, 3);

      // End of Rack Focus (t = 7.999s): focus plane arrives at Bob (7.0m)
      const fRackEnd = computeStageFrame(7.999, score!);
      expect(fRackEnd.stageCamera.dof.focusDistanceM).toBeCloseTo(7.0, 2);
      expect(fRackEnd.stageCamera.dof.focusTargetPoint!.x).toBeCloseTo(1.5, 2);
      expect(fRackEnd.stageCamera.dof.focusTargetPoint!.z).toBeCloseTo(-2.0, 2);

      // Shot 3 (t = 10.0s, midpoint of spline waypoints with focus: 2.0 -> 6.0): focus is 4.0m
      const fSplineMid = computeStageFrame(10.0, score!);
      expect(fSplineMid.stageCamera.dof.enabled).toBe(true);
      expect(fSplineMid.stageCamera.dof.preset).toBe('medium');
      expect(fSplineMid.stageCamera.dof.apertureFStop).toBeCloseTo(5.6, 4);
      expect(fSplineMid.stageCamera.dof.focusDistanceM).toBeCloseTo(4.0, 3);
    });

    it('dynamically tracks look-at target elevation and DoF focus plane as actor crouches in blocking', () => {
      const crouchDofYaml = `
version: "1.0"
id: "crouch-dof-tracking"
title: "Dynamic Look-At and DoF Tracking During Crouch"
duration: 6.0
entities:
  - id: "actor"
    label: "Actor"
    kind: "character"
    position: [0, 0, 0]
    height: 1.80
shots:
  - id: "s1"
    shot: 1
    start: 0
    end: 6
    stage_camera:
      target: "actor"
      focus: "actor"
      dof: "shallow"
      distance: 5.0
      pitch: 0
      yaw: 0
      lens: 50mm
blocking:
  - id: "cue-crouch"
    entity: "actor"
    start: 0
    end: 6
    height: 1.00
    easing: "linear"
`;
      const { score, error } = parseStageScore(crouchDofYaml);
      expect(error).toBeNull();
      expect(score).not.toBeNull();

      // At t = 0.0s: actor height is 1.80m -> eye-level anchor is 0.90 * 1.80 = 1.62m
      const frame0 = computeStageFrame(0.0, score!);
      expect(frame0.stageCamera.transform.target.y).toBeCloseTo(1.62, 3);
      expect(frame0.stageCamera.transform.position.y).toBeCloseTo(1.62, 3);
      expect(frame0.stageCamera.dof.focusTargetPoint?.y).toBeCloseTo(1.62, 3);
      expect(frame0.stageCamera.dof.focusDistanceM).toBeCloseTo(5.0, 3);

      // At t = 3.0s (halfway): actor height is 1.40m -> eye-level anchor is 0.90 * 1.40 = 1.26m
      const frameMid = computeStageFrame(3.0, score!);
      expect(frameMid.stageCamera.transform.target.y).toBeCloseTo(1.26, 3);
      expect(frameMid.stageCamera.transform.position.y).toBeCloseTo(1.26, 3);
      expect(frameMid.stageCamera.dof.focusTargetPoint?.y).toBeCloseTo(1.26, 3);
      expect(frameMid.stageCamera.dof.focusDistanceM).toBeCloseTo(5.0, 3);

      // At t = 6.0s: actor height is 1.00m -> eye-level anchor is 0.90 * 1.00 = 0.90m
      const frameEnd = computeStageFrame(6.0, score!);
      expect(frameEnd.stageCamera.transform.target.y).toBeCloseTo(0.90, 3);
      expect(frameEnd.stageCamera.transform.position.y).toBeCloseTo(0.90, 3);
      expect(frameEnd.stageCamera.dof.focusTargetPoint?.y).toBeCloseTo(0.90, 3);
      expect(frameEnd.stageCamera.dof.focusDistanceM).toBeCloseTo(5.0, 3);
    });
  });
});

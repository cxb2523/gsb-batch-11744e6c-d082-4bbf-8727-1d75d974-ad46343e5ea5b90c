/**
 * Deterministic unit test suite for multi-subject look-at anchors and dynamic two-shot centroid framing.
 * Verifies mathematical midpoint accuracy, dynamic 60fps tracking on walking actors,
 * single-to-two-shot transitions (from: -> target:), focus plane projection, tripod rig integration,
 * and graceful fallback handling.
 */

import { describe, expect, it } from 'vitest';
import { parseStageScore } from '../../src/core/scoreParser';
import { computeStageFrame } from '../../src/core/frameEngine';

describe('multiTargetFraming — Dynamic Two-Shot & Group Centroid Kinematics', () => {
  it('resolves exact 3D midpoint look-at target for two static actors', () => {
    const rawYaml = `
version: "1.0"
id: "two-shot-static"
title: "Two Shot Static Test"
duration: 5.0
stage:
  width: 10
  depth: 10
entities:
  - id: "detective"
    label: "Detective"
    kind: "character"
    position: [-2.0, 0, 0]
    height: 1.80
  - id: "witness"
    label: "Witness"
    kind: "character"
    position: [4.0, 0, 0]
    height: 1.60
shots:
  - id: "s1"
    start: 0.0
    end: 5.0
    stage_camera:
      target: ["detective", "witness"]
      distance: 5.0
      pitch: 0deg
      yaw: 0deg
`;
    const { score, error } = parseStageScore(rawYaml);
    expect(error).toBeNull();
    expect(score).toBeDefined();

    const frame = computeStageFrame(2.5, score!);
    const cam = frame.stageCamera;

    // Midpoint X: (-2.0 + 4.0) / 2 = 1.0
    expect(cam.baseTarget!.x).toBeCloseTo(1.0, 4);

    // Height average: (1.80 * 0.9 + 1.60 * 0.9) / 2 = (1.62 + 1.44) / 2 = 1.53
    expect(cam.baseTarget!.y).toBeCloseTo(1.53, 4);

    // Midpoint Z: (0 + 0) / 2 = 0
    expect(cam.baseTarget!.z).toBeCloseTo(0.0, 4);

    // Camera eye at yaw=0, distance=5.0: Eye X=1.0, Y=1.53, Z=5.0
    expect(cam.transform.position.x).toBeCloseTo(1.0, 4);
    expect(cam.transform.position.y).toBeCloseTo(1.53, 4);
    expect(cam.transform.position.z).toBeCloseTo(5.0, 4);
  });

  it('dynamically tracks moving actors at 60fps as their conversational distance changes', () => {
    const rawYaml = `
version: "1.0"
id: "two-shot-dynamic"
title: "Two Shot Dynamic Walk Test"
duration: 10.0
stage:
  width: 14
  depth: 14
entities:
  - id: "actor_a"
    label: "Actor A"
    kind: "character"
    position: [-4.0, 0, 0]
  - id: "actor_b"
    label: "Actor B"
    kind: "character"
    position: [0.0, 0, 0]
blocking:
  - id: "a-walk"
    entity: "actor_a"
    start: 0.0
    end: 10.0
    position: [0.0, 0, 0] # Walks from -4.0 to 0.0
    easing: "linear"
  - id: "b-walk"
    entity: "actor_b"
    start: 0.0
    end: 10.0
    position: [6.0, 0, 0] # Walks from 0.0 to 6.0
    easing: "linear"
shots:
  - id: "s1"
    start: 0.0
    end: 10.0
    stage_camera:
      target: ["actor_a", "actor_b"]
      distance: 6.0
      pitch: 0deg
      yaw: 0deg
`;
    const { score, error } = parseStageScore(rawYaml);
    expect(error).toBeNull();
    expect(score).toBeDefined();

    // At t=0s: A at -4, B at 0 -> Midpoint X = -2.0
    const f0 = computeStageFrame(0.0, score!);
    expect(f0.stageCamera.baseTarget!.x).toBeCloseTo(-2.0, 4);

    // At t=5s: A at -2, B at 3 -> Midpoint X = 0.5
    const f5 = computeStageFrame(5.0, score!);
    expect(f5.stageCamera.baseTarget!.x).toBeCloseTo(0.5, 4);

    // At t=10s: A at 0, B at 6 -> Midpoint X = 3.0
    const f10 = computeStageFrame(10.0, score!);
    expect(f10.stageCamera.baseTarget!.x).toBeCloseTo(3.0, 4);
  });

  it('glides smoothly from a single close-up to a two-shot master (from: -> target:)', () => {
    const rawYaml = `
version: "1.0"
id: "single-to-two-shot"
title: "Single to Two-Shot Glide"
duration: 8.0
stage:
  width: 10
  depth: 10
entities:
  - id: "hero"
    label: "Hero"
    kind: "character"
    position: [-2.0, 0, 0]
  - id: "witness"
    label: "Witness"
    kind: "character"
    position: [2.0, 0, 0]
shots:
  - id: "s1"
    start: 0.0
    end: 8.0
    stage_camera:
      from: "hero"                      # Starts framed on Hero alone (X = -2)
      target: ["hero", "witness"]      # Glides to Two-Shot midpoint (X = 0)
      distance_start: 2.0
      distance_end: 4.5
      easing: "linear"
`;
    const { score, error } = parseStageScore(rawYaml);
    expect(error).toBeNull();
    expect(score).toBeDefined();

    // At t=0s: Aimed directly at Hero (X = -2.0)
    const f0 = computeStageFrame(0.0, score!);
    expect(f0.stageCamera.baseTarget!.x).toBeCloseTo(-2.0, 3);
    expect(f0.stageCamera.transform.pose.distance).toBeCloseTo(2.0, 3);

    // At t=4s (midpoint): Interpolated target X = -1.0
    const fMid = computeStageFrame(4.0, score!);
    expect(fMid.stageCamera.baseTarget!.x).toBeCloseTo(-1.0, 3);
    expect(fMid.stageCamera.transform.pose.distance).toBeCloseTo(3.25, 3);

    // At t=8s: Centered between both actors (X = 0.0)
    const fEnd = computeStageFrame(8.0, score!);
    expect(fEnd.stageCamera.baseTarget!.x).toBeCloseTo(0.0, 3);
    expect(fEnd.stageCamera.transform.pose.distance).toBeCloseTo(4.5, 3);
  });

  it('projects orthogonal focus plane to the two-shot centroid when focus: [a, b]', () => {
    const rawYaml = `
version: "1.0"
id: "two-shot-focus"
title: "Two Shot Focus Test"
duration: 6.0
stage:
  width: 10
  depth: 10
entities:
  - id: "lead"
    label: "Lead"
    kind: "character"
    position: [-1.0, 0, 2.0]
  - id: "partner"
    label: "Partner"
    kind: "character"
    position: [1.0, 0, 4.0]
shots:
  - id: "s1"
    start: 0.0
    end: 6.0
    stage_camera:
      target: [0, 1.5, 3.0]
      focus: ["lead", "partner"]
      distance: 6.0
      dof: "shallow"
`;
    const { score, error } = parseStageScore(rawYaml);
    expect(error).toBeNull();
    expect(score).toBeDefined();

    const f = computeStageFrame(3.0, score!);
    expect(f.stageCamera.dof.enabled).toBe(true);
    expect(f.stageCamera.dof.hasExplicitFocus).toBe(true);
    // Focus target point must match centroid of lead and partner
    expect(f.stageCamera.dof.focusTargetPoint).toBeDefined();
    expect(f.stageCamera.dof.focusTargetPoint?.x).toBeCloseTo(0.0, 2);
    expect(f.stageCamera.dof.focusTargetPoint?.z).toBeCloseTo(3.0, 2);
  });

  it('operates on a stationary tripod rig while tracking the two-shot centroid', () => {
    const rawYaml = `
version: "1.0"
id: "tripod-two-shot"
title: "Tripod Two-Shot Pan"
duration: 10.0
stage:
  width: 10
  depth: 10
entities:
  - id: "detective"
    label: "Detective"
    kind: "character"
    position: [-3.0, 0, 0]
  - id: "witness"
    label: "Witness"
    kind: "character"
    position: [-1.0, 0, 0]
blocking:
  - id: "pair-walk-1"
    entity: "detective"
    start: 0.0
    end: 10.0
    position: [1.0, 0, 0] # Detective moves -3 -> +1
    easing: "linear"
  - id: "pair-walk-2"
    entity: "witness"
    start: 0.0
    end: 10.0
    position: [3.0, 0, 0] # Witness moves -1 -> +3
    easing: "linear"
shots:
  - id: "s1"
    start: 0.0
    end: 10.0
    stage_camera:
      rig:
        type: "tripod"
        position: [0.0, 1.55, 5.0]
      target: ["detective", "witness"]
      lens: 35mm
`;
    const { score, error } = parseStageScore(rawYaml);
    expect(error).toBeNull();
    expect(score).toBeDefined();

    // Verify camera eye remains 100% stationary on tripod
    for (let t = 0; t <= 10; t += 2.5) {
      const f = computeStageFrame(t, score!);
      expect(f.stageCamera.transform.position.x).toBeCloseTo(0.0, 4);
      expect(f.stageCamera.transform.position.y).toBeCloseTo(1.55, 4);
      expect(f.stageCamera.transform.position.z).toBeCloseTo(5.0, 4);
      expect(f.stageCamera.rig?.type).toBe('tripod');
    }

    // Centroid moves from X = -2.0 (t=0) to X = 0.0 (t=5) to X = +2.0 (t=10)
    const f0 = computeStageFrame(0.0, score!);
    expect(f0.stageCamera.baseTarget!.x).toBeCloseTo(-2.0, 3);
    expect(f0.stageCamera.transform.pose.yaw).toBeGreaterThan(0); // Panned right/downstage

    const f5 = computeStageFrame(5.0, score!);
    expect(f5.stageCamera.baseTarget!.x).toBeCloseTo(0.0, 3);
    expect(f5.stageCamera.transform.pose.yaw).toBeCloseTo(0, 2); // Center stage

    const f10 = computeStageFrame(10.0, score!);
    expect(f10.stageCamera.baseTarget!.x).toBeCloseTo(2.0, 3);
    expect(f10.stageCamera.transform.pose.yaw).toBeLessThan(0); // Panned left/downstage
  });

  it('gracefully handles unknown entities in a multi-target array', () => {
    const rawYaml = `
version: "1.0"
id: "two-shot-fallback"
title: "Fallback Test"
duration: 5.0
stage:
  width: 10
  depth: 10
entities:
  - id: "valid_actor"
    label: "Valid Actor"
    kind: "character"
    position: [2.0, 0, 1.0]
shots:
  - id: "s1"
    start: 0.0
    end: 5.0
    stage_camera:
      target: ["valid_actor", "ghost_actor_does_not_exist"]
      distance: 4.0
`;
    const { score, error } = parseStageScore(rawYaml);
    expect(error).toBeNull();
    expect(score).toBeDefined();

    const f = computeStageFrame(2.5, score!);
    // Averages only the valid entity
    expect(f.stageCamera.baseTarget!.x).toBeCloseTo(2.0, 3);
    expect(f.stageCamera.baseTarget!.z).toBeCloseTo(1.0, 3);
  });
});

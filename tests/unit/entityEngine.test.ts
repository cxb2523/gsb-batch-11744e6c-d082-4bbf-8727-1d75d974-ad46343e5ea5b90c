import { describe, expect, it } from 'vitest';
import type { StageScore } from '../../src/core/types';
import {
  buildGroundTrailPoints,
  evaluateBlockingEntitiesAtTime,
  evaluateEntitiesAtTime,
  evaluateLegacyEntitiesAtTime,
  resolveLookAtPoint,
} from '../../src/core/entityEngine';
import { computeOrientedBoundingBox } from '../../src/core/entityKinematicUtils';

describe('Entity Kinematic Utilities (entityKinematicUtils)', () => {
  it('resolves lookAt targets properly for string IDs, labels, center, and Vec3', () => {
    const currentPositions = new Map([
      ['lead', { x: 2, y: 1, z: -3 }],
      ['extra', { x: -4, y: 0, z: 5 }],
    ]);

    const entities = [
      {
        id: 'lead',
        label: 'Lead Actor',
        kind: 'character' as const,
        position: { x: 0, y: 0, z: 0 },
        rotationYRad: 0,
        height: 1.75,
        radius: 0.28,
        color: '#ffffff',
      },
      {
        id: 'extra',
        label: 'Background Person',
        kind: 'character' as const,
        position: { x: 0, y: 0, z: 0 },
        rotationYRad: 0,
        height: 1.75,
        radius: 0.28,
        color: '#ffffff',
      },
    ];

    // Explicit Vec3 object
    expect(resolveLookAtPoint({ x: 10, y: 2, z: 3 }, currentPositions, entities)).toEqual({
      x: 10,
      y: 2,
      z: 3,
    });

    // "center", "origin", "stage"
    expect(resolveLookAtPoint('center', currentPositions, entities)).toEqual({ x: 0, y: 0, z: 0 });
    expect(resolveLookAtPoint('Origin', currentPositions, entities)).toEqual({ x: 0, y: 0, z: 0 });
    expect(resolveLookAtPoint('STAGE', currentPositions, entities)).toEqual({ x: 0, y: 0, z: 0 });

    // Entity ID
    expect(resolveLookAtPoint('lead', currentPositions, entities)).toEqual({ x: 2, y: 1, z: -3 });
    expect(resolveLookAtPoint('LEAD', currentPositions, entities)).toEqual({ x: 2, y: 1, z: -3 });

    // Entity Label
    expect(resolveLookAtPoint('Background Person', currentPositions, entities)).toEqual({
      x: -4,
      y: 0,
      z: 5,
    });

    // Unmatched string
    expect(resolveLookAtPoint('nonexistent', currentPositions, entities)).toBeNull();

    // Undefined / empty
    expect(resolveLookAtPoint(undefined, currentPositions, entities)).toBeNull();
  });

  it('builds 16-segment (17 points) ground trails when displacement > 0.05m, empty otherwise', () => {
    // Zero / negligible movement
    const stationary = buildGroundTrailPoints({ x: 1, y: 0, z: 1 }, { x: 1.01, y: 0, z: 1.01 });
    expect(stationary).toHaveLength(0);

    // Displaced movement
    const moving = buildGroundTrailPoints({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
    expect(moving).toHaveLength(17);
    expect(moving[0]).toEqual({ x: 0, y: 0.02, z: 0 });
    expect(moving[16]).toEqual({ x: 10, y: 0.02, z: 0 });
    expect(moving[8].x).toBeCloseTo(5.0, 4);
    expect(moving[8].y).toBe(0.02);
  });
});

describe('Entity Engine Facade & Dispatching (entityEngine)', () => {
  const baseScore: StageScore = {
    version: '1.0',
    id: 'test-score',
    title: 'Test Score',
    videoUrl: 'procedural://demo',
    aspectRatio: 16 / 9,
    durationSec: 10.0,
    offsetSec: 0,
    stage: {
      width: 10,
      depth: 10,
      gridStep: 1,
      defaultObserverPose: {
        target: { x: 0, y: 1, z: 0 },
        distance: 7,
        pitch: 0.3,
        yaw: 0.4,
        roll: 0,
        focalLengthMm: 35,
      },
      defaultStageCameraPose: {
        target: { x: 0, y: 1, z: 0 },
        distance: 3.5,
        pitch: 0.1,
        yaw: 0,
        roll: 0,
        focalLengthMm: 50,
      },
    },
    entities: [
      {
        id: 'actor',
        label: 'Actor',
        kind: 'character',
        position: { x: -2, y: 0, z: 0 },
        rotationYRad: 0,
        height: 1.75,
        radius: 0.28,
        color: '#38bdf8',
      },
    ],
    shots: [
      {
        id: 'shot-1',
        shotNumber: 1,
        label: 'Shot 1',
        description: 'Test Shot',
        startSec: 0,
        endSec: 10,
        entities: {
          actor: {
            position: { x: 2, y: 0, z: 0 },
            easing: 'linear',
            highlighted: false,
            visible: true,
          },
        },
      },
    ],
  };

  it('delegates to Tier 2 legacy evaluator when blocking is undefined', () => {
    const res = evaluateEntitiesAtTime(5.0, baseScore);
    const actor = res.entitiesById.get('actor')!;
    expect(actor.position.x).toBeCloseTo(0.0, 3);
    expect(actor.cueId).toBe('shot-1');
  });

  it('delegates to Tier 1 decoupled blocking evaluator when blocking is defined', () => {
    const blockingScore: StageScore = {
      ...baseScore,
      blocking: [
        {
          id: 'cue-cross',
          entityId: 'actor',
          startSec: 0,
          endSec: 10,
          position: { x: 8, y: 0, z: 0 },
          easing: 'linear',
        },
      ],
    };

    const res = evaluateEntitiesAtTime(5.0, blockingScore);
    const actor = res.entitiesById.get('actor')!;
    // Walk from -2 to +8 over 10s: at 5s, x = 3.0
    expect(actor.position.x).toBeCloseTo(3.0, 3);
    expect(actor.cueId).toBe('cue-cross');
  });

  it('direct calls to evaluateBlockingEntitiesAtTime and evaluateLegacyEntitiesAtTime work identically', () => {
    const legacyRes = evaluateLegacyEntitiesAtTime(5.0, baseScore);
    expect(legacyRes.entitiesById.get('actor')!.position.x).toBeCloseTo(0.0, 3);

    const blockingScore: StageScore = {
      ...baseScore,
      blocking: [
        {
          id: 'cue-cross',
          entityId: 'actor',
          startSec: 0,
          endSec: 10,
          position: { x: 8, y: 0, z: 0 },
          easing: 'linear',
        },
      ],
    };
    const blockingRes = evaluateBlockingEntitiesAtTime(5.0, blockingScore);
    expect(blockingRes.entitiesById.get('actor')!.position.x).toBeCloseTo(3.0, 3);
  });

  it('evaluates cut: true as instant placement with empty trailPoints and no cross-stage sliding', () => {
    const cutScore: StageScore = {
      ...baseScore,
      blocking: [
        // Cue 1: walk from baseline (-2, 0, 0) to (4, 0, 0) over 0s to 5s
        {
          id: 'cue-walk',
          entityId: 'actor',
          startSec: 0,
          endSec: 5,
          position: { x: 4, y: 0, z: 0 },
          easing: 'linear',
        },
        // Cue 2: jump cut to (-10, 0, 5) with cut: true over 5s to 10s
        {
          id: 'cue-jump-cut',
          entityId: 'actor',
          startSec: 5,
          endSec: 10,
          cut: true,
          position: { x: -10, y: 0, z: 5 },
          rotationYRad: Math.PI / 2,
          easing: 'smooth',
        },
        // Cue 3: continuous walk from (-10, 0, 5) to (-15, 0, 5) over 10s to 15s (from omitted!)
        {
          id: 'cue-walk-post-cut',
          entityId: 'actor',
          startSec: 10,
          endSec: 15,
          position: { x: -15, y: 0, z: 5 },
          easing: 'linear',
        },
      ],
    };

    // At 4.9s: actor is still near end of cue-walk (x ~ 3.88)
    const resAt49 = evaluateBlockingEntitiesAtTime(4.9, cutScore);
    const actorAt49 = resAt49.entitiesById.get('actor')!;
    expect(actorAt49.position.x).toBeCloseTo(3.88, 1);
    expect(actorAt49.trailPoints.length).toBeGreaterThan(0); // Active walk trail

    // At 5.0s (exact boundary of cut): actor immediately manifests at (-10, 0, 5) without sliding
    const resAt50 = evaluateBlockingEntitiesAtTime(5.0, cutScore);
    const actorAt50 = resAt50.entitiesById.get('actor')!;
    expect(actorAt50.position).toEqual({ x: -10, y: 0, z: 5 });
    expect(actorAt50.trailPoints).toHaveLength(0); // Suppressed trail!
    expect(actorAt50.rotationYRad).toBeCloseTo(Math.PI / 2, 4);

    // At 7.5s (mid-cue of jump-cut): actor remains exactly at (-10, 0, 5)
    const resAt75 = evaluateBlockingEntitiesAtTime(7.5, cutScore);
    const actorAt75 = resAt75.entitiesById.get('actor')!;
    expect(actorAt75.position).toEqual({ x: -10, y: 0, z: 5 });
    expect(actorAt75.trailPoints).toHaveLength(0);

    // At 12.5s (mid-cue of walk post-cut): actor smoothly walks from (-10, 0, 5) to (-15, 0, 5) -> x = -12.5
    const resAt125 = evaluateBlockingEntitiesAtTime(12.5, cutScore);
    const actorAt125 = resAt125.entitiesById.get('actor')!;
    expect(actorAt125.position.x).toBeCloseTo(-12.5, 3);
    expect(actorAt125.position.z).toBeCloseTo(5.0, 3);
    expect(actorAt125.trailPoints.length).toBeGreaterThan(0); // Trail resumes for normal walk!
  });

  it('evaluates Tier 2 legacy entity cut: true without sliding and with empty trailPoints', () => {
    const legacyCutScore: StageScore = {
      ...baseScore,
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          label: 'Shot 1',
          description: 'Shot 1',
          startSec: 0,
          endSec: 5,
          entities: {
            actor: {
              position: { x: 5, y: 0, z: 0 },
              easing: 'linear',
              highlighted: false,
              visible: true,
            },
          },
        },
        {
          id: 'shot-2',
          shotNumber: 2,
          label: 'Shot 2',
          description: 'Shot 2 Cut',
          startSec: 5,
          endSec: 10,
          entities: {
            actor: {
              cut: true,
              position: { x: -20, y: 0, z: 0 },
              easing: 'smooth',
              highlighted: false,
              visible: true,
            },
          },
        },
      ],
    };

    // At 5.0s: actor is immediately placed at (-20, 0, 0)
    const resAt50 = evaluateLegacyEntitiesAtTime(5.0, legacyCutScore);
    const actorAt50 = resAt50.entitiesById.get('actor')!;
    expect(actorAt50.position).toEqual({ x: -20, y: 0, z: 0 });
    expect(actorAt50.trailPoints).toHaveLength(0); // Empty trail for cut shot

    // At 7.5s: actor holds at (-20, 0, 0)
    const resAt75 = evaluateLegacyEntitiesAtTime(7.5, legacyCutScore);
    const actorAt75 = resAt75.entitiesById.get('actor')!;
    expect(actorAt75.position).toEqual({ x: -20, y: 0, z: 0 });
    expect(actorAt75.trailPoints).toHaveLength(0);
  });

  describe('3D Entity Dimensions, Oriented Bounding Box & Blocking Transforms', () => {
    it('computes oriented 2D bounding boxes accurately under 0° and 90° yaw', () => {
      // At 0 rad yaw: local +X is world +X, local +Z is world +Z
      const obb0 = computeOrientedBoundingBox({ x: 2, z: 3 }, 4.0, 2.0, 0);
      expect(obb0).toHaveLength(4);

      // Corners: (-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)
      // center (2, 3) + (-2, -1) = (0, 2)
      expect(obb0[0].x).toBeCloseTo(0, 4);
      expect(obb0[0].z).toBeCloseTo(2, 4);
      // center (2, 3) + (2, -1) = (4, 2)
      expect(obb0[1].x).toBeCloseTo(4, 4);
      expect(obb0[1].z).toBeCloseTo(2, 4);
      // center (2, 3) + (2, 1) = (4, 4)
      expect(obb0[2].x).toBeCloseTo(4, 4);
      expect(obb0[2].z).toBeCloseTo(4, 4);
      // center (2, 3) + (-2, 1) = (0, 4)
      expect(obb0[3].x).toBeCloseTo(0, 4);
      expect(obb0[3].z).toBeCloseTo(4, 4);

      // At 90° (Math.PI / 2) yaw:
      // cos(90°) = 0, sin(90°) = 1
      // rx = -dz, rz = dx
      const obb90 = computeOrientedBoundingBox({ x: 0, z: 0 }, 4.0, 2.0, Math.PI / 2);
      expect(obb90[0].x).toBeCloseTo(-1, 4); // local (-2, -1) -> x = -hw*cos + -hd*sin = 0 - 1 = -1
      expect(obb90[0].z).toBeCloseTo(2, 4); // z = - (-hw)*sin + -hd*cos = -(-2)*1 + 0 = 2
    });

    it('interpolates dimensions at 60fps and forward-chains individual axes across cues', () => {
      const dimensionScore: StageScore = {
        ...baseScore,
        entities: [
          {
            id: 'actor',
            label: 'Actor',
            kind: 'character',
            position: { x: 0, y: 0, z: 0 },
            rotationYRad: 0,
            width: 0.52,
            height: 1.75,
            depth: 0.52,
            radius: 0.26,
            color: '#ffffff',
          },
        ],
        blocking: [
          // Cue 1 (0s - 4s): crouch down to height: 1.05 with linear easing
          {
            id: 'cue-crouch',
            entityId: 'actor',
            startSec: 0,
            endSec: 4,
            height: 1.05,
            easing: 'linear',
          },
          // Cue 2 (4s - 8s): widen stance to width: 0.80, height omitted!
          {
            id: 'cue-widen',
            entityId: 'actor',
            startSec: 4,
            endSec: 8,
            width: 0.80,
            easing: 'linear',
          },
        ],
      };

      // At t = 0s: initial baseline dimensions
      const at0 = evaluateBlockingEntitiesAtTime(0, dimensionScore);
      const actor0 = at0.entitiesById.get('actor')!;
      expect(actor0.size).toBeDefined();
      expect(actor0.size!.x).toBeCloseTo(0.52, 3);
      expect(actor0.size!.y).toBeCloseTo(1.75, 3);
      expect(actor0.size!.z).toBeCloseTo(0.52, 3);

      // At t = 2s (mid-crouch): height is halfway between 1.75 and 1.05 = 1.40
      const at2 = evaluateBlockingEntitiesAtTime(2, dimensionScore);
      const actor2 = at2.entitiesById.get('actor')!;
      expect(actor2.size!.y).toBeCloseTo(1.40, 3);
      expect(actor2.size!.x).toBeCloseTo(0.52, 3);
      expect(actor2.size!.z).toBeCloseTo(0.52, 3);

      // At t = 4s (end of crouch): height is 1.05
      const at4 = evaluateBlockingEntitiesAtTime(4, dimensionScore);
      const actor4 = at4.entitiesById.get('actor')!;
      expect(actor4.size!.y).toBeCloseTo(1.05, 3);

      // At t = 6s (mid-widen in Cue 2):
      // Height should be PRESERVED at 1.05m (not reset to baseline 1.75m!)
      // Width should be halfway between 0.52 and 0.80 = 0.66
      const at6 = evaluateBlockingEntitiesAtTime(6, dimensionScore);
      const actor6 = at6.entitiesById.get('actor')!;
      expect(actor6.size!.y).toBeCloseTo(1.05, 3);
      expect(actor6.size!.x).toBeCloseTo(0.66, 3);
      expect(actor6.size!.z).toBeCloseTo(0.52, 3);

      // At t = 8s: full widen
      const at8 = evaluateBlockingEntitiesAtTime(8, dimensionScore);
      const actor8 = at8.entitiesById.get('actor')!;
      expect(actor8.size!.y).toBeCloseTo(1.05, 3);
      expect(actor8.size!.x).toBeCloseTo(0.80, 3);
    });
  });
});

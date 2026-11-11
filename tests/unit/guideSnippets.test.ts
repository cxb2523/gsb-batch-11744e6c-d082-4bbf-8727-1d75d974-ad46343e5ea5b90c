import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import yamlAuthoringGuideRaw from '../../docs/YAML_AUTHORING_GUIDE.md?raw';
import { parseStageScore } from '../../src/core/scoreParser';
import {
  normalizeCameraEasing,
  normalizeCameraManeuver,
  normalizeEntityKind,
} from '../../src/core/scorePrimitives';

describe('guideSnippets', () => {
  const extractYamlBlocks = (markdown: string): string[] => {
    const lines = markdown.split('\n');
    const blocks: string[] = [];
    let inYaml = false;
    let currentBlock: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('```yaml')) {
        inYaml = true;
        currentBlock = [];
      } else if (inYaml && line.trim().startsWith('```')) {
        inYaml = false;
        blocks.push(currentBlock.join('\n'));
      } else if (inYaml) {
        currentBlock.push(line);
      }
    }
    return blocks;
  };

  const dedent = (text: string): string => {
    const lines = text.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length === 0) return text;
    const minIndent = Math.min(...nonEmpty.map((l) => l.match(/^(\s*)/)![1].length));
    return lines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l)).join('\n');
  };

  const FIXTURE_ROOT = `version: "1.0"
id: "test-fixture"
title: "Fixture"
video: "procedural://fixture"
aspect_ratio: "16:9"
duration: 16.0
entities:
  - { id: "hero", label: "Hero", kind: "character", position: [-1, 0, 0], rotation: 90 }
  - { id: "detective", label: "Detective", kind: "character", position: [-1, 0, 0], rotation: 90 }
  - { id: "witness", label: "Witness", kind: "character", position: [1, 0, 0], rotation: -90 }
  - { id: "actor_a", label: "Actor A", kind: "character", position: [-1, 0, 0], rotation: 90 }
  - { id: "actor_b", label: "Actor B", kind: "character", position: [1, 0, 0], rotation: -90 }
  - { id: "scientist", label: "Scientist", kind: "character", position: [-1, 0, 0], rotation: 90 }
  - { id: "arthur", label: "Arthur", kind: "character", position: [-8, 0, 0], rotation: 90 }
  - { id: "ruby", label: "Ruby", kind: "character", position: [4, 0, 0], rotation: -90 }
  - { id: "desk", label: "Desk", kind: "prop", position: [0, 0, 0] }
  - { id: "terminal", label: "Terminal", kind: "prop", position: [1, 0, 0] }
`;

  it('verifies all YAML blocks in the guide are valid syntax and compile properly', () => {
    const blocks = extractYamlBlocks(yamlAuthoringGuideRaw);
    expect(blocks.length).toBe(30);

    blocks.forEach((rawSnippet) => {
      const cleanRaw = dedent(rawSnippet).trim();
      if (!cleanRaw || cleanRaw.startsWith('# illustrative')) {
        return;
      }

      // 1. Every block must be 100% valid YAML
      expect(() => parseYaml(cleanRaw), `Block has invalid YAML syntax:\n${cleanRaw}`).not.toThrow();

      // 2. Test semantic compilation via StageFlow score parser
      if (cleanRaw.startsWith('version:') || cleanRaw.startsWith('# ==============================================================================')) {
        const res = parseStageScore(cleanRaw);
        expect(res.error, `Self-contained score failed:\n${cleanRaw}`).toBeNull();
        expect(res.score).not.toBeNull();
      } else if (cleanRaw.startsWith('shots:')) {
        const fullScore = `${FIXTURE_ROOT}\n${cleanRaw}`;
        const res = parseStageScore(fullScore);
        expect(res.error, `Shots fragment failed:\n${cleanRaw}`).toBeNull();
      } else if (cleanRaw.startsWith('blocking:')) {
        const fullScore = `${FIXTURE_ROOT}\n${cleanRaw}\nshots:\n  - id: s1\n    start: 0\n    end: 10\n    stage_camera: { target: "hero", distance: 3 }`;
        const res = parseStageScore(fullScore);
        expect(res.error, `Blocking fragment failed:\n${cleanRaw}`).toBeNull();
      } else if (cleanRaw.startsWith('observer_shots:')) {
        const fullScore = `${FIXTURE_ROOT}\n${cleanRaw}\nshots:\n  - id: s1\n    start: 0\n    end: 10\n    stage_camera: { target: "hero", distance: 3 }`;
        const res = parseStageScore(fullScore);
        expect(res.error, `Observer fragment failed:\n${cleanRaw}`).toBeNull();
      } else if (cleanRaw.startsWith('- id:')) {
        const indented = cleanRaw.split('\n').map((l) => '  ' + l).join('\n');
        const fullScore = `${FIXTURE_ROOT}\nshots:\n${indented}`;
        const res = parseStageScore(fullScore);
        expect(res.error, `Single shot item failed:\n${cleanRaw}`).toBeNull();
      } else if (cleanRaw.startsWith('stage:') || cleanRaw.startsWith('entities:')) {
        const fullScore = `version: "1.0"\nid: "test"\n${cleanRaw}\nshots:\n  - id: s1\n    start: 0\n    end: 5\n    stage_camera: { target: [0, 1, 0], distance: 3 }`;
        const res = parseStageScore(fullScore);
        expect(res.error, `Stage/Entities fragment failed:\n${cleanRaw}`).toBeNull();
      } else if (cleanRaw.startsWith('video:') || cleanRaw.startsWith('# Format')) {
        const fullScore = `version: "1.0"\nid: "test"\n${cleanRaw}\nshots:\n  - id: s1\n    start: 0\n    end: 5\n    stage_camera: { target: [0, 1, 0], distance: 3 }`;
        const res = parseStageScore(fullScore);
        expect(res.error, `Video fragment failed:\n${cleanRaw}`).toBeNull();
      } else if (cleanRaw.startsWith('metadata:')) {
        const fullScore = `${FIXTURE_ROOT}\n${cleanRaw}\nshots:\n  - id: s1\n    start: 0\n    end: 5\n    stage_camera: { target: [0, 1, 0], distance: 3 }`;
        const res = parseStageScore(fullScore);
        expect(res.error, `Metadata fragment failed:\n${cleanRaw}`).toBeNull();
      }
    });
  });

  it('validates documented maneuver and easing enum aliases against core normalizers', () => {
    // Maneuver aliases
    expect(normalizeCameraManeuver('static')).toBe('cut');
    expect(normalizeCameraManeuver('hold')).toBe('cut');
    expect(normalizeCameraManeuver('linear')).toBe('dolly');
    expect(normalizeCameraManeuver('push')).toBe('dolly');
    expect(normalizeCameraManeuver('pull')).toBe('dolly');
    expect(normalizeCameraManeuver('turntable')).toBe('orbit');
    expect(normalizeCameraManeuver('pan')).toBe('sweep');
    expect(normalizeCameraManeuver('corkscrew')).toBe('spiral');
    expect(normalizeCameraManeuver('flyby')).toBe('dive');
    expect(normalizeCameraManeuver('punch')).toBe('recoil');
    expect(normalizeCameraManeuver('path')).toBe('spline');

    // Easing aliases
    expect(normalizeCameraEasing('easein')).toBe('ease-in');
    expect(normalizeCameraEasing('easeout')).toBe('ease-out');
    expect(normalizeCameraEasing('bounce')).toBe('pop');
    expect(normalizeCameraEasing('ramp-up')).toBe('accel');
    expect(normalizeCameraEasing('decel')).toBe('deccel');
    expect(normalizeCameraEasing('ramp-down')).toBe('deccel');
    expect(normalizeCameraEasing('trapezoid')).toBe('cruise');

    // Entity kinds & documented aliases
    expect(normalizeEntityKind('character')).toBe('character');
    expect(normalizeEntityKind('actor')).toBe('character');
    expect(normalizeEntityKind('person')).toBe('character');
    expect(normalizeEntityKind('prop')).toBe('prop');
    expect(normalizeEntityKind('set')).toBe('prop');
    expect(normalizeEntityKind('furniture')).toBe('prop');
    expect(normalizeEntityKind('item')).toBe('prop');
    expect(normalizeEntityKind('object')).toBe('prop');
    expect(normalizeEntityKind('marker')).toBe('marker');
    expect(normalizeEntityKind('spike')).toBe('marker');
    expect(normalizeEntityKind('mark')).toBe('marker');
  });

  it('asserts key alias equivalence between canonical keys and camelCase/legacy variants', () => {
    const baseCanonical = `version: "1.0"
id: "canon-test"
title: "Canon"
video: "procedural://test"
aspect_ratio: "16:9"
duration: 10.0
entities:
  - { id: "a", label: "A", kind: "character", position: [0, 0, 0], rotation: 90 }
shots:
  - id: "s1"
    start: 0.0
    end: 5.0
    stage_camera:
      target: "a"
      target_offset: [0, 0.2, 0]
      yaw_start: -30
      yaw_end: 30
      roll: 15
      lens: 35mm
`;

    const baseAlias = `version: "1.0"
id: "canon-test"
title: "Canon"
video_url: "procedural://test"
aspectRatio: "16:9"
duration: 10.0
entities:
  - { id: "a", label: "A", kind: "character", position: [0, 0, 0], yaw: 90 }
score:
  - id: "s1"
    _start: 0.0
    _end: 5.0
    stageCamera:
      target: "a"
      targetOffset: [0, 0.2, 0]
      yawStart: -30
      yawEnd: 30
      dutch: 15
      focal_length: 35
`;

    const resCanon = parseStageScore(baseCanonical);
    const resAlias = parseStageScore(baseAlias);

    expect(resCanon.error).toBeNull();
    expect(resAlias.error).toBeNull();

    expect(resAlias.score?.videoUrl).toBe(resCanon.score?.videoUrl);
    expect(resAlias.score?.aspectRatio).toBe(resCanon.score?.aspectRatio);
    expect(resAlias.score?.shots.length).toBe(resCanon.score?.shots.length);

    const sCanon = resCanon.score!.shots[0].stageCamera!;
    const sAlias = resAlias.score!.shots[0].stageCamera!;

    expect(sAlias.yawStartRad).toBe(sCanon.yawStartRad);
    expect(sAlias.yawEndRad).toBe(sCanon.yawEndRad);
    expect(sAlias.rollRad).toBe(sCanon.rollRad);
    expect(sAlias.focalLengthMm).toBe(sCanon.focalLengthMm);
    expect(sAlias.targetOffset).toEqual(sCanon.targetOffset);
  });

  it('guards parsing of reserved fields track and at so guide remains in sync if activated later', () => {
    const yamlWithReserved = `${FIXTURE_ROOT}
shots:
  - id: "s1"
    start: 0.0
    end: 5.0
    stage_camera:
      target: "hero"
      track: false
      maneuver: "spline"
      waypoints:
        - { target: "hero", at: 0.5, distance: 3.0 }
`;
    const res = parseStageScore(yamlWithReserved);
    expect(res.error).toBeNull();
    const cam = res.score!.shots[0].stageCamera!;
    expect(cam.trackTarget).toBe(false);
    expect(cam.waypoints?.[0].at).toBe(0.5);
  });

  it('defaults recoil maneuver breathe to 1.25 and resolves preset targets ("center", "origin", "stage") in baseline stage cameras', () => {
    const yamlWithRecoilAndCenter = `version: "1.0"
id: "recoil-center-test"
title: "Recoil and Center Test"
stage:
  observer_camera:
    target: "center"
    target_offset: [0.5, 0.25, -0.5]
  stage_camera:
    target: "origin"
shots:
  - id: "s1"
    start: 0.0
    end: 4.0
    stage_camera:
      target: "center"
      maneuver: "recoil"
`;
    const res = parseStageScore(yamlWithRecoilAndCenter);
    expect(res.error).toBeNull();
    expect(res.score).not.toBeNull();

    // Baseline cameras resolve "center" and "origin" to [0, 1.0, 0] + offset
    expect(res.score!.stage.defaultObserverPose.target).toEqual({
      x: 0.5,
      y: 1.25,
      z: -0.5,
    });
    expect(res.score!.stage.defaultStageCameraPose.target).toEqual({
      x: 0,
      y: 1.0,
      z: 0,
    });

    // Recoil maneuver defaults breathe to 1.25 when omitted
    expect(res.score!.shots[0].stageCamera!.breathe).toBe(1.25);
  });
});

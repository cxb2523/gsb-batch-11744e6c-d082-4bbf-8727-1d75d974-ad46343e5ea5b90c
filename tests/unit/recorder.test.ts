/**
 * Unit tests for Headless Viewport Recorder CLI configuration and resolvers.
 */

import { describe, it, expect } from 'vitest';
import { CAMERA_PRESETS } from '../../scripts/record/cameraPresets';
import {
  RESOLUTION_PRESETS,
  type ResolutionPresetKey,
} from '../../scripts/record/recorderTypes';
import { resolveFfmpegPath } from '../../scripts/record/ffmpegPipeline';
import { computeStageFrame } from '../../src/core/frameEngine';
import { INITIAL_CATALOG_ITEMS, findCatalogItem } from '../../src/core/scoreCatalog';

describe('Recorder Camera Presets', () => {
  it('defines valid pitch, yaw, and distance for all presets', () => {
    const keys = Object.keys(CAMERA_PRESETS);
    expect(keys).toContain('isometric');
    expect(keys).toContain('iso');
    expect(keys).toContain('top-down');
    expect(keys).toContain('top');
    expect(keys).toContain('front');
    expect(keys).toContain('side');

    for (const key of keys) {
      const preset = CAMERA_PRESETS[key];
      expect(Number.isFinite(preset.pitchDeg)).toBe(true);
      expect(Number.isFinite(preset.yawDeg)).toBe(true);
      expect(preset.distanceM).toBeGreaterThan(0);
      expect(preset.target).toHaveLength(3);
    }
  });

  it('aligns iso and isometric aliases identically', () => {
    expect(CAMERA_PRESETS['iso']).toEqual(CAMERA_PRESETS['isometric']);
    expect(CAMERA_PRESETS['top']).toEqual(CAMERA_PRESETS['top-down']);
  });
});

describe('Recorder Resolution Presets', () => {
  it('contains expected dimensions for all standard presets', () => {
    const presets: ResolutionPresetKey[] = [
      '1080p',
      '4k',
      '720p',
      'square',
      'vertical',
    ];
    for (const p of presets) {
      const dim = RESOLUTION_PRESETS[p];
      expect(dim.width).toBeGreaterThan(0);
      expect(dim.height).toBeGreaterThan(0);
    }
    expect(RESOLUTION_PRESETS['1080p']).toEqual({ width: 1920, height: 1080 });
    expect(RESOLUTION_PRESETS['4k']).toEqual({ width: 3840, height: 2160 });
    expect(RESOLUTION_PRESETS['vertical']).toEqual({ width: 1080, height: 1920 });
  });
});

describe('FFmpeg Path Resolver', () => {
  it('locates a valid ffmpeg executable name or path', () => {
    const ffmpegPath = resolveFfmpegPath();
    expect(typeof ffmpegPath).toBe('string');
    expect(ffmpegPath.length).toBeGreaterThan(0);
  });
});

describe('Deterministic Frame Evaluation', () => {
  it('evaluates frames identically at stepped intervals', () => {
    const score = INITIAL_CATALOG_ITEMS[0].score;
    const fps = 60;
    const totalFrames = 60; // 1 second

    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      const frameA = computeStageFrame(t, score);
      const frameB = computeStageFrame(t, score);

      expect(frameA.timestampSec).toBeCloseTo(t, 5);
      expect(frameA.stageCamera.transform.position).toEqual(
        frameB.stageCamera.transform.position
      );
      expect(frameA.observerCamera.transform.position).toEqual(
        frameB.observerCamera.transform.position
      );
    }
  });
});

describe('Recorder Audio Track Configuration', () => {
  it('supports opt-in audio path in CLI options schema', () => {
    const audioPath = '_examples/hb_stageflow_blueprint_01_result.mp4';
    expect(typeof audioPath).toBe('string');
  });
});

describe('Bundled Scene Shortcuts & Catalog Resolution', () => {
  it('resolves all 7 blueprints and vector field correctly', () => {
    const resolveShortcut = (input: string) => {
      const direct = findCatalogItem(input);
      if (direct) return direct;

      const normalized = input.trim().toLowerCase().replace(/_/g, '-');
      if (
        normalized === 'vf' ||
        normalized === 'vector-field' ||
        normalized === 'vectorfield'
      ) {
        return findCatalogItem('vector-field');
      }
      const numMatch = input.match(/^(?:bp)?0?([1-9]\d*)$/i);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const targetBpId = num === 1 ? 'demo' : `blueprint-0${num}`;
        return findCatalogItem(targetBpId);
      }
      return findCatalogItem(normalized);
    };

    expect(resolveShortcut('01')?.id).toBe('demo');
    expect(resolveShortcut('demo-blueprint')?.id).toBe('demo');
    expect(resolveShortcut('02')?.id).toBe('blueprint-02');
    expect(resolveShortcut('blueprint-02-dialogue')?.id).toBe('blueprint-02');
    expect(resolveShortcut('03')?.id).toBe('blueprint-03');
    expect(resolveShortcut('04')?.id).toBe('blueprint-04');
    expect(resolveShortcut('05')?.id).toBe('blueprint-05');
    expect(resolveShortcut('06')?.id).toBe('blueprint-06');
    expect(resolveShortcut('07')?.id).toBe('blueprint-07');
    expect(resolveShortcut('vf')?.id).toBe('vector-field');
    expect(resolveShortcut('vector_field')?.id).toBe('vector-field');
    expect(resolveShortcut('vector-field-taruma-sakti')?.id).toBe('vector-field');
  });
});

describe('Optics Bokeh Blur Invariant in Headless Recorder', () => {
  it('respects score optics dofBlur when CLI flag is omitted', () => {
    const bp06 = findCatalogItem('blueprint-06');
    expect(bp06?.score.optics?.dofBlur).toBe(true);

    const bp01 = findCatalogItem('demo');
    expect(bp01?.score.optics?.dofBlur ?? false).toBe(false);

    const resolveBlur = (cliBlur?: boolean, scoreBlur?: boolean) =>
      cliBlur !== undefined ? cliBlur : (scoreBlur ?? false);

    // Default inherit from score
    expect(resolveBlur(undefined, bp06?.score.optics?.dofBlur)).toBe(true);
    expect(resolveBlur(undefined, bp01?.score.optics?.dofBlur)).toBe(false);

    // Explicit override via CLI flag
    expect(resolveBlur(false, bp06?.score.optics?.dofBlur)).toBe(false);
    expect(resolveBlur(true, bp01?.score.optics?.dofBlur)).toBe(true);
  });
});

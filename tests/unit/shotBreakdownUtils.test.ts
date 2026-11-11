import { describe, expect, it } from 'vitest';
import {
  cleanShotLabel,
  formatFilmGateLabel,
  formatShotTiming,
  formatSignedVector3D,
  resolveShotTargetInfo,
} from '../../src/ui/shotBreakdownUtils';
import type { SceneEntityDef } from '../../src/core/types';

describe('shotBreakdownUtils — Pure Directorial HUD Helpers', () => {
  const mockEntities: SceneEntityDef[] = [
    {
      id: 'ruby',
      label: 'Ruby (Hero)',
      kind: 'character',
      position: { x: 0, y: 0, z: 0 },
      rotationYRad: 0,
      height: 1.75,
      radius: 0.35,
      color: '#e11d48',
    },
    {
      id: 'evan',
      label: 'Evan (Courier)',
      kind: 'character',
      position: { x: 2, y: 0, z: 1 },
      rotationYRad: 0,
      height: 1.8,
      radius: 0.35,
      color: '#3b82f6',
    },
  ];

  describe('cleanShotLabel', () => {
    it('strips redundant "Shot ## · " and variant prefixes', () => {
      expect(cleanShotLabel('Shot 01 · Lead Track on Ruby')).toBe('Lead Track on Ruby');
      expect(cleanShotLabel('Shot 2: OTS Evan')).toBe('OTS Evan');
      expect(cleanShotLabel('Shot 14 - Reveal')).toBe('Reveal');
      expect(cleanShotLabel('Shot 05 – Two Shot')).toBe('Two Shot');
    });

    it('preserves clean titles without prefixes', () => {
      expect(cleanShotLabel('Opening Wide')).toBe('Opening Wide');
      expect(cleanShotLabel('')).toBe('');
    });
  });

  describe('resolveShotTargetInfo', () => {
    it('resolves entity identifier with display label and color', () => {
      const res = resolveShotTargetInfo('ruby', mockEntities);
      expect(res.isEntity).toBe(true);
      expect(res.label).toBe('Ruby (Hero)');
      expect(res.color).toBe('#e11d48');
    });

    it('falls back to raw string when entity identifier is not found', () => {
      const res = resolveShotTargetInfo('doorway', mockEntities);
      expect(res.isEntity).toBe(false);
      expect(res.label).toBe('doorway');
      expect(res.color).toBeUndefined();
    });

    it('resolves array of multiple entity targets', () => {
      const res = resolveShotTargetInfo(['ruby', 'evan'], mockEntities);
      expect(res.isEntity).toBe(true);
      expect(res.label).toBe('Ruby (Hero) + Evan (Courier)');
      expect(res.color).toBe('#e11d48');
    });

    it('resolves raw Vec3 3D world coordinate target', () => {
      const res = resolveShotTargetInfo({ x: 0.5, y: 1.2, z: -2.0 }, mockEntities);
      expect(res.isEntity).toBe(false);
      expect(res.label).toBe('[0.5, 1.2, -2.0]');
    });

    it('falls back to baseTarget or Center Stage when target is undefined', () => {
      const withBase = resolveShotTargetInfo(undefined, mockEntities, { x: 0, y: 1.5, z: 0 });
      expect(withBase.isEntity).toBe(false);
      expect(withBase.label).toBe('[0.0, 1.5, 0.0]');

      const withoutBase = resolveShotTargetInfo(undefined, mockEntities);
      expect(withoutBase.isEntity).toBe(false);
      expect(withoutBase.label).toBe('Center Stage');
    });
  });

  describe('formatSignedVector3D', () => {
    it('formats 3D vector with explicit signs', () => {
      expect(formatSignedVector3D({ x: 0.15, y: -0.12, z: 0 })).toBe('Δ [+0.15, -0.12, +0.00]m');
      expect(formatSignedVector3D({ x: -1.5, y: 2.0, z: -0.05 })).toBe('Δ [-1.50, +2.00, -0.05]m');
    });

    it('handles undefined vector gracefully', () => {
      expect(formatSignedVector3D(undefined)).toBe('Δ [0.00, 0.00, 0.00]m');
    });
  });

  describe('formatFilmGateLabel', () => {
    it('formats common cinematic aspect ratios', () => {
      expect(formatFilmGateLabel(16 / 9)).toBe('16:9 Gate');
      expect(formatFilmGateLabel(2.39)).toBe('2.39:1 Gate');
      expect(formatFilmGateLabel(2.35)).toBe('2.39:1 Gate');
      expect(formatFilmGateLabel(4 / 3)).toBe('4:3 Gate');
      expect(formatFilmGateLabel(1)).toBe('1:1 Gate');
      expect(formatFilmGateLabel(9 / 16)).toBe('9:16 Gate');
    });

    it('formats arbitrary aspect ratio', () => {
      expect(formatFilmGateLabel(2.0)).toBe('2.00:1 Gate');
    });
  });

  describe('formatShotTiming', () => {
    it('formats start time and duration', () => {
      expect(formatShotTiming(42.0, 58.0)).toBe('Start: 42.0s · Dur: 16.0s');
      expect(formatShotTiming(0.0, 12.5)).toBe('Start: 0.0s · Dur: 12.5s');
    });
  });
});


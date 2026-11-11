import { describe, it, expect } from 'vitest';
import {
  computeBillboardLodMetrics,
  getBillboardBaseOpacity,
  getBillboardZIndexRange,
  PROXIMITY_CULL_M,
  ENTITY_COLLAPSE_START_M,
  ENTITY_COLLAPSE_END_M,
  CAMERA_COLLAPSE_START_M,
  CAMERA_COLLAPSE_END_M,
} from '../../src/stage/labelLodMath';

describe('labelLodMath — 3D Billboard Label LOD & Hierarchy Engine', () => {
  describe('Proximity Culling (< 1.2m)', () => {
    it('culls both pill and dot when distance is within proximity threshold', () => {
      const near = computeBillboardLodMetrics(0.8, 'character', false, false);
      expect(near.culled).toBe(true);
      expect(near.showPill).toBe(false);
      expect(near.showDot).toBe(false);
      expect(near.pillOpacity).toBe(0);
      expect(near.dotOpacity).toBe(0);

      const edge = computeBillboardLodMetrics(PROXIMITY_CULL_M - 0.01, 'character');
      expect(edge.culled).toBe(true);
    });

    it('enables badge rendering once distance exceeds proximity threshold', () => {
      const past = computeBillboardLodMetrics(PROXIMITY_CULL_M + 0.1, 'character');
      expect(past.culled).toBe(false);
      expect(past.showPill).toBe(true);
      expect(past.pillOpacity).toBeGreaterThan(0);
    });
  });

  describe('Entity Distance Collapse (24m - 28m)', () => {
    it('renders full pill badge without dot at standard viewing distances (<= 24m)', () => {
      const close = computeBillboardLodMetrics(10.0, 'character', false, false);
      expect(close.showPill).toBe(true);
      expect(close.showDot).toBe(false);
      expect(close.pillOpacity).toBeCloseTo(0.85);
      expect(close.dotOpacity).toBe(0);

      const threshold = computeBillboardLodMetrics(
        ENTITY_COLLAPSE_START_M,
        'character',
        false,
        false
      );
      expect(threshold.showPill).toBe(true);
      expect(threshold.showDot).toBe(false);
    });

    it('smoothly cross-fades pill into dot within the 24m - 28m transition band', () => {
      const mid = computeBillboardLodMetrics(26.0, 'character', false, false);
      expect(mid.showPill).toBe(true);
      expect(mid.showDot).toBe(true);
      expect(mid.pillOpacity).toBeGreaterThan(0);
      expect(mid.dotOpacity).toBeGreaterThan(0);
      // At 26m (50% through 24-28m band), pill is at half its base opacity
      expect(mid.pillOpacity).toBeCloseTo(0.85 * 0.5, 2);
    });

    it('collapses cleanly to glowing dot only at far distances (>= 28m)', () => {
      const atEnd = computeBillboardLodMetrics(
        ENTITY_COLLAPSE_END_M,
        'character',
        false,
        false
      );
      expect(atEnd.showPill).toBe(false);
      expect(atEnd.showDot).toBe(true);
      expect(atEnd.pillOpacity).toBe(0);

      const far = computeBillboardLodMetrics(35.0, 'character', false, false);
      expect(far.showPill).toBe(false);
      expect(far.showDot).toBe(true);
      expect(far.pillOpacity).toBe(0);
      expect(far.dotOpacity).toBeCloseTo(0.8);

      const zenith = computeBillboardLodMetrics(98.5, 'character', false, false);
      expect(zenith.showPill).toBe(false);
      expect(zenith.showDot).toBe(true);
      expect(zenith.pillOpacity).toBe(0);
    });
  });

  describe('Stage Camera Telemetry Persistence (52m - 60m)', () => {
    it('keeps Stage Camera telemetry badge readable during crane pullbacks (30m - 50m)', () => {
      // At 30m, characters are collapsed into dots, but camera badge remains a readable pill
      const charAt30 = computeBillboardLodMetrics(30.0, 'character');
      const camAt30 = computeBillboardLodMetrics(30.0, 'camera');

      expect(charAt30.showPill).toBe(false);
      expect(charAt30.showDot).toBe(true);

      expect(camAt30.showPill).toBe(true);
      expect(camAt30.showDot).toBe(false);
      expect(camAt30.pillOpacity).toBe(1.0);

      // At 46.15m (Vector Field shot #31 Crane Pullback), camera badge is still visible
      const camAtCrane = computeBillboardLodMetrics(46.15, 'camera');
      expect(camAtCrane.showPill).toBe(true);
      expect(camAtCrane.showDot).toBe(false);
    });

    it('cross-fades camera badge between 52m and 60m', () => {
      const atStart = computeBillboardLodMetrics(
        CAMERA_COLLAPSE_START_M,
        'camera'
      );
      expect(atStart.showPill).toBe(true);
      expect(atStart.showDot).toBe(false);

      const camMid = computeBillboardLodMetrics(56.0, 'camera');
      expect(camMid.showPill).toBe(true);
      expect(camMid.showDot).toBe(true);
      expect(camMid.pillOpacity).toBeCloseTo(0.5, 1);
    });

    it('collapses camera badge to dot at extreme zenith distances (>= 60m)', () => {
      const atEnd = computeBillboardLodMetrics(
        CAMERA_COLLAPSE_END_M,
        'camera'
      );
      expect(atEnd.showPill).toBe(false);
      expect(atEnd.showDot).toBe(true);

      const camZenith = computeBillboardLodMetrics(98.5, 'camera');
      expect(camZenith.showPill).toBe(false);
      expect(camZenith.showDot).toBe(true);
      expect(camZenith.pillOpacity).toBe(0);
      expect(camZenith.dotOpacity).toBeGreaterThan(0.8);
    });
  });

  describe('Visual Hierarchy & Opacity Tiers', () => {
    it('enforces strict opacity order: camera >= focus > character > prop > marker (paused)', () => {
      const cam = getBillboardBaseOpacity('camera', false, false);
      const focus = getBillboardBaseOpacity('character', true, false);
      const char = getBillboardBaseOpacity('character', false, false);
      const prop = getBillboardBaseOpacity('prop', false, false);
      const marker = getBillboardBaseOpacity('marker', false, false);

      expect(cam.pillOpacity).toBe(1.0);
      expect(focus.pillOpacity).toBe(1.0);
      expect(char.pillOpacity).toBe(0.85);
      expect(prop.pillOpacity).toBe(0.55);
      expect(marker.pillOpacity).toBe(0.35);

      expect(cam.pillOpacity).toBeGreaterThanOrEqual(focus.pillOpacity);
      expect(focus.pillOpacity).toBeGreaterThan(char.pillOpacity);
      expect(char.pillOpacity).toBeGreaterThan(prop.pillOpacity);
      expect(prop.pillOpacity).toBeGreaterThan(marker.pillOpacity);
    });

    it('enforces strict opacity order during playback (ghosted = true)', () => {
      const cam = getBillboardBaseOpacity('camera', false, true);
      const focus = getBillboardBaseOpacity('character', true, true);
      const char = getBillboardBaseOpacity('character', false, true);
      const prop = getBillboardBaseOpacity('prop', false, true);
      const marker = getBillboardBaseOpacity('marker', false, true);

      expect(cam.pillOpacity).toBe(1.0);
      expect(focus.pillOpacity).toBe(0.6);
      expect(char.pillOpacity).toBe(0.25);
      expect(prop.pillOpacity).toBe(0.15);
      expect(marker.pillOpacity).toBe(0.1);

      expect(cam.pillOpacity).toBeGreaterThan(focus.pillOpacity);
      expect(focus.pillOpacity).toBeGreaterThan(char.pillOpacity);
      expect(char.pillOpacity).toBeGreaterThan(prop.pillOpacity);
      expect(prop.pillOpacity).toBeGreaterThan(marker.pillOpacity);
    });
  });

  describe('Calibrated Z-Index Range Invariant ([0, 8] strictly < 10)', () => {
    it('bounds all z-index ranges strictly within [0, 8] to never occlude 2D HUD (z-10)', () => {
      const tiers = [
        getBillboardZIndexRange('camera', false),
        getBillboardZIndexRange('character', true), // highlighted
        getBillboardZIndexRange('character', false),
        getBillboardZIndexRange('prop', false),
        getBillboardZIndexRange('marker', false),
      ];

      for (const [top, bottom] of tiers) {
        expect(top).toBeLessThanOrEqual(8);
        expect(bottom).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThan(bottom);
      }
    });

    it('orders z-index strictly: camera > highlighted focus > character > prop > marker', () => {
      const cam = getBillboardZIndexRange('camera', false);
      const focus = getBillboardZIndexRange('character', true);
      const char = getBillboardZIndexRange('character', false);
      const prop = getBillboardZIndexRange('prop', false);
      const marker = getBillboardZIndexRange('marker', false);

      expect(cam[0]).toBeGreaterThan(focus[0]);
      expect(focus[0]).toBeGreaterThan(char[0]);
      expect(char[0]).toBeGreaterThan(prop[0]);
      expect(prop[0]).toBeGreaterThan(marker[0]);
    });
  });
});

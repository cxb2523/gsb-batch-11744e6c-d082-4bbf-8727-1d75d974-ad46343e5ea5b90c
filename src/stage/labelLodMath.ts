/**
 * Pure 3D Billboard Label LOD & Visual Hierarchy Math.
 * Evaluates distance-based semantic collapse (full pill <-> glowing accent dot),
 * kind-based opacity hierarchy (camera > focus > character > prop > marker),
 * and priority z-index ranges strictly within the [0, 8] viewport band.
 *
 * Governed by AGENTS.md Invariant 7 (Dual-Tier 60fps Loop: 0 React re-renders in Tier 1)
 * and Visual Design System §6.3 (Stacking Context Isolation: 3D <Html> z-index < 10).
 */

import type { EntityKind } from '../core/types';

export type BillboardLabelKind = EntityKind | 'camera';

export interface BillboardBaseOpacity {
  pillOpacity: number;
  dotOpacity: number;
}

export interface BillboardLodMetrics {
  culled: boolean;
  pillScale: number;
  pillOpacity: number;
  dotScale: number;
  dotOpacity: number;
  showPill: boolean;
  showDot: boolean;
}

// Distance thresholds (meters)
export const PROXIMITY_CULL_M = 1.2;
export const REF_DISTANCE_M = 12.0;
export const MIN_PERSPECTIVE_SCALE = 0.72;
export const MAX_PERSPECTIVE_SCALE = 1.55;

export const ENTITY_COLLAPSE_START_M = 24.0;
export const ENTITY_COLLAPSE_END_M = 28.0;

export const CAMERA_COLLAPSE_START_M = 52.0;
export const CAMERA_COLLAPSE_END_M = 60.0;

/**
 * Returns calibrated zIndexRange pairs for Drei <Html center zIndexRange={...}>.
 * Strictly bounded in [0, 8] to guarantee 3D labels never overlap 2D HUDs (z-10) or bottom docks (z-20).
 */
export function getBillboardZIndexRange(
  kind: BillboardLabelKind = 'character',
  highlighted = false
): [number, number] {
  if (kind === 'camera') return [8, 7];
  if (highlighted) return [6, 5];
  if (kind === 'character') return [4, 3];
  if (kind === 'prop') return [2, 1];
  return [1, 0]; // marker
}

/**
 * Directorial 4-Tier Opacity Hierarchy:
 * - Camera: 100% paused, 100% playing (master telemetry)
 * - Active Focus (highlighted): 100% paused, 60% playing with glowing accent border
 * - Passive Character: 85% paused, 25% playing
 * - Passive Prop: 55% paused, 15% playing
 * - Passive Marker: 35% paused, 10% playing (subtle floor orientation)
 */
export function getBillboardBaseOpacity(
  kind: BillboardLabelKind = 'character',
  highlighted = false,
  ghosted = false
): BillboardBaseOpacity {
  if (kind === 'camera') {
    return {
      pillOpacity: 1.0,
      dotOpacity: ghosted ? 0.9 : 0.95,
    };
  }

  if (highlighted) {
    return {
      pillOpacity: ghosted ? 0.6 : 1.0,
      dotOpacity: ghosted ? 0.75 : 0.95,
    };
  }

  if (kind === 'character') {
    return {
      pillOpacity: ghosted ? 0.25 : 0.85,
      dotOpacity: ghosted ? 0.4 : 0.8,
    };
  }

  if (kind === 'prop') {
    return {
      pillOpacity: ghosted ? 0.15 : 0.55,
      dotOpacity: ghosted ? 0.25 : 0.55,
    };
  }

  // marker
  return {
    pillOpacity: ghosted ? 0.1 : 0.35,
    dotOpacity: ghosted ? 0.18 : 0.38,
  };
}

/**
 * Computes live scale, opacity, and visibility flags for both the full pill badge
 * and the collapsed minimal accent dot at any 3D camera distance.
 */
export function computeBillboardLodMetrics(
  distM: number,
  kind: BillboardLabelKind = 'character',
  highlighted = false,
  ghosted = false
): BillboardLodMetrics {
  // 1. Proximity Culling (< 1.2m)
  if (distM < PROXIMITY_CULL_M) {
    return {
      culled: true,
      pillScale: 1.0,
      pillOpacity: 0,
      dotScale: 1.0,
      dotOpacity: 0,
      showPill: false,
      showDot: false,
    };
  }

  // 2. Clamped perspective scaling for full pill
  const safeDist = Math.max(distM, 1.0);
  const rawPillScale = Math.sqrt(REF_DISTANCE_M / safeDist);
  const pillScale = Math.min(
    Math.max(rawPillScale, MIN_PERSPECTIVE_SCALE),
    MAX_PERSPECTIVE_SCALE
  );

  // 3. Distance collapse band
  const isCamera = kind === 'camera';
  const collapseStart = isCamera
    ? CAMERA_COLLAPSE_START_M
    : ENTITY_COLLAPSE_START_M;
  const collapseEnd = isCamera ? CAMERA_COLLAPSE_END_M : ENTITY_COLLAPSE_END_M;

  const baseOpacity = getBillboardBaseOpacity(kind, highlighted, ghosted);

  if (distM <= collapseStart) {
    // Pure full pill badge
    return {
      culled: false,
      pillScale,
      pillOpacity: baseOpacity.pillOpacity,
      dotScale: 1.0,
      dotOpacity: 0,
      showPill: true,
      showDot: false,
    };
  }

  if (distM >= collapseEnd) {
    // Pure collapsed glowing accent dot
    // Dot scales slightly with distance to remain a crisp 8-10px beacon
    const dotScale = Math.min(Math.max(Math.sqrt(20.0 / safeDist), 0.75), 1.2);
    return {
      culled: false,
      pillScale,
      pillOpacity: 0,
      dotScale,
      dotOpacity: baseOpacity.dotOpacity,
      showPill: false,
      showDot: true,
    };
  }

  // Linear cross-fade band between collapseStart and collapseEnd
  const t = (distM - collapseStart) / (collapseEnd - collapseStart);
  const dotScale = Math.min(Math.max(Math.sqrt(20.0 / safeDist), 0.75), 1.2);

  return {
    culled: false,
    pillScale,
    pillOpacity: baseOpacity.pillOpacity * (1 - t),
    dotScale,
    dotOpacity: baseOpacity.dotOpacity * t,
    showPill: true,
    showDot: true,
  };
}


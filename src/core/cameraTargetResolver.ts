/**
 * Camera target anchor resolution and shot-boundary roll/offset reset semantics.
 * Pure Layer 1 module with zero React or DOM dependencies.
 */

import type {
  CameraCueSpec,
  EvaluatedEntityState,
  SphericalPose,
  TargetAnchor,
  Vec3,
} from './types';
import { ENTITY_DEFAULTS } from './constants';

export const ZERO_OFFSET: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Resolves starting roll for a shot:
 * - In standard mode (isContinuous = false): Resets to baselinePose.roll (0 rad) unless explicitly specified or continuing a delta/end (Option A).
 * - In continuous mode (isContinuous = true): Preserves prevPose.roll unless explicitly specified, gliding into authored roll.
 */
export function resolveShotStartRoll(
  spec: CameraCueSpec,
  prevPose: SphericalPose,
  baselinePose: SphericalPose,
  isContinuous = false
): number {
  if (spec.rollStartRad !== undefined) {
    return spec.rollStartRad;
  }
  if (spec.rollDeltaRad !== undefined) {
    return spec.rollRad ?? prevPose.roll;
  }
  if (spec.rollEndRad !== undefined) {
    return prevPose.roll;
  }
  if (spec.rollRad !== undefined) {
    return isContinuous ? prevPose.roll : spec.rollRad;
  }
  return isContinuous ? prevPose.roll : baselinePose.roll;
}

export function resolveShotDestRoll(
  P0: SphericalPose,
  spec: CameraCueSpec,
  baselinePose: SphericalPose,
  isContinuous = false
): number {
  if (spec.rollEndRad !== undefined) {
    return spec.rollEndRad;
  }
  if (spec.rollDeltaRad !== undefined) {
    return P0.roll + spec.rollDeltaRad;
  }
  if (spec.rollRad !== undefined) {
    return spec.rollRad;
  }
  return isContinuous ? P0.roll : baselinePose.roll;
}

/**
 * Resolves starting 3D target offset for a shot:
 * - In standard mode (isContinuous = false): Resets to (0, 0, 0) unless explicitly specified or continuing via target_offset_end (Option A).
 * - In continuous mode (isContinuous = true): Preserves prevOffset unless explicitly specified, gliding into authored offset.
 */
export function resolveShotStartOffset(
  spec: CameraCueSpec,
  prevOffset: Vec3 = ZERO_OFFSET,
  isContinuous = false
): Vec3 {
  if (spec.targetOffsetStart !== undefined) {
    return { ...spec.targetOffsetStart };
  }
  if (spec.targetOffsetEnd !== undefined) {
    return spec.targetOffset ? { ...spec.targetOffset } : { ...prevOffset };
  }
  if (spec.targetOffset !== undefined) {
    return isContinuous ? { ...prevOffset } : { ...spec.targetOffset };
  }
  return isContinuous ? { ...prevOffset } : { ...ZERO_OFFSET };
}

export function resolveShotDestOffset(
  spec: CameraCueSpec,
  prevOffset: Vec3 = ZERO_OFFSET,
  isContinuous = false
): Vec3 {
  if (spec.targetOffsetEnd !== undefined) {
    return { ...spec.targetOffsetEnd };
  }
  if (spec.targetOffset !== undefined) {
    return { ...spec.targetOffset };
  }
  return isContinuous ? { ...prevOffset } : { ...ZERO_OFFSET };
}

/**
 * Evaluates the 3D look-at anchor point of a single entity (eye-level for characters, volume center for props).
 */
export function getEntityLookAnchor(ent: EvaluatedEntityState): Vec3 {
  const effectiveHeight = ent.size?.y ?? ent.def.height;
  const anchorY =
    ent.def.kind === 'character'
      ? ent.position.y +
        effectiveHeight * ENTITY_DEFAULTS.CHARACTER_LOOK_ANCHOR_RATIO
      : ent.position.y + effectiveHeight * 0.5;
  return {
    x: ent.position.x,
    y: anchorY,
    z: ent.position.z,
  };
}

function findEntityByCleanKey(
  cleanKey: string,
  entitiesById: Map<string, EvaluatedEntityState>
): EvaluatedEntityState | undefined {
  const direct = entitiesById.get(cleanKey);
  if (direct) return direct;
  for (const ent of entitiesById.values()) {
    if (
      ent.id.toLowerCase() === cleanKey ||
      ent.def.label.toLowerCase() === cleanKey
    ) {
      return ent;
    }
  }
  return undefined;
}

/**
 * Resolves an anchor key (single entity ID, multi-entity array for two-shots/group centroids,
 * preset name, or Vec3) into a 3D world look-at point, applying an optional world-space metric offset [dx, dy, dz].
 */
export function resolveTargetPoint3D(
  targetKey: TargetAnchor | undefined,
  entitiesById: Map<string, EvaluatedEntityState>,
  fallbackTarget: Vec3,
  offset?: Vec3
): Vec3 {
  let base: Vec3 | undefined;

  if (!targetKey) {
    base = { ...fallbackTarget };
  } else if (Array.isArray(targetKey)) {
    // Multi-entity array: compute pure 3D centroid midpoint
    const anchors: Vec3[] = [];
    for (const key of targetKey) {
      const clean = key.trim().toLowerCase();
      if (clean === 'center' || clean === 'origin' || clean === 'stage') {
        anchors.push({ x: 0, y: 1.0, z: 0 });
      } else {
        const ent = findEntityByCleanKey(clean, entitiesById);
        if (ent) {
          anchors.push(getEntityLookAnchor(ent));
        }
      }
    }
    if (anchors.length > 0) {
      const count = anchors.length;
      base = {
        x: anchors.reduce((sum, a) => sum + a.x, 0) / count,
        y: anchors.reduce((sum, a) => sum + a.y, 0) / count,
        z: anchors.reduce((sum, a) => sum + a.z, 0) / count,
      };
    } else {
      base = { ...fallbackTarget };
    }
  } else if (typeof targetKey === 'object') {
    base = { ...targetKey };
  } else {
    const clean = targetKey.trim().toLowerCase();
    if (clean === 'center' || clean === 'origin' || clean === 'stage') {
      base = { x: 0, y: 1.0, z: 0 };
    } else {
      const ent = findEntityByCleanKey(clean, entitiesById);
      if (ent) {
        base = getEntityLookAnchor(ent);
      }
    }
  }

  const resolved = base ?? { ...fallbackTarget };
  if (!offset) {
    return resolved;
  }
  return {
    x: resolved.x + offset.x,
    y: resolved.y + offset.y,
    z: resolved.z + offset.z,
  };
}

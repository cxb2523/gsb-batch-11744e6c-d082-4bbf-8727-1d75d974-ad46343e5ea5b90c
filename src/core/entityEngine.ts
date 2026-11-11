/**
 * Deterministic entity kinematics evaluator (Layer 1 Facade).
 * Delegates to:
 *   - Tier 1: Decoupled root `blocking:` timeline evaluation (`evaluateBlockingEntitiesAtTime`).
 *   - Tier 2: Legacy per-shot `shots[].entities` evaluation (`evaluateLegacyEntitiesAtTime`).
 * Pure Layer 1 module with zero React or DOM dependencies.
 */

import type {
  EvaluatedEntityState,
  StageScore,
} from './types';
import { evaluateBlockingEntitiesAtTime } from './entityBlockingEvaluator';
import { evaluateLegacyEntitiesAtTime } from './entityLegacyEvaluator';
import {
  type ChainedBlockingCueEntry,
  type EntityPoseSnapshot,
  buildGroundTrailPoints,
  resolveLookAtPoint,
} from './entityKinematicUtils';

// Re-export kinematic utilities and types for downstream tests and backward compatibility
export type { ChainedBlockingCueEntry, EntityPoseSnapshot };
export {
  buildGroundTrailPoints,
  evaluateBlockingEntitiesAtTime,
  evaluateLegacyEntitiesAtTime,
  resolveLookAtPoint,
};

/**
 * Evaluates all scene entities at a given timestamp (in seconds).
 * Delegates to Tier 1 decoupled `blocking:` when present and non-empty,
 * or falls back to Tier 2 per-shot `shots[].entities` evaluation.
 */
export function evaluateEntitiesAtTime(
  elapsedSec: number,
  score: StageScore
): {
  entitiesById: Map<string, EvaluatedEntityState>;
  entitiesList: EvaluatedEntityState[];
} {
  if (score.blocking && score.blocking.length > 0) {
    return evaluateBlockingEntitiesAtTime(elapsedSec, score);
  }
  return evaluateLegacyEntitiesAtTime(elapsedSec, score);
}

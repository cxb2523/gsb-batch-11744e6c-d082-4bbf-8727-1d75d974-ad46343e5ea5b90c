/**
 * Tier 1: Decoupled root `blocking:` timeline kinematics evaluator.
 * Evaluates continuous multi-cut kinematics across blocking cues:
 *   - Two-pass continuous multi-cut evaluation (positions and facing rotations)
 *   - Option A full-cue floor trails across camera cuts
 *   - Continuous C0 look_at handoff and mutual gaze resolution
 *   - Pose hold persistence across gap intervals
 *   - Hybrid per-shot highlight and note overlays
 * Pure Layer 1 module with zero React or DOM dependencies.
 */

import type {
  EvaluatedEntityState,
  StageScore,
  Vec3,
} from './types';
import { evaluateCameraEasing } from './maneuvers';
import {
  cloneVec3,
  computeLookAtYawRad,
  shortestAngleDiff,
} from './sphericalMath';
import {
  type ChainedBlockingCueEntry,
  buildGroundTrailPoints,
  getEntityBaseSize,
  resolveCueStartEndSize,
  resolveLookAtPoint,
} from './entityKinematicUtils';

/**
 * Evaluates entities against the decoupled root `blocking:` timeline at elapsedSec.
 */
export function evaluateBlockingEntitiesAtTime(
  elapsedSec: number,
  score: StageScore
): {
  entitiesById: Map<string, EvaluatedEntityState>;
  entitiesList: EvaluatedEntityState[];
} {
  const blockingCues = score.blocking ?? [];
  const chainsByEntity = new Map<string, ChainedBlockingCueEntry[]>();

  // Pass 1: Build forward-chained 3D world position & visibility tracks per entity
  for (const def of score.entities) {
    const entityCues = blockingCues
      .filter((c) => c.entityId.toLowerCase() === def.id.toLowerCase())
      .sort((a, b) => a.startSec - b.startSec);

    let prevPos: Vec3 = cloneVec3(def.position);
    let prevSize: Vec3 = getEntityBaseSize(def);
    let prevVis: boolean = true;
    const entries: ChainedBlockingCueEntry[] = [];

    for (const cue of entityCues) {
      const isCut = Boolean(cue.cut);
      const startPos = isCut
        ? cue.position
          ? cloneVec3(cue.position)
          : cue.fromPosition
          ? cloneVec3(cue.fromPosition)
          : cloneVec3(prevPos)
        : cue.fromPosition
        ? cloneVec3(cue.fromPosition)
        : cloneVec3(prevPos);
      const endPos = cue.position
        ? cloneVec3(cue.position)
        : cloneVec3(startPos);
      const { startSize, endSize } = resolveCueStartEndSize(
        cue,
        prevSize,
        isCut
      );
      const visible: boolean = cue.visible ?? prevVis;

      entries.push({
        cue,
        startPos,
        endPos,
        startRot: def.rotationYRad,
        endRot: def.rotationYRad,
        startSize,
        endSize,
        visible,
        isCut,
      });

      prevPos = cloneVec3(endPos);
      prevSize = cloneVec3(endSize);
      prevVis = visible;
    }

    chainsByEntity.set(def.id, entries);
  }

  // Helper to evaluate all entity positions at any arbitrary timestamp t
  const evaluatePositionsAt = (t: number): Map<string, Vec3> => {
    const posMap = new Map<string, Vec3>();
    for (const def of score.entities) {
      const chain = chainsByEntity.get(def.id) ?? [];
      const active = chain
        .slice()
        .reverse()
        .find((e) => t >= e.cue.startSec && t < e.cue.endSec);
      const lastFinished = chain
        .slice()
        .reverse()
        .find((e) => t >= e.cue.endSec);

      if (active) {
        const dur = Math.max(0.016, active.cue.endSec - active.cue.startSec);
        const tau = Math.min(1, Math.max(0, (t - active.cue.startSec) / dur));
        const u = evaluateCameraEasing(active.cue.easing, tau);
        posMap.set(def.id, {
          x: active.startPos.x + u * (active.endPos.x - active.startPos.x),
          y: active.startPos.y + u * (active.endPos.y - active.startPos.y),
          z: active.startPos.z + u * (active.endPos.z - active.startPos.z),
        });
      } else if (lastFinished) {
        posMap.set(def.id, cloneVec3(lastFinished.endPos));
      } else {
        posMap.set(def.id, cloneVec3(def.position));
      }
    }
    return posMap;
  };

  // Pass 2: Build forward-chained facing rotations (including C0 look_at handoff)
  for (const def of score.entities) {
    const chain = chainsByEntity.get(def.id) ?? [];
    let prevRot = def.rotationYRad;

    for (const entry of chain) {
      entry.startRot = prevRot;
      let endRot = entry.startRot;

      if (entry.cue.rotationYRad !== undefined) {
        endRot = entry.cue.rotationYRad;
      } else if (entry.cue.lookAt) {
        const sampleTime = Math.max(entry.cue.startSec, entry.cue.endSec - 1e-6);
        const posAtEnd = evaluatePositionsAt(sampleTime);
        const targetPt = resolveLookAtPoint(
          entry.cue.lookAt,
          posAtEnd,
          score.entities
        );
        if (targetPt) {
          endRot = computeLookAtYawRad(entry.endPos, targetPt);
        }
      } else if (
        !entry.isCut &&
        Math.hypot(
          entry.endPos.x - entry.startPos.x,
          entry.endPos.z - entry.startPos.z
        ) > 0.05
      ) {
        endRot = computeLookAtYawRad(entry.startPos, entry.endPos);
      }

      entry.endRot = endRot;
      prevRot = endRot;
    }
  }

  // Resolve active film shot for hybrid per-shot focus metadata (highlighted / note)
  const sortedShots = [...score.shots].sort((a, b) => a.startSec - b.startSec);
  const activeShot = sortedShots
    .slice()
    .reverse()
    .find((s) => elapsedSec >= s.startSec && elapsedSec < s.endSec);

  const livePositions = evaluatePositionsAt(elapsedSec);
  const entitiesById = new Map<string, EvaluatedEntityState>();
  const entitiesList: EvaluatedEntityState[] = [];

  for (const def of score.entities) {
    const chain = chainsByEntity.get(def.id) ?? [];
    const pos = livePositions.get(def.id)!;
    const shotOv = activeShot?.entities[def.id];

    const active = chain
      .slice()
      .reverse()
      .find((e) => elapsedSec >= e.cue.startSec && elapsedSec < e.cue.endSec);
    const lastFinished = chain
      .slice()
      .reverse()
      .find((e) => elapsedSec >= e.cue.endSec);

    let rotY = def.rotationYRad;
    let size: Vec3 = getEntityBaseSize(def);
    let visible = shotOv?.visible ?? true;
    let highlighted = Boolean(shotOv?.highlighted);
    let note = shotOv?.note;
    let trailPoints: Vec3[] = [];
    let cueId: string | null = 'preroll';

    if (active) {
      const dur = Math.max(0.016, active.cue.endSec - active.cue.startSec);
      const tau = Math.min(
        1,
        Math.max(0, (elapsedSec - active.cue.startSec) / dur)
      );
      const u = evaluateCameraEasing(active.cue.easing, tau);

      rotY =
        active.startRot +
        u * shortestAngleDiff(active.endRot, active.startRot);

      size = {
        x: active.startSize.x + u * (active.endSize.x - active.startSize.x),
        y: active.startSize.y + u * (active.endSize.y - active.startSize.y),
        z: active.startSize.z + u * (active.endSize.z - active.startSize.z),
      };

      if (active.cue.lookAt) {
        const lookTarget = resolveLookAtPoint(
          active.cue.lookAt,
          livePositions,
          score.entities
        );
        if (lookTarget) {
          rotY = computeLookAtYawRad(pos, lookTarget);
        }
      }

      visible = active.visible;
      highlighted = Boolean(active.cue.highlighted ?? shotOv?.highlighted);
      note = active.cue.note ?? shotOv?.note;
      trailPoints = active.cue.cut
        ? []
        : buildGroundTrailPoints(active.startPos, active.endPos);
      cueId = active.cue.id;
    } else if (lastFinished) {
      rotY = lastFinished.endRot;
      size = cloneVec3(lastFinished.endSize);
      visible = lastFinished.visible;
      cueId = `hold:${lastFinished.cue.id}`;
    }

    const state: EvaluatedEntityState = {
      id: def.id,
      def,
      cueId,
      position: pos,
      rotationYRad: rotY,
      size,
      highlighted,
      visible,
      note,
      trailPoints,
    };

    entitiesById.set(def.id, state);
    entitiesList.push(state);
  }

  return { entitiesById, entitiesList };
}

/**
 * Master stateless frame evaluator (`Frame_t = f(t, score)`).
 * Deterministically computes the complete 3D diorama state for any timestamp `t`.
 */

import type { SphericalPose, StageFrame, StageScore } from './types';
import { BLUEPRINT_PALETTE } from './constants';
import { evaluateStageCameraDof } from './dofEvaluator';
import { evaluateEntitiesAtTime } from './entityEngine';
import { evaluateCameraTrack } from './trajectoryChain';

export function computeStageFrame(
  rawTimestampSec: number,
  score: StageScore,
  initialObserverPose?: SphericalPose
): StageFrame {
  const durationSec = Math.max(0.1, score.durationSec);
  const clampedSec = Math.max(
    0,
    Math.min(durationSec, rawTimestampSec + score.offsetSec)
  );
  const progress = Math.max(0, Math.min(1, clampedSec / durationSec));

  // Find active shot at clampedSec (latest matching shot in YAML order takes priority on overlap)
  let shotIndex = -1;
  for (let i = score.shots.length - 1; i >= 0; i--) {
    const s = score.shots[i];
    if (clampedSec >= s.startSec && clampedSec < s.endSec) {
      shotIndex = i;
      break;
    }
  }
  if (shotIndex === -1 && clampedSec >= durationSec && score.shots.length > 0) {
    shotIndex = score.shots.length - 1;
  }

  const activeShot = shotIndex >= 0 ? score.shots[shotIndex] : null;
  let shotProgress = 0;
  if (activeShot) {
    const shotDuration = Math.max(0.016, activeShot.endSec - activeShot.startSec);
    shotProgress = Math.max(
      0,
      Math.min(1, (clampedSec - activeShot.startSec) / shotDuration)
    );
  }

  // 1. Evaluate Scene Entities (characters, props, markers)
  const { entitiesById, entitiesList } = evaluateEntitiesAtTime(
    clampedSec,
    score
  );

  // 2. Evaluate Illustrative Stage Camera Track
  const stageTrack = evaluateCameraTrack(
    'stage',
    clampedSec,
    score,
    entitiesById
  );
  const activeStageSpec = activeShot?.stageCamera;
  const frustumDepth =
    activeStageSpec?.frustumDepth && activeStageSpec.frustumDepth > 0
      ? activeStageSpec.frustumDepth
      : stageTrack.transform.pose.distance;
  const dof = evaluateStageCameraDof(
    score,
    activeShot,
    shotProgress,
    stageTrack,
    entitiesById
  );
  const showRig =
    Boolean(stageTrack.rig) &&
    (activeStageSpec?.showRig ?? score.stage.showRigs ?? true);

  // 3. Evaluate Viewport Observer Camera Track
  const observerTrack = evaluateCameraTrack(
    'observer',
    clampedSec,
    score,
    entitiesById,
    initialObserverPose
  );

  return {
    timestampSec: clampedSec,
    progress,
    activeShot,
    shotIndex,
    shotProgress,
    observerCamera: observerTrack,
    stageCamera: {
      ...stageTrack,
      frustumDepth,
      frustumColor:
        activeStageSpec?.frustumColor ?? BLUEPRINT_PALETTE.frustumDefault,
      showPath: activeStageSpec?.showPath ?? true,
      showRig,
      dof,
    },
    entitiesById,
    entitiesList,
  };
}

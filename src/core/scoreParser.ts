/**
 * Resilient YAML / JSON choreography score parser and normalizer.
 * Converts human-authored degrees into radians and applies metric stage defaults.
 */

import { parse as parseYaml, YAMLParseError } from 'yaml';
import type {
  EntityCueOverride,
  EntityKind,
  ParseScoreResult,
  SceneEntityDef,
  ScoreDiagnostic,
  ScoreOpticsConfig,
  ShotCue,
} from './types';
import {
  BLUEPRINT_PALETTE,
  DEFAULT_OBSERVER_POSE,
  DEFAULT_STAGE_CAMERA_POSE,
} from './constants';
import { parseAspectRatio } from './opticsMath';
import {
  parseEntityCueDimensionOverrides,
  resolveEntityDefDimensions,
} from './entityKinematicUtils';
import {
  normalizeCameraEasing,
  normalizeCameraManeuver,
  normalizeEntityKind,
  normalizeEntityShape,
  normalizeEntityStyle,
  parseAngleToRad,
  parseApertureFStop,
  parseBlockingCues,
  parseDofPreset,
  parseFocusTargetOrDistance,
  parseLensFocalLengthMm,
  parseMetricDistanceM,
  parseOptionalVec3,
  parseTargetOrVec3,
  parseVec3,
  resolveEntityIdentifier,
} from './scorePrimitives';
import {
  applyFlatShotCameraOverrides,
  parseBaseSphericalPose,
  parseCameraCueSpec,
  parseObserverShots,
  parseStageCameraCueSpec,
  resolveStageCamEntityTarget,
} from './cameraCueParser';

// Re-export primitive helpers and normalizers for full backward compatibility
export {
  normalizeCameraEasing,
  normalizeCameraManeuver,
  normalizeEntityKind,
  normalizeEntityShape,
  normalizeEntityStyle,
  parseAngleToRad,
  parseApertureFStop,
  parseBlockingCues,
  parseDofPreset,
  parseFocusTargetOrDistance,
  parseLensFocalLengthMm,
  parseMetricDistanceM,
  parseOptionalVec3,
  parseTargetOrVec3,
  parseVec3,
  resolveEntityIdentifier,
};

// Re-export camera cue parsing helpers for downstream usage and tests
export {
  applyFlatShotCameraOverrides,
  parseBaseSphericalPose,
  parseCameraCueSpec,
  parseObserverShots,
  parseStageCameraCueSpec,
  resolveStageCamEntityTarget,
};

/**
 * Parses a raw YAML or JSON string into a normalized StageScore.
 */
export function parseStageScore(
  rawText: string,
  fallbackId = 'custom-scene'
): ParseScoreResult {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return { score: null, error: 'Score content is empty.' };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const diagnostics: ScoreDiagnostic[] = [];
    if (err instanceof YAMLParseError && err.linePos && err.linePos.length > 0) {
      diagnostics.push({
        line: err.linePos[0].line,
        column: err.linePos[0].col,
        message: err.message,
        severity: 'error',
      });
    }
    return {
      score: null,
      error: `YAML syntax error: ${message}`,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      score: null,
      error: 'Score root must be a YAML/JSON object mapping.',
    };
  }

  const root = parsed as Record<string, unknown>;
  const version = String(root.version ?? '1.0');
  const id = String(root.id ?? fallbackId);
  const title = String(root.title ?? 'Untitled StageFlow Scene');
  const subtitle =
    typeof root.subtitle === 'string' ? root.subtitle : undefined;
  const description =
    typeof root.description === 'string'
      ? root.description
      : typeof root.notes === 'string'
      ? root.notes
      : undefined;

  // Parse optional scene-wide metadata block
  let metadata: Record<string, unknown> | undefined;
  if (
    root.metadata &&
    typeof root.metadata === 'object' &&
    !Array.isArray(root.metadata)
  ) {
    const rawMeta = root.metadata as Record<string, unknown>;
    if (Object.keys(rawMeta).length > 0) {
      metadata = { ...rawMeta };
    }
  }

  const continuous =
    root.continuous === true ||
    root.continuous === 'true' ||
    root.continuous === 'yes';
  let videoUrl = 'procedural://demo';
  let videoAspectRatio: string | number | undefined;

  if (typeof root.video === 'string') {
    videoUrl = root.video.trim();
  } else if (root.video && typeof root.video === 'object') {
    const vObj = root.video as Record<string, unknown>;
    const candidate = vObj.src ?? vObj.url;
    if (typeof candidate === 'string') {
      videoUrl = candidate.trim();
    }
    if (vObj.aspect_ratio || vObj.aspectRatio) {
      videoAspectRatio = (vObj.aspect_ratio ?? vObj.aspectRatio) as
        | string
        | number;
    }
  } else if (typeof root.video_url === 'string') {
    videoUrl = root.video_url.trim();
  } else if (typeof root.videoUrl === 'string') {
    videoUrl = root.videoUrl.trim();
  }

  const aspectRatio = parseAspectRatio(
    (root.aspect_ratio ?? root.aspectRatio ?? videoAspectRatio) as
      | string
      | number
      | undefined
  );

  const rawStage =
    root.stage && typeof root.stage === 'object'
      ? (root.stage as Record<string, unknown>)
      : {};

  const stageWidth =
    typeof rawStage.width === 'number' && rawStage.width > 0
      ? rawStage.width
      : 10;
  const stageDepth =
    typeof rawStage.depth === 'number' && rawStage.depth > 0
      ? rawStage.depth
      : 10;
  const gridStep =
    typeof rawStage.grid_step === 'number' && rawStage.grid_step > 0
      ? rawStage.grid_step
      : 1;

  const rawShowRigs =
    rawStage.show_rigs ??
    rawStage.showRigs ??
    root.show_rigs ??
    root.showRigs;
  const showRigs =
    rawShowRigs === false ||
    rawShowRigs === 'false' ||
    rawShowRigs === 'no'
      ? false
      : true;

  const defaultObserverPose = parseBaseSphericalPose(
    rawStage.observer_camera ?? rawStage.observerCamera,
    DEFAULT_OBSERVER_POSE
  );
  const defaultStageCameraPose = parseBaseSphericalPose(
    rawStage.stage_camera ?? rawStage.stageCamera,
    DEFAULT_STAGE_CAMERA_POSE
  );

  // Parse Entities
  const rawEntities = Array.isArray(root.entities) ? root.entities : [];
  const entities: SceneEntityDef[] = rawEntities
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const ent = item as Record<string, unknown>;
      const kind: EntityKind = normalizeEntityKind(ent.kind);
      const shape = normalizeEntityShape(kind, ent.shape);
      const style = normalizeEntityStyle(kind, ent.style);

      const defaultColor =
        kind === 'character'
          ? idx % 2 === 0
            ? BLUEPRINT_PALETTE.characterPrimary
            : BLUEPRINT_PALETTE.characterSecondary
          : kind === 'prop'
          ? BLUEPRINT_PALETTE.propDefault
          : BLUEPRINT_PALETTE.markerDefault;

      const { width, height, depth, radius } = resolveEntityDefDimensions(
        ent,
        kind,
        shape
      );

      return {
        id: String(ent.id ?? `entity_${idx + 1}`),
        label: String(ent.label ?? ent.id ?? `Entity ${idx + 1}`),
        kind,
        ...(shape ? { shape } : {}),
        style,
        position: parseVec3(ent.position, { x: 0, y: 0, z: 0 }),
        rotationYRad: parseAngleToRad(ent.rotation ?? ent.yaw, 0) ?? 0,
        height,
        width,
        depth,
        radius,
        color:
          typeof ent.color === 'string' && ent.color.trim().length > 0
            ? ent.color.trim()
            : defaultColor,
      };
    });

  // Resolve target strings inside defaultStageCameraPose / defaultObserverPose if they reference an entity
  resolveStageCamEntityTarget(
    rawStage.stage_camera ?? rawStage.stageCamera,
    defaultStageCameraPose,
    entities
  );
  resolveStageCamEntityTarget(
    rawStage.observer_camera ?? rawStage.observerCamera,
    defaultObserverPose,
    entities
  );

  // Parse Shots
  const rawShots = Array.isArray(root.shots ?? root.score)
    ? ((root.shots ?? root.score) as unknown[])
    : [];

  let prevShotEndSec = 0;
  const missingStartShotIds: string[] = [];

  const shots: ShotCue[] = rawShots
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const sh = item as Record<string, unknown>;
      const rawStartCandidate = sh.start ?? sh._start;
      const rawEndCandidate = sh.end ?? sh._end;
      const hasExplicitStart =
        typeof rawStartCandidate === 'number' &&
        Number.isFinite(rawStartCandidate);

      const stageCamera = applyFlatShotCameraOverrides(
        sh,
        parseStageCameraCueSpec(
          sh.stage_camera ?? sh.stageCamera ?? sh.camera
        )
      );
      const observerCamera = parseCameraCueSpec(
        sh.observer_camera ?? sh.observerCamera,
        defaultObserverPose.focalLengthMm
      );

      const shotContinuous =
        typeof sh.continuous === 'boolean'
          ? sh.continuous
          : sh.continuous === 'true' || sh.continuous === 'yes'
          ? true
          : sh.continuous === 'false' || sh.continuous === 'no'
          ? false
          : undefined;

      const isContinuous =
        shotContinuous ??
        stageCamera?.continuous ??
        observerCamera?.continuous ??
        continuous;

      let startSec: number;
      if (hasExplicitStart) {
        startSec = Math.max(0, rawStartCandidate);
      } else if (isContinuous) {
        startSec = prevShotEndSec;
      } else {
        startSec = 0;
        if (idx > 0) {
          missingStartShotIds.push(String(sh.id ?? `shot-${idx + 1}`));
        }
      }

      const endSec =
        typeof rawEndCandidate === 'number' && Number.isFinite(rawEndCandidate)
          ? Math.max(startSec + 0.1, rawEndCandidate)
          : startSec + 5.0;

      prevShotEndSec = endSec;

      const entityOverrides: Record<string, EntityCueOverride> = {};
      if (sh.entities && typeof sh.entities === 'object') {
        for (const [entId, rawOv] of Object.entries(
          sh.entities as Record<string, unknown>
        )) {
          if (!rawOv || typeof rawOv !== 'object') continue;
          const ov = rawOv as Record<string, unknown>;
          const matchedEnt = entities.find(
            (e) => e.id.toLowerCase() === entId.toLowerCase()
          );
          const dimOverrides = parseEntityCueDimensionOverrides(ov, matchedEnt);
          const rawOvCut = ov.cut;
          const isCut =
            typeof rawOvCut === 'boolean'
              ? rawOvCut
              : rawOvCut === 'true' || rawOvCut === 'yes'
              ? true
              : rawOvCut === 'false' || rawOvCut === 'no'
              ? false
              : undefined;

          const rawOvContinuous = ov.continuous;
          const ovContinuous =
            typeof rawOvContinuous === 'boolean'
              ? rawOvContinuous
              : rawOvContinuous === 'true' || rawOvContinuous === 'yes'
              ? true
              : rawOvContinuous === 'false' || rawOvContinuous === 'no'
              ? false
              : undefined;

          entityOverrides[entId] = {
            fromPosition: ov.from_position
              ? parseVec3(ov.from_position)
              : ov.from
              ? parseVec3(ov.from)
              : undefined,
            position: ov.position ? parseVec3(ov.position) : undefined,
            rotationYRad: parseAngleToRad(ov.rotation ?? ov.yaw),
            lookAt: parseTargetOrVec3(ov.look_at ?? ov.lookAt),
            ...dimOverrides,
            easing: normalizeCameraEasing(ov.easing),
            highlighted: Boolean(ov.highlighted ?? ov.highlight),
            visible: ov.visible !== false,
            note: typeof ov.note === 'string' ? ov.note : undefined,
            cut: isCut,
            continuous: ovContinuous,
          };
        }
      }

      return {
        id: String(sh.id ?? `shot-${idx + 1}`),
        shotNumber:
          typeof sh.shot === 'number' && Number.isFinite(sh.shot)
            ? sh.shot
            : idx + 1,
        label: String(sh.label ?? sh.name ?? `Shot ${idx + 1}`),
        description: String(sh.description ?? sh.note ?? ''),
        ...(shotContinuous !== undefined ? { continuous: shotContinuous } : {}),
        startSec,
        endSec,
        stageCamera,
        observerCamera,
        entities: entityOverrides,
      };
    });

  if (shots.length === 0) {
    return {
      score: null,
      error: 'Score must define at least one shot in "shots:".',
    };
  }

  // Parse optional decoupled root-level observer_shots and blocking
  const missingStartObserverShotIds: string[] = [];
  const observerShots = parseObserverShots(
    root.observer_shots ?? root.observerShots,
    defaultObserverPose.focalLengthMm,
    continuous,
    missingStartObserverShotIds
  );
  const missingStartBlockingCueIds: string[] = [];
  const blocking = parseBlockingCues(
    root.blocking,
    entities,
    continuous,
    missingStartBlockingCueIds
  );

  const maxFilmShotEnd = Math.max(...shots.map((s) => s.endSec));
  const maxObserverShotEnd =
    observerShots && observerShots.length > 0
      ? Math.max(...observerShots.map((s) => s.endSec))
      : 0;
  const maxBlockingEnd =
    blocking && blocking.length > 0
      ? Math.max(...blocking.map((b) => b.endSec))
      : 0;
  const maxTimelineEnd = Math.max(
    maxFilmShotEnd,
    maxObserverShotEnd,
    maxBlockingEnd
  );

  const durationSec =
    typeof root.duration === 'number' && root.duration > 0
      ? root.duration
      : maxTimelineEnd;
  const offsetSec =
    typeof root.offset === 'number' && Number.isFinite(root.offset)
      ? root.offset
      : 0;

  // Parse optional optics configuration block (or root-level dof_blur / dof / aperture)
  const rawOptics =
    root.optics && typeof root.optics === 'object'
      ? (root.optics as Record<string, unknown>)
      : undefined;
  const rawDofBlur =
    rawOptics?.dof_blur ??
    rawOptics?.dofBlur ??
    rawOptics?.blur ??
    root.dof_blur ??
    root.dofBlur;
  const dofBlur =
    rawDofBlur === true || rawDofBlur === 'true' || rawDofBlur === 'yes';
  const defaultDof = parseDofPreset(
    rawOptics?.dof ??
      rawOptics?.depth_of_field ??
      rawOptics?.depthOfField ??
      root.dof
  );
  const defaultApertureFStop = parseApertureFStop(
    rawOptics?.aperture ??
      rawOptics?.f_stop ??
      rawOptics?.fStop ??
      root.aperture
  );
  const optics: ScoreOpticsConfig | undefined =
    rawOptics !== undefined ||
    rawDofBlur !== undefined ||
    defaultDof !== undefined ||
    defaultApertureFStop !== undefined
      ? {
          dofBlur,
          ...(defaultDof !== undefined ? { defaultDof } : {}),
          ...(defaultApertureFStop !== undefined
            ? { defaultApertureFStop }
            : {}),
        }
      : undefined;

  const warning =
    missingStartShotIds.length > 0
      ? `Shot "${missingStartShotIds[0]}" omits "start" (defaulted to 0.0s). Add "start:" or declare "continuous: true" at root to auto-chain.`
      : missingStartObserverShotIds.length > 0
      ? `Observer shot "${missingStartObserverShotIds[0]}" omits "start" (defaulted to 0.0s). Add "start:" or declare "continuous: true" to auto-chain.`
      : missingStartBlockingCueIds.length > 0
      ? `Blocking cue "${missingStartBlockingCueIds[0]}" omits "start" (defaulted to 0.0s). Add "start:" or declare "continuous: true" to auto-chain.`
      : null;

  return {
    score: {
      version,
      id,
      title,
      subtitle,
      description,
      ...(metadata ? { metadata } : {}),
      continuous: continuous || undefined,
      videoUrl,
      aspectRatio,
      durationSec,
      offsetSec,
      stage: {
        width: stageWidth,
        depth: stageDepth,
        gridStep,
        showRigs,
        defaultObserverPose,
        defaultStageCameraPose,
      },
      entities,
      shots,
      observerShots,
      blocking,
      ...(optics ? { optics } : {}),
    },
    error: null,
    warning,
  };
}

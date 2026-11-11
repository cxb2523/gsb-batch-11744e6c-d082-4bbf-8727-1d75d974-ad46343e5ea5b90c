/**
 * Low-level primitive value parsers and enum normalizers for StageFlow YAML scores.
 * Converts human-authored degrees, millimeter strings, and 3D coordinate tuples
 * into normalized internal metric/radian primitives.
 * Pure Layer 1 module with zero React or DOM dependencies.
 */

import type {
  BlockingCueSpec,
  CameraEasing,
  CameraManeuver,
  DofPreset,
  EntityKind,
  EntityShape,
  EntityStyle,
  SceneEntityDef,
  TargetAnchor,
  Vec3,
} from './types';
import { CAMERA_LIMITS } from './constants';
import {
  clampApertureFStop,
  clampFocalLengthMm,
  presetToApertureFStop,
} from './opticsMath';
import { degToRad } from './sphericalMath';
import { parseEntityCueDimensionOverrides } from './entityKinematicUtils';

export function parseVec3(
  raw: unknown,
  fallback: Vec3 = { x: 0, y: 0, z: 0 }
): Vec3 {
  if (Array.isArray(raw) && raw.length >= 3) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    const z = Number(raw[2]);
    return {
      x: Number.isFinite(x) ? x : fallback.x,
      y: Number.isFinite(y) ? y : fallback.y,
      z: Number.isFinite(z) ? z : fallback.z,
    };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const x = Number(obj.x);
    const y = Number(obj.y);
    const z = Number(obj.z);
    return {
      x: Number.isFinite(x) ? x : fallback.x,
      y: Number.isFinite(y) ? y : fallback.y,
      z: Number.isFinite(z) ? z : fallback.z,
    };
  }
  return { ...fallback };
}

export function parseOptionalVec3(raw: unknown): Vec3 | undefined {
  if (Array.isArray(raw) && raw.length >= 3) {
    return parseVec3(raw);
  }
  if (raw && typeof raw === 'object') {
    return parseVec3(raw);
  }
  return undefined;
}

export function parseTargetOrVec3(raw: unknown): TargetAnchor | undefined {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every((item) => typeof item === 'string' && item.trim().length > 0)) {
      return raw.map((item) => String(item).trim());
    }
    return parseVec3(raw);
  }
  if (raw && typeof raw === 'object') {
    return parseVec3(raw);
  }
  return undefined;
}

/**
 * Parses a metric distance value such as `3.5`, `"3.5m"`, `"3.5 m"`, `"3.5meters"`
 * into a finite clamped distance in meters [0.4m, 100.0m].
 */
export function parseMetricDistanceM(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.max(
      CAMERA_LIMITS.MIN_DISTANCE_M,
      Math.min(CAMERA_LIMITS.MAX_DISTANCE_M, raw)
    );
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^[+-]?\d+(\.\d+)?\s*(m|meters?)?$/i.test(trimmed)) {
      const val = parseFloat(trimmed);
      if (Number.isFinite(val) && val > 0) {
        return Math.max(
          CAMERA_LIMITS.MIN_DISTANCE_M,
          Math.min(CAMERA_LIMITS.MAX_DISTANCE_M, val)
        );
      }
    }
  }
  return undefined;
}

/**
 * Polymorphically parses a `focus:` / `focus_start:` / `focus_end:` value:
 * - Numeric or metric string (`3.5`, `"3.5m"`) -> `{ distanceM: 3.5 }`
 * - Entity ID/label (`"alice"`), entity array (`["alice", "bob"]`), or 3D tuple (`[0, 1.5, -2]`) -> `{ target: ... }`
 */
export function parseFocusTargetOrDistance(raw: unknown): {
  target?: string | string[] | Vec3;
  distanceM?: number;
} {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return { distanceM: parseMetricDistanceM(raw) };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^[+-]?\d+(\.\d+)?\s*(m|meters?)?$/i.test(trimmed)) {
      return { distanceM: parseMetricDistanceM(trimmed) };
    }
    if (trimmed.length > 0) {
      return { target: trimmed };
    }
    return {};
  }
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every((item) => typeof item === 'string' && item.trim().length > 0)) {
      return { target: raw.map((item) => String(item).trim()) };
    }
    return { target: parseVec3(raw) };
  }
  if (raw && typeof raw === 'object') {
    return { target: parseVec3(raw) };
  }
  return {};
}

/**
 * Normalizes a semantic Depth of Field preset ('shallow' | 'medium' | 'deep').
 */
export function parseDofPreset(raw: unknown): DofPreset | undefined {
  if (raw === false) return 'deep';
  if (typeof raw !== 'string') return undefined;
  const norm = raw.trim().toLowerCase();
  if (
    norm === 'shallow' ||
    norm === 'narrow' ||
    norm === 'thin' ||
    norm === 'bokeh' ||
    norm === 'portrait'
  ) {
    return 'shallow';
  }
  if (norm === 'medium' || norm === 'normal' || norm === 'moderate') {
    return 'medium';
  }
  if (
    norm === 'deep' ||
    norm === 'infinite' ||
    norm === 'infinity' ||
    norm === 'off' ||
    norm === 'none' ||
    norm === 'crisp' ||
    norm === 'false'
  ) {
    return 'deep';
  }
  return undefined;
}

/**
 * Parses a lens aperture value such as `2.8`, `"f/2.8"`, `"f2.8"`, `"F/1.4"`, `"T2.0"`,
 * or a semantic DoF preset (`"shallow"`, `"medium"`, `"deep"`) into an effective f-stop N.
 */
export function parseApertureFStop(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return clampApertureFStop(raw);
  }
  if (typeof raw === 'string') {
    const preset = parseDofPreset(raw);
    if (preset !== undefined) {
      return presetToApertureFStop(preset);
    }
    const cleaned = raw
      .trim()
      .toLowerCase()
      .replace(/^[ft]\s*\/?\s*/, '')
      .trim();
    const num = parseFloat(cleaned);
    if (Number.isFinite(num) && num > 0) {
      return clampApertureFStop(num);
    }
  }
  return undefined;
}

/**
 * Parses a lens value such as `50`, `"50mm"`, `"35 mm"` into focal length in mm.
 */
export function parseLensFocalLengthMm(
  raw: unknown,
  fallbackMm = 50
): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clampFocalLengthMm(raw);
  }
  if (typeof raw === 'string') {
    const cleaned = raw.trim().toLowerCase().replace(/mm$/, '').trim();
    const num = parseFloat(cleaned);
    if (Number.isFinite(num)) {
      return clampFocalLengthMm(num);
    }
  }
  return fallbackMm;
}

/**
 * Parses an angle authored in human degrees (or explicit "...rad") into radians.
 */
export function parseAngleToRad(
  raw: unknown,
  fallbackRad?: number
): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return degToRad(raw);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.endsWith('rad')) {
      const val = parseFloat(trimmed.replace(/rad$/, '').trim());
      if (Number.isFinite(val)) return val;
    } else {
      const val = parseFloat(trimmed.replace(/deg|°$/, '').trim());
      if (Number.isFinite(val)) return degToRad(val);
    }
  }
  return fallbackRad;
}

export function normalizeCameraManeuver(raw: unknown): CameraManeuver {
  if (typeof raw !== 'string') return 'dolly';
  const norm = raw.trim().toLowerCase();
  if (norm === 'cut' || norm === 'static' || norm === 'hold') return 'cut';
  if (
    norm === 'dolly' ||
    norm === 'straight' ||
    norm === 'linear' ||
    norm === 'push' ||
    norm === 'pull'
  ) {
    return 'dolly';
  }
  if (norm === 'arc') return 'arc';
  if (norm === 'swoop') return 'swoop';
  if (norm === 'orbit' || norm === 'turntable') return 'orbit';
  if (norm === 'sweep' || norm === 'pan') return 'sweep';
  if (norm === 'spiral' || norm === 'corkscrew') return 'spiral';
  if (norm === 'dive' || norm === 'flyby') return 'dive';
  if (norm === 'recoil' || norm === 'punch') return 'recoil';
  if (norm === 'spline' || norm === 'path') return 'spline';
  return 'dolly';
}

export function normalizeCameraEasing(raw: unknown): CameraEasing {
  if (typeof raw !== 'string') return 'smooth';
  const norm = raw.trim().toLowerCase();
  if (norm === 'linear') return 'linear';
  if (norm === 'ease-in' || norm === 'easein') return 'ease-in';
  if (norm === 'ease-out' || norm === 'easeout') return 'ease-out';
  if (norm === 'expo') return 'expo';
  if (norm === 'pop' || norm === 'bounce') return 'pop';
  if (norm === 'accel' || norm === 'ramp-up') return 'accel';
  if (norm === 'deccel' || norm === 'decel' || norm === 'ramp-down') {
    return 'deccel';
  }
  if (norm === 'cruise' || norm === 'trapezoid') return 'cruise';
  return 'smooth';
}

export function normalizeEntityKind(raw: unknown): EntityKind {
  const rawKind = String(raw ?? 'character')
    .trim()
    .toLowerCase();
  if (
    rawKind === 'prop' ||
    rawKind === 'set' ||
    rawKind === 'furniture' ||
    rawKind === 'item' ||
    rawKind === 'object'
  ) {
    return 'prop';
  }
  if (rawKind === 'marker' || rawKind === 'spike' || rawKind === 'mark') {
    return 'marker';
  }
  return 'character';
}

export function normalizeEntityShape(
  kind: EntityKind,
  raw: unknown
): EntityShape | undefined {
  if (kind === 'prop') {
    if (!raw) return 'box';
    const s = String(raw).trim().toLowerCase();
    if (s === 'sphere' || s === 'ball') return 'sphere';
    if (s === 'cylinder' || s === 'column' || s === 'can' || s === 'cup') return 'cylinder';
    if (s === 'capsule' || s === 'pill') return 'capsule';
    return 'box';
  }
  if (kind === 'marker') {
    if (!raw) return 'x';
    const s = String(raw).trim().toLowerCase();
    if (s === 't' || s === 't-mark' || s === 't_mark') return 't';
    if (s === 'circle' || s === 'ring' || s === 'dot') return 'circle';
    if (s === 'puck' || s === 'disc' || s === 'cylinder') return 'puck';
    return 'x';
  }
  return undefined;
}

export function normalizeEntityStyle(
  kind: EntityKind,
  raw: unknown
): EntityStyle {
  if (kind === 'character') {
    if (!raw) return 'mannequin';
    const s = String(raw).trim().toLowerCase();
    if (s === 'edges' || s === 'hologram' || s === 'cad') return 'edges';
    if (s === 'silhouette' || s === 'ink' || s === 'flat') return 'silhouette';
    if (s === 'wireframe' || s === 'wire' || s === 'lines') return 'wireframe';
    return 'mannequin';
  }
  if (kind === 'prop') {
    if (!raw) return 'edges';
    const s = String(raw).trim().toLowerCase();
    if (s === 'glass' || s === 'ghost' || s === 'translucent') return 'glass';
    if (s === 'solid' || s === 'opaque' || s === 'matte') return 'solid';
    if (s === 'wireframe' || s === 'wire' || s === 'lines') return 'wireframe';
    return 'edges';
  }
  if (kind === 'marker') {
    if (!raw) return 'tape';
    const s = String(raw).trim().toLowerCase();
    if (s === 'glow' || s === 'pulse' || s === 'luminous') return 'glow';
    if (s === 'beacon' || s === 'puck' || s === 'pin' || s === 'stand') return 'beacon';
    return 'tape';
  }
  return 'mannequin';
}

export function resolveEntityIdentifier(
  rawId: string,
  entities: SceneEntityDef[]
): string {
  const trimmed = rawId.trim();
  const lower = trimmed.toLowerCase();
  const matched = entities.find(
    (e) => e.id.toLowerCase() === lower || e.label.toLowerCase() === lower
  );
  return matched ? matched.id : trimmed;
}

export function parseBlockingCues(
  rawBlocking: unknown,
  entities: SceneEntityDef[] = [],
  scoreContinuous?: boolean,
  missingStartBlockingCueIds?: string[]
): BlockingCueSpec[] | undefined {
  if (!Array.isArray(rawBlocking)) return undefined;
  const cues: BlockingCueSpec[] = [];
  let prevBlockEndSec = 0;

  rawBlocking.forEach((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const obj = item as Record<string, unknown>;
    const baseId = String(obj.id ?? `blocking-${idx + 1}`);
    const label =
      typeof (obj.label ?? obj.name) === 'string'
        ? String(obj.label ?? obj.name)
        : undefined;

    const rawStart = obj.start ?? obj._start;
    const rawEnd = obj.end ?? obj._end;
    const rawDuration = obj.duration ?? obj.dur;
    const hasExplicitStart =
      typeof rawStart === 'number' && Number.isFinite(rawStart);

    const rawContinuous = obj.continuous;
    const cueContinuous =
      typeof rawContinuous === 'boolean'
        ? rawContinuous
        : rawContinuous === 'true' || rawContinuous === 'yes'
        ? true
        : rawContinuous === 'false' || rawContinuous === 'no'
        ? false
        : undefined;
    const isContinuous = cueContinuous ?? scoreContinuous;

    const rawCut = obj.cut;
    const blockCut =
      typeof rawCut === 'boolean'
        ? rawCut
        : rawCut === 'true' || rawCut === 'yes'
        ? true
        : rawCut === 'false' || rawCut === 'no'
        ? false
        : undefined;

    if (
      obj.entities &&
      typeof obj.entities === 'object' &&
      !Array.isArray(obj.entities)
    ) {
      let startSec: number;
      if (hasExplicitStart) {
        startSec = Math.max(0, rawStart);
      } else if (isContinuous) {
        startSec = prevBlockEndSec;
      } else {
        startSec = 0;
        if (idx > 0 && missingStartBlockingCueIds) {
          missingStartBlockingCueIds.push(baseId);
        }
      }

      let endSec: number;
      if (typeof rawEnd === 'number' && Number.isFinite(rawEnd)) {
        endSec = Math.max(startSec + 0.016, rawEnd);
      } else if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
        endSec = Math.max(
          startSec + 0.016,
          startSec + Math.max(0.016, rawDuration)
        );
      } else {
        endSec = startSec + 5.0;
      }

      prevBlockEndSec = Math.max(prevBlockEndSec, endSec);

      for (const [entKey, rawOv] of Object.entries(
        obj.entities as Record<string, unknown>
      )) {
        if (!rawOv || typeof rawOv !== 'object' || Array.isArray(rawOv)) {
          continue;
        }
        const ov = rawOv as Record<string, unknown>;
        const entityId = resolveEntityIdentifier(entKey, entities);
        const baseDef = entities.find(
          (e) => e.id.toLowerCase() === entityId.toLowerCase()
        );
        const dimOverrides = parseEntityCueDimensionOverrides(ov, baseDef);

        const rawOvCut = ov.cut ?? blockCut;
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
            : cueContinuous;

        cues.push({
          id: `${baseId}:${entityId}`,
          label,
          entityId,
          startSec,
          endSec,
          duration: endSec - startSec,
          fromPosition: ov.from_position
            ? parseVec3(ov.from_position)
            : ov.from
            ? parseVec3(ov.from)
            : undefined,
          position: ov.position ? parseVec3(ov.position) : undefined,
          rotationYRad: parseAngleToRad(ov.rotation ?? ov.yaw),
          lookAt: parseTargetOrVec3(ov.look_at ?? ov.lookAt),
          ...dimOverrides,
          easing: normalizeCameraEasing(ov.easing ?? obj.easing),
          highlighted:
            ov.highlighted !== undefined || ov.highlight !== undefined
              ? Boolean(ov.highlighted ?? ov.highlight)
              : undefined,
          visible: typeof ov.visible === 'boolean' ? ov.visible : undefined,
          note:
            typeof (ov.note ?? ov.description) === 'string'
              ? String(ov.note ?? ov.description)
              : undefined,
          cut: isCut,
          continuous: ovContinuous,
        });
      }
      return;
    }

    const rawEntity =
      obj.entity ?? obj.entity_id ?? obj.entityId ?? obj.actor ?? obj.subject;
    if (typeof rawEntity === 'string' && rawEntity.trim().length > 0) {
      const entityId = resolveEntityIdentifier(rawEntity, entities);
      const baseDef = entities.find(
        (e) => e.id.toLowerCase() === entityId.toLowerCase()
      );
      const dimOverrides = parseEntityCueDimensionOverrides(obj, baseDef);

      let startSec: number;
      if (hasExplicitStart) {
        startSec = Math.max(0, rawStart);
      } else if (isContinuous) {
        startSec = prevBlockEndSec;
      } else {
        startSec = 0;
        if (idx > 0 && missingStartBlockingCueIds) {
          missingStartBlockingCueIds.push(baseId);
        }
      }

      let endSec: number;
      if (typeof rawEnd === 'number' && Number.isFinite(rawEnd)) {
        endSec = Math.max(startSec + 0.016, rawEnd);
      } else if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
        endSec = Math.max(
          startSec + 0.016,
          startSec + Math.max(0.016, rawDuration)
        );
      } else {
        endSec = startSec + 5.0;
      }

      prevBlockEndSec = Math.max(prevBlockEndSec, endSec);

      cues.push({
        id: baseId,
        label,
        entityId,
        startSec,
        endSec,
        duration: endSec - startSec,
        fromPosition: obj.from_position
          ? parseVec3(obj.from_position)
          : obj.from
          ? parseVec3(obj.from)
          : undefined,
        position: obj.position ? parseVec3(obj.position) : undefined,
        rotationYRad: parseAngleToRad(obj.rotation ?? obj.yaw),
        lookAt: parseTargetOrVec3(obj.look_at ?? obj.lookAt),
        ...dimOverrides,
        easing: normalizeCameraEasing(obj.easing),
        highlighted:
          obj.highlighted !== undefined || obj.highlight !== undefined
            ? Boolean(obj.highlighted ?? obj.highlight)
            : undefined,
        visible: typeof obj.visible === 'boolean' ? obj.visible : undefined,
        note:
          typeof (obj.note ?? obj.description) === 'string'
            ? String(obj.note ?? obj.description)
            : undefined,
        cut: blockCut,
        continuous: cueContinuous,
      });
    }
  });

  return cues.length > 0 ? cues : undefined;
}

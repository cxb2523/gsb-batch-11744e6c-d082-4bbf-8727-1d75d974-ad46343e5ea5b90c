/**
 * Frustum Cone & Focus Plane Diagnostics (pure, deterministic).
 *
 * Mirrors the imperative `syncFrustumAndFocus` math inside StageCameraRig.tsx
 * as a pure function over a plain-data snapshot, so users and tests can verify
 * exactly where the frustum cone and focus plane land at a given moment.
 *
 * Constraints:
 *   - No three.js imports, no window/document access, no disk I/O.
 *   - Output is always JSON-serializable plain data (non-finite numbers are
 *     sanitized to `null` and reported via `degradedFields`).
 *   - Gate dimensions come directly from computeFrustumGateDimensions —
 *     no duplicated optical formulas here.
 */

import { computeFrustumGateDimensions } from '../core/opticsMath';

/**
 * Plain-data Depth-of-Field snapshot. Every field is optional to tolerate
 * partially populated dof states.
 */
export interface StageCamDofSnapshot {
  enabled?: boolean;
  hasExplicitFocus?: boolean;
  focusDistanceM?: number;
  nearLimitM?: number;
  farLimitM?: number;
  apertureFStop?: number;
}

/**
 * Plain-data snapshot of the stage camera state consumed by the diagnostics.
 */
export interface StageCamSnapshot {
  frustumDepth: number;
  focalLengthMm: number;
  aspectRatio: number;
  maneuver: string;
  frustumColor: string;
  dof?: StageCamDofSnapshot;
}

/** Where a depth value originated from. */
export type StageCamDepthSource = 'dof-focus' | 'frustum-depth-fallback' | 'frustum-depth';

export interface StageCamGateDiagnostics {
  gateWidth: number | null;
  gateHeight: number | null;
  halfWidth: number | null;
  halfHeight: number | null;
}

export interface StageCamCheckItem {
  name: string;
  passed: boolean;
  /** Human-readable reason, present only when the check failed. */
  reason?: string;
}

export type StageCamDiagnosticsStatus = 'ok' | 'degraded' | 'no-camera';

export interface StageCamDiagnostics {
  /** False only when no camera snapshot was available at all. */
  available: boolean;
  status: StageCamDiagnosticsStatus;
  /** Human-readable reason when status is 'no-camera'. */
  unavailableReason: string | null;

  frustumColor: string | null;

  focusDepth: number | null;
  focusDepthSource: StageCamDepthSource | null;
  coneDepth: number | null;
  coneDepthSource: StageCamDepthSource | null;

  coneGate: StageCamGateDiagnostics | null;
  focusGate: StageCamGateDiagnostics | null;

  /** Mirrors frustumGroup.scale.set(halfWidth, halfHeight, coneDepth). */
  frustumGroupScale: [number | null, number | null, number | null] | null;
  /** Mirrors focusPlaneGroup.scale.set(halfWidth, halfHeight, 1). */
  focusPlaneGroupScale: [number | null, number | null, number | null] | null;
  /** Mirrors focusPlaneGroup.position.z. */
  focusPlaneGroupZ: number | null;
  /** Mirrors targetRing.position.z. */
  targetRingZ: number | null;

  /** Lens badge label, e.g. "50mm · DOLLY". */
  lensLabel: string | null;

  /** True when any input sanity check failed (degraded result). */
  degraded: boolean;
  /** Dot-paths of input/output fields affected by degradation. */
  degradedFields: string[];

  /** Ordered consistency & sanity checks. */
  checks: StageCamCheckItem[];
}

const NO_CAMERA_REASON =
  'No usable stage camera: the provided frame is missing stageCamera data.';

function sanitizeNumber(
  value: number,
  fieldPath: string,
  degradedFields: string[]
): number | null {
  if (Number.isFinite(value)) {
    return value;
  }
  if (!degradedFields.includes(fieldPath)) {
    degradedFields.push(fieldPath);
  }
  return null;
}

function sanitizeGate(
  gate: { gateWidth: number; gateHeight: number; halfWidth: number; halfHeight: number },
  prefix: string,
  degradedFields: string[]
): StageCamGateDiagnostics {
  return {
    gateWidth: sanitizeNumber(gate.gateWidth, `${prefix}.gateWidth`, degradedFields),
    gateHeight: sanitizeNumber(gate.gateHeight, `${prefix}.gateHeight`, degradedFields),
    halfWidth: sanitizeNumber(gate.halfWidth, `${prefix}.halfWidth`, degradedFields),
    halfHeight: sanitizeNumber(gate.halfHeight, `${prefix}.halfHeight`, degradedFields),
  };
}

/**
 * Computes the frustum cone & focus plane diagnostics for one stage camera
 * snapshot. Never throws on degenerate numeric input — returns a degraded
 * result with human-readable reasons instead.
 */
export function diagnoseStageCam(
  snapshot?: StageCamSnapshot | null
): StageCamDiagnostics {
  if (!snapshot) {
    return {
      available: false,
      status: 'no-camera',
      unavailableReason: NO_CAMERA_REASON,
      frustumColor: null,
      focusDepth: null,
      focusDepthSource: null,
      coneDepth: null,
      coneDepthSource: null,
      coneGate: null,
      focusGate: null,
      frustumGroupScale: null,
      focusPlaneGroupScale: null,
      focusPlaneGroupZ: null,
      targetRingZ: null,
      lensLabel: null,
      degraded: false,
      degradedFields: [],
      checks: [
        {
          name: 'camera-available',
          passed: false,
          reason: NO_CAMERA_REASON,
        },
      ],
    };
  }

  const degradedFields: string[] = [];
  const checks: StageCamCheckItem[] = [];
  const pushCheck = (name: string, passed: boolean, reason?: string) => {
    checks.push(passed ? { name, passed } : { name, passed, reason });
  };

  const { frustumDepth, focalLengthMm, aspectRatio, maneuver, frustumColor } =
    snapshot;
  const dof = snapshot.dof;

  // --- Input sanity (degradation triggers, never throw) ---
  const frustumDepthValid =
    Number.isFinite(frustumDepth) && frustumDepth > 0;
  if (!frustumDepthValid && !degradedFields.includes('frustumDepth')) {
    degradedFields.push('frustumDepth');
  }
  pushCheck(
    'frustumDepth-positive',
    frustumDepthValid,
    `frustumDepth must be a positive finite number, got ${String(frustumDepth)}.`
  );

  const focalLengthValid = Number.isFinite(focalLengthMm);
  if (!focalLengthValid && !degradedFields.includes('focalLengthMm')) {
    degradedFields.push('focalLengthMm');
  }
  pushCheck(
    'focalLengthMm-finite',
    focalLengthValid,
    `focalLengthMm must be finite, got ${String(focalLengthMm)}.`
  );

  // --- Mirror syncFrustumAndFocus focus-depth selection exactly ---
  const useDofFocus = Boolean(dof && (dof.hasExplicitFocus || dof.enabled));
  const rawDofFocusDistance = dof?.focusDistanceM;
  const dofFocusValid = !useDofFocus || Number.isFinite(rawDofFocusDistance);
  if (!dofFocusValid && !degradedFields.includes('dof.focusDistanceM')) {
    degradedFields.push('dof.focusDistanceM');
  }
  pushCheck(
    'dof-focusDistance-finite',
    dofFocusValid,
    `dof.focusDistanceM must be finite when DoF focus is active, got ${String(
      rawDofFocusDistance
    )}.`
  );

  const focusDepth = useDofFocus
    ? (rawDofFocusDistance as number)
    : frustumDepth;
  const focusDepthSource: StageCamDepthSource = useDofFocus
    ? 'dof-focus'
    : 'frustum-depth-fallback';
  const coneDepth = Math.max(frustumDepth, focusDepth);
  const coneDepthSource: StageCamDepthSource =
    useDofFocus && focusDepth > frustumDepth ? 'dof-focus' : 'frustum-depth';

  // --- Gate dimensions straight from the shared optics module ---
  const coneGateRaw = computeFrustumGateDimensions(
    focalLengthMm,
    coneDepth,
    aspectRatio
  );
  const focusGateRaw = computeFrustumGateDimensions(
    focalLengthMm,
    focusDepth,
    aspectRatio
  );

  const coneGate = sanitizeGate(coneGateRaw, 'coneGate', degradedFields);
  const focusGate = sanitizeGate(focusGateRaw, 'focusGate', degradedFields);

  // --- Mirror the imperative scale/position writes ---
  const focusDepthOut = sanitizeNumber(focusDepth, 'focusDepth', degradedFields);
  const coneDepthOut = sanitizeNumber(coneDepth, 'coneDepth', degradedFields);
  const frustumGroupScale: [number | null, number | null, number | null] = [
    coneGate.halfWidth,
    coneGate.halfHeight,
    coneDepthOut,
  ];
  const focusPlaneGroupScale: [number | null, number | null, number | null] = [
    focusGate.halfWidth,
    focusGate.halfHeight,
    1,
  ];
  const focusPlaneGroupZ = focusDepthOut;
  const targetRingZ = focusDepthOut;

  const lensLabel = `${Math.round(focalLengthMm)}mm · ${String(
    maneuver ?? ''
  ).toUpperCase()}`;

  // --- Ordered consistency checks against the rig's invariants ---
  pushCheck(
    'coneDepth-covers-frustumDepth',
    coneDepth >= frustumDepth,
    `coneDepth (${String(coneDepth)}) must not be smaller than frustumDepth (${String(
      frustumDepth
    )}).`
  );

  pushCheck(
    'focusDepth-positive',
    Number.isFinite(focusDepth) && focusDepth > 0,
    `focusDepth must be a positive finite number, got ${String(focusDepth)}.`
  );

  pushCheck(
    'frustumGroup-scaleZ-equals-coneDepth',
    frustumGroupScale[2] === coneDepthOut,
    `frustumGroup scale z (${String(
      frustumGroupScale[2]
    )}) must equal coneDepth (${String(coneDepth)}).`
  );

  pushCheck(
    'focusPlane-z-equals-focusDepth',
    focusPlaneGroupZ === focusDepthOut,
    `focusPlaneGroup z (${String(
      focusPlaneGroupZ
    )}) must equal focusDepth (${String(focusDepth)}).`
  );

  pushCheck(
    'targetRing-z-equals-focusDepth',
    targetRingZ === focusDepthOut,
    `targetRing z (${String(targetRingZ)}) must equal focusDepth (${String(
      focusDepth
    )}).`
  );

  const dofInactive = !dof || (!dof.hasExplicitFocus && !dof.enabled);
  pushCheck(
    'focusDepth-fallback-source',
    dofInactive
      ? focusDepth === frustumDepth &&
          focusDepthSource === 'frustum-depth-fallback'
      : focusDepthSource === 'dof-focus',
    dofInactive
      ? `DoF is missing/inactive with no explicit focus: focusDepth must fall back to frustumDepth (${String(
          frustumDepth
        )}) with source 'frustum-depth-fallback', got ${String(
          focusDepth
        )} from '${focusDepthSource}'.`
      : `DoF focus is active: focusDepthSource must be 'dof-focus', got '${focusDepthSource}'.`
  );

  const degraded = degradedFields.length > 0;

  return {
    available: true,
    status: degraded ? 'degraded' : 'ok',
    unavailableReason: null,
    frustumColor: frustumColor ?? null,
    focusDepth: focusDepthOut,
    focusDepthSource,
    coneDepth: coneDepthOut,
    coneDepthSource,
    coneGate,
    focusGate,
    frustumGroupScale,
    focusPlaneGroupScale,
    focusPlaneGroupZ,
    targetRingZ,
    lensLabel,
    degraded,
    degradedFields,
    checks,
  };
}

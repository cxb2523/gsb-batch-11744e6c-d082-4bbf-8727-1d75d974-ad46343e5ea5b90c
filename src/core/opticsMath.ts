/**
 * Pure optical calculations converting directorial lens focal length (mm)
 * and film gate aspect ratio into Three.js vertical FOV (degrees) and
 * rectangular 3D frustum gate dimensions.
 */

import type { DofPreset, Vec3 } from './types';
import {
  CAMERA_LIMITS,
  DEFAULT_ASPECT_RATIO,
  FULL_FRAME_SENSOR_WIDTH_MM,
  OPTICS_DOF_DEFAULTS,
  RAD_TO_DEG,
  VIEWFINDER_GATE_SCALE,
} from './constants';

/**
 * Clamps a focal length in mm to valid optical bounds.
 */
export function clampFocalLengthMm(focalLengthMm: number): number {
  if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) {
    return 50;
  }
  return Math.max(
    CAMERA_LIMITS.MIN_FOCAL_LENGTH_MM,
    Math.min(CAMERA_LIMITS.MAX_FOCAL_LENGTH_MM, focalLengthMm)
  );
}

/**
 * Parses aspect ratio strings like "16:9", "2.39:1", "2.35:1", "4:3", "9:16"
 * or numeric floats into a positive aspect ratio (width / height).
 */
export function parseAspectRatio(raw?: string | number | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0.1) {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map((p) => parseFloat(p.trim()));
      if (
        parts.length === 2 &&
        Number.isFinite(parts[0]) &&
        Number.isFinite(parts[1]) &&
        parts[0] > 0 &&
        parts[1] > 0
      ) {
        return parts[0] / parts[1];
      }
    }
    const num = parseFloat(trimmed);
    if (Number.isFinite(num) && num > 0.1) {
      return num;
    }
  }
  return DEFAULT_ASPECT_RATIO;
}

/**
 * Converts a full-frame equivalent lens focal length (in mm) and gate aspect ratio
 * into a Three.js vertical Field of View (FOV in degrees).
 *
 * Formula:
 *   sensorHeight = sensorWidth / aspectRatio
 *   fovVertDeg = 2 * atan(sensorHeight / (2 * focalLength)) * (180 / PI)
 */
export function focalLengthToVerticalFovDeg(
  focalLengthMm: number,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  sensorWidthMm = FULL_FRAME_SENSOR_WIDTH_MM
): number {
  const f = clampFocalLengthMm(focalLengthMm);
  const safeAspect = aspectRatio > 0.1 ? aspectRatio : DEFAULT_ASPECT_RATIO;
  const sensorHeightMm = sensorWidthMm / safeAspect;
  const fovRad = 2 * Math.atan(sensorHeightMm / (2 * f));
  return fovRad * RAD_TO_DEG;
}

/**
 * Converts a Three.js vertical FOV (in degrees) back into an equivalent
 * full-frame focal length (in mm).
 */
export function verticalFovDegToFocalLengthMm(
  fovDeg: number,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  sensorWidthMm = FULL_FRAME_SENSOR_WIDTH_MM
): number {
  const safeFovDeg = Math.max(5, Math.min(150, fovDeg));
  const safeAspect = aspectRatio > 0.1 ? aspectRatio : DEFAULT_ASPECT_RATIO;
  const sensorHeightMm = sensorWidthMm / safeAspect;
  const halfFovRad = (safeFovDeg * 0.5) / RAD_TO_DEG;
  const f = sensorHeightMm / (2 * Math.tan(halfFovRad));
  return clampFocalLengthMm(f);
}

/**
 * Computes the physical width and height (in meters) of the rectangular camera film gate
 * projected at a distance `depthMeters` from the lens nodal point.
 */
export function computeFrustumGateDimensions(
  focalLengthMm: number,
  depthMeters: number,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  sensorWidthMm = FULL_FRAME_SENSOR_WIDTH_MM
): {
  gateWidth: number;
  gateHeight: number;
  halfWidth: number;
  halfHeight: number;
} {
  const f = clampFocalLengthMm(focalLengthMm);
  const safeDepth = Math.max(0.1, depthMeters);
  const safeAspect = aspectRatio > 0.1 ? aspectRatio : DEFAULT_ASPECT_RATIO;
  const sensorHeightMm = sensorWidthMm / safeAspect;

  const gateWidth = safeDepth * (sensorWidthMm / f);
  const gateHeight = safeDepth * (sensorHeightMm / f);

  return {
    gateWidth,
    gateHeight,
    halfWidth: gateWidth * 0.5,
    halfHeight: gateHeight * 0.5,
  };
}

/**
 * Computes the pixel width and height of a film gate of `gateAspect` contained within
 * a viewport of `(containerWidth, containerHeight)` scaled by `gateScale`.
 */
export function computeContainedGateDimensionsPx(
  containerWidth: number,
  containerHeight: number,
  gateAspect = DEFAULT_ASPECT_RATIO,
  gateScale = VIEWFINDER_GATE_SCALE
): { width: number; height: number } {
  const safeW = Math.max(1, containerWidth);
  const safeH = Math.max(1, containerHeight);
  const safeAspect = gateAspect > 0.1 ? gateAspect : DEFAULT_ASPECT_RATIO;
  const availW = safeW * gateScale;
  const availH = safeH * gateScale;

  if (availW / availH > safeAspect) {
    return {
      width: availH * safeAspect,
      height: availH,
    };
  }
  return {
    width: availW,
    height: availW / safeAspect,
  };
}

/**
 * Computes the compensated Three.js PerspectiveCamera vertical FOV (in degrees)
 * for the full canvas so that the vertical and horizontal FOV inside the contained
 * active film gate matches `gateFovDeg` and `gateAspect` across any viewport aspect ratio.
 */
export function computeViewfinderCanvasFovDeg(
  gateFovDeg: number,
  canvasWidth: number,
  canvasHeight: number,
  gateAspect = DEFAULT_ASPECT_RATIO,
  gateScale = VIEWFINDER_GATE_SCALE
): number {
  const safeGateFov = Math.max(1, Math.min(160, gateFovDeg));
  const { height: gateHeight } = computeContainedGateDimensionsPx(
    canvasWidth,
    canvasHeight,
    gateAspect,
    gateScale
  );
  const safeCanvasH = Math.max(1, canvasHeight);
  const heightRatio = safeCanvasH / Math.max(1, gateHeight);
  const halfGateFovRad = (safeGateFov * 0.5) / RAD_TO_DEG;
  const canvasFovRad = 2 * Math.atan(heightRatio * Math.tan(halfGateFovRad));
  return Math.max(1, Math.min(165, canvasFovRad * RAD_TO_DEG));
}

/**
 * Computes an adaptive vertical FOV for the 3D diorama canvas so that the horizontal
 * stage framing visible at `baselineAspect` (default 16:9) is never cropped when the
 * canvas aspect ratio drops below baseline in split workspace layouts (Approach A).
 */
export function computeAdaptiveDioramaFovDeg(
  baseFovDeg: number,
  canvasWidth: number,
  canvasHeight: number,
  baselineAspect = DEFAULT_ASPECT_RATIO
): number {
  const safeBaseFov = Math.max(5, Math.min(140, baseFovDeg));
  const safeW = Math.max(1, canvasWidth);
  const safeH = Math.max(1, canvasHeight);
  const currentAspect = safeW / safeH;
  const safeBaseline = baselineAspect > 0.1 ? baselineAspect : DEFAULT_ASPECT_RATIO;

  // When canvas is as wide or wider than baseline 16:9, preserve base vertical FOV
  if (currentAspect >= safeBaseline) {
    return safeBaseFov;
  }

  // When canvas is narrower than baseline (e.g. 50/50 split ~1:1), widen vertical FOV
  // proportionally so that horizontal FOV matches baselineAspect coverage
  const halfBaseFovRad = (safeBaseFov * 0.5) / RAD_TO_DEG;
  const adaptedHalfFovRad = Math.atan(
    (safeBaseline / currentAspect) * Math.tan(halfBaseFovRad)
  );
  return Math.max(5, Math.min(140, 2 * adaptedHalfFovRad * RAD_TO_DEG));
}

/**
 * Clamps a numeric lens aperture f-stop (N) to valid optical bounds [0.7, 64.0].
 * Non-finite or non-positive values represent infinite Depth of Field (Infinity).
 */
export function clampApertureFStop(fStop: number): number {
  if (!Number.isFinite(fStop) || fStop <= 0) {
    return Infinity;
  }
  return Math.max(
    OPTICS_DOF_DEFAULTS.MIN_F_STOP,
    Math.min(OPTICS_DOF_DEFAULTS.MAX_F_STOP, fStop)
  );
}

/**
 * Maps a semantic DoF preset ('shallow' | 'medium' | 'deep') to its canonical f-stop.
 */
export function presetToApertureFStop(preset?: DofPreset): number {
  if (preset === 'shallow') return OPTICS_DOF_DEFAULTS.PRESET_F_STOPS.shallow;
  if (preset === 'medium') return OPTICS_DOF_DEFAULTS.PRESET_F_STOPS.medium;
  return Infinity;
}

/**
 * Classifies an effective aperture f-stop into a semantic DoF preset.
 */
export function apertureFStopToPreset(fStop: number): DofPreset {
  if (!Number.isFinite(fStop) || fStop <= 0 || fStop >= 11) {
    return 'deep';
  }
  if (fStop <= 3.5) {
    return 'shallow';
  }
  return 'medium';
}

/**
 * Formats a lens aperture f-number for directorial UI display.
 * Rounds to 1 decimal place and strips trailing .0 (e.g. 2.8 -> "f/2.8", 11 -> "f/11", 2.5664 -> "f/2.6").
 */
export function formatApertureFStop(fStop: number): string {
  if (!Number.isFinite(fStop) || fStop <= 0) {
    return 'f/∞';
  }
  const rounded = fStop.toFixed(1).replace(/\.0$/, '');
  return `f/${rounded}`;
}

/**
 * Computes the exact focus plane distance d_focus (in meters) by projecting
 * (focusPoint - eye) orthogonally onto the unit optical sightline vector F = (lookTarget - eye) / ||lookTarget - eye||.
 * Eliminates the off-axis cosine overshoot of Euclidean distance.
 */
export function computeProjectedFocusDistanceM(
  eye: Vec3,
  lookTarget: Vec3,
  focusPoint: Vec3
): number {
  const dx = lookTarget.x - eye.x;
  const dy = lookTarget.y - eye.y;
  const dz = lookTarget.z - eye.z;
  const lookDist = Math.hypot(dx, dy, dz);

  if (lookDist < 1e-6) {
    const radial = Math.hypot(
      focusPoint.x - eye.x,
      focusPoint.y - eye.y,
      focusPoint.z - eye.z
    );
    return Math.max(
      CAMERA_LIMITS.MIN_DISTANCE_M,
      Math.min(CAMERA_LIMITS.MAX_DISTANCE_M, radial)
    );
  }

  const fx = dx / lookDist;
  const fy = dy / lookDist;
  const fz = dz / lookDist;

  const proj =
    (focusPoint.x - eye.x) * fx +
    (focusPoint.y - eye.y) * fy +
    (focusPoint.z - eye.z) * fz;

  return Math.max(
    CAMERA_LIMITS.MIN_DISTANCE_M,
    Math.min(CAMERA_LIMITS.MAX_DISTANCE_M, proj)
  );
}

/**
 * Computes Gaussian thin-lens Depth of Field (DoF) boundaries in meters:
 *   f = focalLengthMm / 1000
 *   c = cocMm / 1000
 *   H = f^2 / (N * c) + f
 *   D_near = ((H - f) * d) / (H + d - 2f)
 *   D_far  = d < H ? ((H - f) * d) / (H - d) : Infinity
 */
export function computeDepthOfFieldLimits(
  focalLengthMm: number,
  focusDistanceM: number,
  apertureFStop: number,
  cocMm = OPTICS_DOF_DEFAULTS.COC_MM
): {
  enabled: boolean;
  apertureFStop: number;
  hyperfocalDistanceM: number;
  nearLimitM: number;
  farLimitM: number;
  depthOfFieldM: number;
} {
  const d = Math.max(
    CAMERA_LIMITS.MIN_DISTANCE_M,
    Math.min(
      CAMERA_LIMITS.MAX_DISTANCE_M,
      Number.isFinite(focusDistanceM) ? focusDistanceM : 3.0
    )
  );

  if (!Number.isFinite(apertureFStop) || apertureFStop <= 0) {
    return {
      enabled: false,
      apertureFStop: Infinity,
      hyperfocalDistanceM: Infinity,
      nearLimitM: 0,
      farLimitM: Infinity,
      depthOfFieldM: Infinity,
    };
  }

  const N = clampApertureFStop(apertureFStop);
  const f = clampFocalLengthMm(focalLengthMm) / 1000;
  const c = Math.max(1e-6, cocMm / 1000);

  const H = (f * f) / (N * c) + f;
  const nearLimitM = Math.max(0.05, ((H - f) * d) / Math.max(1e-6, H + d - 2 * f));
  const farLimitM = d < H ? ((H - f) * d) / (H - d) : Infinity;
  const depthOfFieldM = Number.isFinite(farLimitM)
    ? Math.max(0, farLimitM - nearLimitM)
    : Infinity;

  return {
    enabled: true,
    apertureFStop: N,
    hyperfocalDistanceM: H,
    nearLimitM,
    farLimitM,
    depthOfFieldM,
  };
}

/**
 * Computes the physical Circle of Confusion blur radius normalized by sensor height
 * for a pixel at view-space depth `depthM`:
 *   beta(z) = min(MAX_BLUR_FRACTION, (f_mm^2 / (N * H_sensor * (1000*d - f_mm))) * |z - d| / z)
 */
export function computeNormalizedBlurCircleFraction(
  depthM: number,
  focalLengthMm: number,
  focusDistanceM: number,
  apertureFStop: number,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  sensorWidthMm = FULL_FRAME_SENSOR_WIDTH_MM
): number {
  if (!Number.isFinite(apertureFStop) || apertureFStop <= 0) {
    return 0;
  }
  const z = Math.max(0.1, depthM);
  const d = Math.max(CAMERA_LIMITS.MIN_DISTANCE_M, focusDistanceM);
  const fMm = clampFocalLengthMm(focalLengthMm);
  const N = clampApertureFStop(apertureFStop);
  const safeAspect = aspectRatio > 0.1 ? aspectRatio : DEFAULT_ASPECT_RATIO;
  const sensorHeightMm = sensorWidthMm / safeAspect;

  const dMm = d * 1000;
  const denom = N * sensorHeightMm * Math.max(1, dMm - fMm);
  const blur = ((fMm * fMm) / denom) * (Math.abs(z - d) / z);
  return Math.min(OPTICS_DOF_DEFAULTS.MAX_BLUR_FRACTION, Math.max(0, blur));
}

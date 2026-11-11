/**
 * Centralized Single Source of Truth (SSOT) for metric spatial bounds,
 * standard cinema lens focal lengths, and blueprint color tokens.
 */

import type { SphericalPose } from './types';

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

/**
 * Standard 35mm Full-Frame horizontal sensor gate width in millimeters (36mm x 24mm).
 */
export const FULL_FRAME_SENSOR_WIDTH_MM = 36.0;

/**
 * Standard widescreen 16:9 aspect ratio.
 */
export const DEFAULT_ASPECT_RATIO = 16 / 9;

/**
 * Proportion of the diorama viewport occupied by the active film gate in Stage Cam POV,
 * leaving a minimum 8% Look-Around margin on all sides for off-frame staging & HUD chrome.
 */
export const VIEWFINDER_GATE_SCALE = 0.84;

/**
 * Metric camera and pitch boundaries.
 */
export const CAMERA_LIMITS = {
  MIN_PITCH_RAD: -85 * DEG_TO_RAD,
  MAX_PITCH_RAD: 85 * DEG_TO_RAD,
  MIN_DISTANCE_M: 0.4,
  MAX_DISTANCE_M: 100.0,
  MIN_FOCAL_LENGTH_MM: 12,
  MAX_FOCAL_LENGTH_MM: 200,
} as const;

/**
 * Standard 35mm full-frame permissible Circle of Confusion (CoC) diameter in millimeters (0.030mm)
 * and meters (3.0e-5m), plus canonical f-stop mappings for semantic DoF presets.
 */
export const OPTICS_DOF_DEFAULTS = {
  COC_MM: 0.03,
  COC_M: 0.00003,
  PRESET_F_STOPS: {
    shallow: 2.8,
    medium: 5.6,
    deep: Infinity,
  },
  MIN_F_STOP: 0.7,
  MAX_F_STOP: 64.0,
  MAX_VISUAL_FAR_EXTENSION_M: 6.0,
  MAX_BLUR_FRACTION: 0.022,
} as const;

/**
 * Default Observer Camera pose (elevated 3/4 architectural overview in meters).
 */
export const DEFAULT_OBSERVER_POSE: SphericalPose = {
  target: { x: 0, y: 1.0, z: 0 },
  distance: 7.5,
  pitch: 26 * DEG_TO_RAD,
  yaw: 38 * DEG_TO_RAD,
  roll: 0,
  focalLengthMm: 35,
};

/**
 * Default Stage Camera pose (eye-level 50mm standard prime).
 */
export const DEFAULT_STAGE_CAMERA_POSE: SphericalPose = {
  target: { x: 0, y: 1.2, z: 0 },
  distance: 3.2,
  pitch: 6 * DEG_TO_RAD,
  yaw: -25 * DEG_TO_RAD,
  roll: 0,
  focalLengthMm: 50,
};

/**
 * Default Entity dimensions in meters.
 */
export const ENTITY_DEFAULTS = {
  CHARACTER_HEIGHT_M: 1.75,
  CHARACTER_WIDTH_M: 0.52,
  CHARACTER_DEPTH_M: 0.52,
  CHARACTER_RADIUS_M: 0.26,
  CHARACTER_LOOK_ANCHOR_RATIO: 0.9, // Eye-level target height ratio (~1.575m for standard 1.75m character)
  PROP_HEIGHT_M: 0.85,
  PROP_WIDTH_M: 0.70,
  PROP_DEPTH_M: 0.70,
  PROP_RADIUS_M: 0.35,
  MARKER_HEIGHT_M: 0.15,
  MARKER_WIDTH_M: 0.50,
  MARKER_DEPTH_M: 0.50,
  MARKER_RADIUS_M: 0.25,
} as const;

/**
 * Minimalist Blueprint Palette tokens.
 */
export const BLUEPRINT_PALETTE = {
  background: '#050811',
  gridMajor: '#1e293b',
  gridMinor: '#0f172a',
  stageCamera: '#f59e0b',
  frustumDefault: '#f59e0b',
  focusTether: '#10b981',
  observerAccent: '#38bdf8',
  characterPrimary: '#38bdf8',
  characterSecondary: '#a78bfa',
  characterTertiary: '#34d399',
  propDefault: '#94a3b8',
  markerDefault: '#fb7185',
} as const;

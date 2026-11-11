/**
 * Directorial Camera Presets for the 3D Diorama.
 * Pure math & angle configurations for rapid viewpoint snaps:
 *   - Top (Plan View): 84° pitch, 0° yaw, 14m distance (blueprint blocking & 180° axis verification)
 *   - Iso (Three-Quarter): 35.264° pitch, 45° yaw, 10m distance (spatial diorama elevation)
 *   - Front (Proscenium): 12° pitch, 0° yaw, 8m distance (downstage looking upstage)
 *   - Side (Profile): 15° pitch, 90° yaw, 9m distance (cross-line profile)
 *   - Reset: snaps to active shot's scripted observer transform
 */

import { degToRad, sphericalToCartesian } from '../core/sphericalMath';
import type { CameraTransform3D, SphericalPose, Vec3 } from '../core/types';

export type CameraPresetType = 'top' | 'iso' | 'front' | 'side' | 'reset';

export interface CameraPresetConfig {
  label: string;
  shortLabel: string;
  description: string;
  pitchDeg: number;
  yawDeg: number;
  distanceM: number;
  target: [number, number, number];
}

export const DIORAMA_CAMERA_PRESETS: Record<
  Exclude<CameraPresetType, 'reset'>,
  CameraPresetConfig
> = {
  top: {
    label: 'Top (Plan)',
    shortLabel: 'Top',
    description: 'Top-down plan view for spatial blocking and 180° line-of-action inspection',
    pitchDeg: 84,
    yawDeg: 0,
    distanceM: 14,
    target: [0, 1.1, 0],
  },
  iso: {
    label: 'Isometric',
    shortLabel: 'Iso',
    description: 'Three-quarter 45° diorama perspective for spatial height and depth',
    pitchDeg: 35.264,
    yawDeg: 45,
    distanceM: 10,
    target: [0, 1.1, 0],
  },
  front: {
    label: 'Front (Proscenium)',
    shortLabel: 'Front',
    description: 'Downstage looking upstage front proscenium view',
    pitchDeg: 12,
    yawDeg: 0,
    distanceM: 8,
    target: [0, 1.1, 0],
  },
  side: {
    label: 'Side (Profile)',
    shortLabel: 'Side',
    description: 'Cross-line side profile view across the stage',
    pitchDeg: 15,
    yawDeg: 90,
    distanceM: 9,
    target: [0, 1.1, 0],
  },
};

/**
 * Computes a world-space CameraTransform3D from a preset type.
 * Preserves the user's active look-at target (Blender Numpad 7/1/3 style)
 * when `activeTarget` is provided.
 */
export function getPresetTransform(
  preset: Exclude<CameraPresetType, 'reset'>,
  activeTarget?: Vec3,
  focalLengthMm = 35,
  aspectRatio = 16 / 9
): CameraTransform3D {
  const config = DIORAMA_CAMERA_PRESETS[preset];
  const target: Vec3 = activeTarget
    ? { x: activeTarget.x, y: Math.max(0.05, activeTarget.y), z: activeTarget.z }
    : { x: config.target[0], y: config.target[1], z: config.target[2] };
  const pose: SphericalPose = {
    target,
    distance: config.distanceM,
    pitch: degToRad(config.pitchDeg),
    yaw: degToRad(config.yawDeg),
    roll: 0,
    focalLengthMm,
  };
  return sphericalToCartesian(pose, aspectRatio);
}

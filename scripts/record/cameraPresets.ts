/**
 * Cinematic & architectural camera presets for the 3D diorama.
 */

export interface CameraPoseConfig {
  pitchDeg: number;
  yawDeg: number;
  distanceM: number;
  target: [number, number, number];
}

export const CAMERA_PRESETS: Record<string, CameraPoseConfig> = {
  isometric: {
    pitchDeg: 35.264,
    yawDeg: 45,
    distanceM: 10,
    target: [0, 1.1, 0],
  },
  iso: {
    pitchDeg: 35.264,
    yawDeg: 45,
    distanceM: 10,
    target: [0, 1.1, 0],
  },
  'top-down': {
    pitchDeg: 84,
    yawDeg: 0,
    distanceM: 14,
    target: [0, 1.1, 0],
  },
  top: {
    pitchDeg: 84,
    yawDeg: 0,
    distanceM: 14,
    target: [0, 1.1, 0],
  },
  front: {
    pitchDeg: 12,
    yawDeg: 0,
    distanceM: 8,
    target: [0, 1.1, 0],
  },
  side: {
    pitchDeg: 15,
    yawDeg: 90,
    distanceM: 9,
    target: [0, 1.1, 0],
  },
};

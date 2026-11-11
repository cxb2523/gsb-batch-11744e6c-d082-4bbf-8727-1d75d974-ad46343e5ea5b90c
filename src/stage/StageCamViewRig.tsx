/**
 * Dedicated PerspectiveCamera rig for the Stage Cam Viewport.
 * Locks the Three.js camera directly to the illustrative Stage Camera's 60fps transform,
 * gated to cut atomically with the committed React UI state.
 */

import React, { useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { StageFrame } from '../core/types';

export interface StageCamViewRigProps {
  frameRef: React.RefObject<StageFrame>;
  uiFrame?: StageFrame;
}

export const StageCamViewRig: React.FC<StageCamViewRigProps> = ({
  frameRef,
  uiFrame,
}) => {
  const { camera } = useThree();

  useEffect(() => {
    const frame = uiFrame ?? frameRef.current;
    if (!frame) return;
    const { position, target, fovDeg, pose } = frame.stageCamera.transform;
    const persp = camera as THREE.PerspectiveCamera;
    persp.position.set(position.x, position.y, position.z);
    persp.fov = fovDeg;
    persp.updateProjectionMatrix();
    persp.lookAt(target.x, target.y, target.z);
    if (Math.abs(pose.roll) > 1e-6) {
      persp.rotateZ(pose.roll);
    }
  }, [camera, frameRef, uiFrame]);

  useFrame(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const isShotDesynced =
      uiFrame !== undefined &&
      Boolean(frame.stageCamera.shotId) &&
      Boolean(uiFrame.stageCamera.shotId) &&
      frame.stageCamera.shotId !== uiFrame.stageCamera.shotId;

    const transform = isShotDesynced
      ? uiFrame.stageCamera.transform
      : frame.stageCamera.transform;

    const { position, target, fovDeg, pose } = transform;
    const persp = camera as THREE.PerspectiveCamera;
    persp.position.set(position.x, position.y, position.z);
    persp.lookAt(target.x, target.y, target.z);
    if (Math.abs(pose.roll) > 1e-6) {
      persp.rotateZ(pose.roll);
    }

    if (Math.abs(persp.fov - fovDeg) > 0.05) {
      persp.fov = fovDeg;
      persp.updateProjectionMatrix();
    }
  });

  return null;
};

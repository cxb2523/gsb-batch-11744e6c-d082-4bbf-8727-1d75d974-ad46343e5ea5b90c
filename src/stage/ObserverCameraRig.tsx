/**
 * Manages the main Three.js PerspectiveCamera and OrbitControls.
 * Implements:
 *   1. Instant Cut (0ms transition) between 'scripted', 'free', and 'stage-pov'.
 *   2. Scripted lock during playback -> Free Orbit handover on pause -> Instant update on scrub.
 *   3. Gated atomic cut synchronization across React UI state updates.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type {
  CameraTransform3D,
  CameraViewMode,
  SphericalPose,
  StageFrame,
} from '../core/types';
import {
  cartesianToSpherical,
  computeFloorClampedMaxPolarAngle,
  MAX_SAFE_POLAR_ANGLE_RAD,
  MIN_FLOOR_CLEARANCE_M,
} from '../core/sphericalMath';
import {
  computeAdaptiveDioramaFovDeg,
  computeViewfinderCanvasFovDeg,
  verticalFovDegToFocalLengthMm,
} from '../core/opticsMath';
import {
  getPresetTransform,
  type CameraPresetType,
} from './cameraPresets';

export interface ObserverCameraRigProps {
  cameraMode: CameraViewMode;
  isPlaying: boolean;
  frameRef: React.RefObject<StageFrame>;
  uiFrame?: StageFrame;
  lastManualSeekIdRef: React.RefObject<number>;
  onFreeOrbitPoseChange: (pose: SphericalPose, immediate?: boolean) => void;
  cameraPresetActionRef?: React.RefObject<{
    type: CameraPresetType;
    id: number;
  } | null>;
}

export const ObserverCameraRig: React.FC<ObserverCameraRigProps> = ({
  cameraMode,
  isPlaying,
  frameRef,
  uiFrame,
  lastManualSeekIdRef,
  onFreeOrbitPoseChange,
  cameraPresetActionRef,
}) => {
  const { camera, size } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastHandledSeekIdRef = useRef<number>(lastManualSeekIdRef.current);
  const lastHandledPresetIdRef = useRef<number>(0);
  const lastModeRef = useRef<CameraViewMode>(cameraMode);
  const wasPlayingRef = useRef<boolean>(isPlaying);

  // Helper to apply a CameraTransform3D directly to Three.js PerspectiveCamera + OrbitControls
  const applyTransformImperatively = (
    transform: CameraTransform3D,
    mode: CameraViewMode
  ) => {
    const persp = camera as THREE.PerspectiveCamera;
    persp.position.set(
      transform.position.x,
      transform.position.y,
      transform.position.z
    );

    // In Stage Cam POV, compensate canvas vertical FOV for the contained film gate.
    // In Scripted / Free diorama modes, adapt vertical FOV so horizontal stage coverage
    // matches 16:9 baseline framing across narrow split workspace layouts (Approach A).
    const targetFovDeg =
      mode === 'stage-pov'
        ? computeViewfinderCanvasFovDeg(
            transform.fovDeg,
            size.width,
            size.height,
            transform.aspectRatio
          )
        : computeAdaptiveDioramaFovDeg(
            transform.fovDeg,
            size.width,
            size.height,
            transform.aspectRatio
          );

    if (Math.abs(persp.fov - targetFovDeg) > 0.05) {
      persp.fov = targetFovDeg;
      persp.updateProjectionMatrix();
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(
        transform.target.x,
        transform.target.y,
        transform.target.z
      );
      const dist = persp.position.distanceTo(controlsRef.current.target);
      controlsRef.current.maxPolarAngle = computeFloorClampedMaxPolarAngle(
        transform.target.y,
        dist,
        MIN_FLOOR_CLEARANCE_M,
        MAX_SAFE_POLAR_ANGLE_RAD
      );
      controlsRef.current.update();
    } else {
      persp.lookAt(
        transform.target.x,
        transform.target.y,
        transform.target.z
      );
    }
    if (Math.abs(transform.pose.roll) > 1e-6) {
      persp.rotateZ(transform.pose.roll);
    }
  };

  // Apply initial camera pose on mount
  useEffect(() => {
    const initialFrame = uiFrame ?? frameRef.current;
    if (!initialFrame) return;
    const targetTransform =
      cameraMode === 'stage-pov'
        ? initialFrame.stageCamera.transform
        : initialFrame.observerCamera.transform;
    applyTransformImperatively(targetTransform, cameraMode);
  }, []);

  useFrame(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const modeChanged = lastModeRef.current !== cameraMode;
    lastModeRef.current = cameraMode;

    const seekOccurred =
      lastManualSeekIdRef.current !== lastHandledSeekIdRef.current;
    lastHandledSeekIdRef.current = lastManualSeekIdRef.current;

    const justStartedPlaying = !wasPlayingRef.current && isPlaying;
    wasPlayingRef.current = isPlaying;

    // Handle Camera Presets trigger (Top, Iso, Front, Side, Reset)
    const presetAction = cameraPresetActionRef?.current;
    if (presetAction && presetAction.id !== lastHandledPresetIdRef.current) {
      lastHandledPresetIdRef.current = presetAction.id;
      if (presetAction.type === 'reset') {
        const targetTransform = frame.observerCamera.transform;
        applyTransformImperatively(targetTransform, cameraMode);
      } else {
        const aspect = frame.observerCamera.transform.aspectRatio ?? 16 / 9;
        const activeTarget = controlsRef.current
          ? {
              x: controlsRef.current.target.x,
              y: controlsRef.current.target.y,
              z: controlsRef.current.target.z,
            }
          : frame.observerCamera.transform.target;
        const targetTransform = getPresetTransform(presetAction.type, activeTarget, 35, aspect);
        applyTransformImperatively(targetTransform, 'free');
      }
      handleControlsChange(true);
      return;
    }

    // 1. STAGE CAMERA POV MODE: Always locked to the illustrative Stage Camera's exact frustum
    if (cameraMode === 'stage-pov') {
      const isShotDesynced =
        uiFrame !== undefined &&
        Boolean(frame.stageCamera.shotId) &&
        Boolean(uiFrame.stageCamera.shotId) &&
        frame.stageCamera.shotId !== uiFrame.stageCamera.shotId;

      const transform = isShotDesynced
        ? uiFrame.stageCamera.transform
        : frame.stageCamera.transform;

      applyTransformImperatively(transform, 'stage-pov');
      return;
    }

    // 2. SCRIPTED OBSERVER MODE:
    //    - Locked to observerCamera track while playing
    //    - Snaps on mode switch or when scrubbing while paused
    //    - Releases lock to OrbitControls when paused so user can freely orbit/inspect
    if (cameraMode === 'scripted') {
      if (isPlaying || modeChanged || seekOccurred || justStartedPlaying) {
        const isObserverShotDesynced =
          uiFrame !== undefined &&
          Boolean(frame.observerCamera.shotId) &&
          Boolean(uiFrame.observerCamera.shotId) &&
          frame.observerCamera.shotId !== uiFrame.observerCamera.shotId;

        const transform = isObserverShotDesynced
          ? uiFrame.observerCamera.transform
          : frame.observerCamera.transform;

        applyTransformImperatively(transform, 'scripted');
        return;
      }
    }

    // 3. FREE ORBIT MODE / PAUSED SCRIPTED MODE:
    // Update dynamic floor clearance and enforce ground safety clamp
    if (isOrbitEnabled && controlsRef.current) {
      const controls = controlsRef.current;
      const dist = camera.position.distanceTo(controls.target);
      controls.maxPolarAngle = computeFloorClampedMaxPolarAngle(
        controls.target.y,
        dist,
        MIN_FLOOR_CLEARANCE_M,
        MAX_SAFE_POLAR_ANGLE_RAD
      );

      // Hardware floor clearance clamp: ensure camera position never drops below MIN_FLOOR_CLEARANCE_M
      if (camera.position.y < MIN_FLOOR_CLEARANCE_M) {
        camera.position.y = MIN_FLOOR_CLEARANCE_M;
        camera.updateMatrixWorld();
      }

      // Prevent panning target into the underground void
      if (controls.target.y < MIN_FLOOR_CLEARANCE_M) {
        controls.target.y = MIN_FLOOR_CLEARANCE_M;
      }
    }
  });

  // OrbitControls is enabled in 'free' mode or in 'scripted' mode while paused
  const isOrbitEnabled =
    cameraMode === 'free' || (cameraMode === 'scripted' && !isPlaying);

  const handleControlsChange = (immediate = false) => {
    if (!isOrbitEnabled || !controlsRef.current) return;
    const persp = camera as THREE.PerspectiveCamera;
    const tgt = controlsRef.current.target;

    // Guard target and camera from sinking into the underground void
    if (tgt.y < MIN_FLOOR_CLEARANCE_M) {
      tgt.y = MIN_FLOOR_CLEARANCE_M;
    }
    if (persp.position.y < MIN_FLOOR_CLEARANCE_M) {
      persp.position.y = MIN_FLOOR_CLEARANCE_M;
      persp.updateMatrixWorld();
    }

    const dist = persp.position.distanceTo(tgt);
    controlsRef.current.maxPolarAngle = computeFloorClampedMaxPolarAngle(
      tgt.y,
      dist,
      MIN_FLOOR_CLEARANCE_M,
      MAX_SAFE_POLAR_ANGLE_RAD
    );

    const aspect = frameRef.current?.observerCamera.transform.aspectRatio ?? 16 / 9;
    const focalMm = verticalFovDegToFocalLengthMm(persp.fov, aspect);
    const livePose = cartesianToSpherical(
      { x: persp.position.x, y: persp.position.y, z: persp.position.z },
      { x: tgt.x, y: tgt.y, z: tgt.z },
      focalMm
    );
    onFreeOrbitPoseChange(livePose, immediate);
  };

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={isOrbitEnabled}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.5}
      maxDistance={100}
      maxPolarAngle={MAX_SAFE_POLAR_ANGLE_RAD}
      onChange={() => handleControlsChange(false)}
    />
  );
};

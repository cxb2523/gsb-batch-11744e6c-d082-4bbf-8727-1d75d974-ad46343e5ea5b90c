/**
 * Root React Three Fiber Canvas orchestrating the 60fps evaluation tick,
 * Blueprint Floor Grid, Observer Camera Rig, Illustrative Stage Camera Rig,
 * and Directional Mannequins.
 * Dynamically reacts to the active theme palette with zero extra draw calls.
 */

import React, { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type {
  AppThemeCategory,
  CameraViewMode,
  LabelDisplayMode,
  SphericalPose,
  StageFrame,
  StageScore,
} from '../core/types';
import { BlueprintStageScene } from './BlueprintStageScene';
import { ObserverCameraRig } from './ObserverCameraRig';
import { StageCameraRig } from './StageCameraRig';
import { StageCamDofEffect } from './StageCamDofEffect';
import { getDioramaThemeColors } from './dioramaTheme';
import type { CameraPresetType } from './cameraPresets';

export interface DioramaCanvasProps {
  score: StageScore;
  cameraMode: CameraViewMode;
  isPlaying: boolean;
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
  lastManualSeekIdRef: React.RefObject<number>;
  evaluateTick60fps: () => StageFrame;
  onFreeOrbitPoseChange: (pose: SphericalPose, immediate?: boolean) => void;
  labelMode?: LabelDisplayMode;
  dofBlurEnabled?: boolean;
  themeCategory?: AppThemeCategory;
  cameraPresetActionRef?: React.RefObject<{
    type: CameraPresetType;
    id: number;
  } | null>;
}

const FrameLoopTicker: React.FC<{ onTick: () => void }> = ({ onTick }) => {
  // Run priority -1 so `frameRef.current` is freshly computed before Camera and Mannequin rigs read it
  useFrame(() => {
    onTick();
  }, -1);
  return null;
};

export const DioramaCanvas: React.FC<DioramaCanvasProps> = ({
  score,
  cameraMode,
  isPlaying,
  frameRef,
  uiFrame,
  lastManualSeekIdRef,
  evaluateTick60fps,
  onFreeOrbitPoseChange,
  labelMode = 'all',
  dofBlurEnabled = false,
  themeCategory = 'light',
  cameraPresetActionRef,
}) => {
  const themeColors = useMemo(
    () => getDioramaThemeColors(themeCategory),
    [themeCategory]
  );

  return (
    <div className="relative w-full h-full bg-app select-none overflow-hidden">
      <Canvas
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{
          fov: 40,
          near: 0.1,
          far: 250,
          position: [4.5, 3.5, 6.0],
        }}
      >
        <color attach="background" args={[themeColors.bg]} />
        <fog attach="fog" args={[themeColors.fog, 45, 160]} />

        {/* 60fps Stateless Frame Evaluator Tick */}
        <FrameLoopTicker onTick={evaluateTick60fps} />

        {/* 1. Shared Diorama Scene (Lighting, Metric Floor Grid, Directional Mannequins) */}
        <BlueprintStageScene
          score={score}
          frameRef={frameRef}
          uiFrame={uiFrame}
          labelMode={labelMode}
          isPlaying={isPlaying}
          cameraMode={cameraMode}
          themeCategory={themeCategory}
        />

        {/* 2. Viewport Observer Camera & Free-Orbit Handover Rig */}
        <ObserverCameraRig
          cameraMode={cameraMode}
          isPlaying={isPlaying}
          frameRef={frameRef}
          uiFrame={uiFrame}
          lastManualSeekIdRef={lastManualSeekIdRef}
          onFreeOrbitPoseChange={onFreeOrbitPoseChange}
          cameraPresetActionRef={cameraPresetActionRef}
        />

        {/* 3. Illustrative Stage Camera with Rectangular Film Gate Frustum */}
        <StageCameraRig
          frameRef={frameRef}
          cameraMode={cameraMode}
          uiFrame={uiFrame}
          labelMode={labelMode}
        />

        {/* 4. Opt-In Single-Pass Thin-Lens DoF Blur Effect (Stage Cam POV Only) */}
        {dofBlurEnabled && cameraMode === 'stage-pov' && (
          <StageCamDofEffect frameRef={frameRef} uiFrame={uiFrame} />
        )}
      </Canvas>
    </div>
  );
};

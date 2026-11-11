/**
 * Center stage diorama HUD overlay container.
 * Manages responsive switching between narrow-viewport compact header (<768px)
 * and the 4-corner directorial workspace dock (Shot HUD, ViewCube presets,
 * camera POV switcher, 3D label toggle, and live telemetry capsule).
 * Layer 5 UI Component.
 */

import React from 'react';
import type {
  CameraViewMode,
  LabelDisplayMode,
  SphericalPose,
  StageFrame,
  StageScore,
} from '../core/types';
import type { CameraPresetType } from '../stage/cameraPresets';
import { CompactDioramaHeader } from './CompactDioramaHeader';
import { ShotBreakdownHud } from './ShotBreakdownHud';
import { LabelDisplayModeToggle } from './LabelDisplayModeToggle';
import { CameraPresetControls } from './CameraPresetControls';
import { CameraModeSwitcher } from './CameraModeSwitcher';
import { CameraTelemetryCapsule } from './CameraTelemetryCapsule';
import { StageCamViewfinderOverlay } from './StageCamViewfinderOverlay';

export interface DioramaOverlayContainerProps {
  score: StageScore;
  frame: StageFrame;
  liveViewportPose: SphericalPose;
  cameraMode: CameraViewMode;
  isPlaying: boolean;
  labelMode: LabelDisplayMode;
  showGuides: boolean;
  dofBlurEnabled?: boolean;
  isNarrow: boolean;
  dioramaWidth?: number;
  onSetCameraMode: (mode: CameraViewMode) => void;
  onSelectPreset: (preset: CameraPresetType) => void;
  onSelectLabelMode: (mode: LabelDisplayMode) => void;
  onToggleGuides: () => void;
  onToggleDofBlur?: () => void;
}

export const DioramaOverlayContainer: React.FC<DioramaOverlayContainerProps> = ({
  score,
  frame,
  liveViewportPose,
  cameraMode,
  isPlaying,
  labelMode,
  showGuides,
  dofBlurEnabled = false,
  isNarrow,
  dioramaWidth,
  onSetCameraMode,
  onSelectPreset,
  onSelectLabelMode,
  onToggleGuides,
  onToggleDofBlur,
}) => {
  return (
    <>
      {/* Stage Camera POV Director's Optical Viewfinder Overlay */}
      {cameraMode === 'stage-pov' && (
        <StageCamViewfinderOverlay
          score={score}
          frame={frame}
          showGuides={showGuides}
        />
      )}

      {/* Narrow Viewport: Dedicated Unified Compact Header (<768px) */}
      {isNarrow ? (
        <CompactDioramaHeader
          score={score}
          frame={frame}
          cameraMode={cameraMode}
          onSetCameraMode={onSetCameraMode}
          onSelectPreset={onSelectPreset}
          labelMode={labelMode}
          onSelectLabelMode={onSelectLabelMode}
          showGuides={showGuides}
          onToggleGuides={onToggleGuides}
          dofBlurEnabled={dofBlurEnabled}
          onToggleDofBlur={onToggleDofBlur}
        />
      ) : (
        <>
          {/* 1. TOP-LEFT: Shot & Lens Breakdown HUD (Defaults to 2-line Collapsed Pill) */}
          <ShotBreakdownHud
            score={score}
            frame={frame}
            cameraMode={cameraMode}
            isPlaying={isPlaying}
          />

          {/* 2. TOP-RIGHT: 3D Stage Labels, Viewfinder Guides & Optical DoF Blur */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 pointer-events-auto select-none">
            <LabelDisplayModeToggle
              labelMode={labelMode}
              onSelectLabelMode={onSelectLabelMode}
              showGuides={showGuides}
              onToggleGuides={onToggleGuides}
              dofBlurEnabled={dofBlurEnabled}
              onToggleDofBlur={onToggleDofBlur}
              cameraMode={cameraMode}
            />
          </div>

          {/* 3. BOTTOM-LEFT: Directorial Camera Workstation Dock (ViewCube Presets + Camera POV Modes) */}
          <div className="absolute bottom-3 left-3 z-20 flex flex-col items-start gap-1.5 pointer-events-none select-none">
            {/* Tier 1: View Angle Presets (3D ViewCube Icons) */}
            <CameraPresetControls onSelectPreset={onSelectPreset} />

            {/* Tier 2: Camera POV Mode Switcher (Scripted, Free Orbit, Stage Cam) */}
            <CameraModeSwitcher
              cameraMode={cameraMode}
              onSetCameraMode={onSetCameraMode}
            />
          </div>
        </>
      )}

      {/* 4. BOTTOM-RIGHT: Authoring Telemetry Capsule + 1-Click YAML Copy (Hidden when narrow) */}
      {!isNarrow && (
        <CameraTelemetryCapsule
          observerPose={liveViewportPose}
          stageCamera={frame.stageCamera}
          observerRig={frame.observerCamera.rig}
          cameraMode={cameraMode}
          dioramaWidth={dioramaWidth}
        />
      )}
    </>
  );
};

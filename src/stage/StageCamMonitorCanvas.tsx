/**
 * True 3D Stage Cam Monitor Canvas.
 * Renders the 3D diorama scene directly through the illustrative Stage Camera's lens,
 * overlaid with an optical director's monitor HUD (safe-action guides, reticle, telemetry).
 * Dynamically reacts to the active theme palette with zero extra draw calls.
 */

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type {
  AppThemeCategory,
  LabelDisplayMode,
  StageFrame,
  StageScore,
} from '../core/types';
import { radToDeg } from '../core/sphericalMath';
import { formatApertureFStop } from '../core/opticsMath';
import { BlueprintStageScene } from './BlueprintStageScene';
import { StageCamViewRig } from './StageCamViewRig';
import { StageCamDofEffect } from './StageCamDofEffect';
import { getDioramaThemeColors } from './dioramaTheme';

export interface StageCamMonitorCanvasProps {
  score: StageScore;
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
  labelMode?: LabelDisplayMode;
  isPlaying?: boolean;
  showGuides?: boolean;
  dofBlurEnabled?: boolean;
  onToggleDofBlur?: () => void;
  themeCategory?: AppThemeCategory;
}

export const StageCamMonitorCanvas: React.FC<StageCamMonitorCanvasProps> = ({
  score,
  frameRef,
  uiFrame,
  labelMode = 'all',
  isPlaying = false,
  showGuides = true,
  dofBlurEnabled = false,
  onToggleDofBlur,
  themeCategory = 'light',
}) => {
  const pose = uiFrame.stageCamera.transform.pose;
  const dof = uiFrame.stageCamera.dof;
  const yawDeg = radToDeg(pose.yaw);
  const rollDeg = radToDeg(pose.roll);
  const themeColors = useMemo(
    () => getDioramaThemeColors(themeCategory),
    [themeCategory]
  );

  return (
    <div className="relative w-full h-full bg-app select-none overflow-hidden">
      {/* 1. True 3D WebGL Viewport locked to Stage Camera */}
      <Canvas
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{
          fov: uiFrame.stageCamera.transform.fovDeg,
          near: 0.1,
          far: 250,
        }}
      >
        <color attach="background" args={[themeColors.bg]} />
        <fog attach="fog" args={[themeColors.fog, 45, 160]} />

        {/* Shared Diorama Scene (Lighting, Metric Floor Grid, Directional Mannequins) */}
        <BlueprintStageScene
          score={score}
          frameRef={frameRef}
          uiFrame={uiFrame}
          labelMode={labelMode}
          isPlaying={isPlaying}
          cameraMode="stage-pov"
          themeCategory={themeCategory}
        />

        {/* 60fps Stage Camera View Controller (Gated to cut atomically with UI state) */}
        <StageCamViewRig frameRef={frameRef} uiFrame={uiFrame} />

        {/* Opt-In Single-Pass Thin-Lens Depth of Field Blur Effect */}
        {dofBlurEnabled && (
          <StageCamDofEffect frameRef={frameRef} uiFrame={uiFrame} />
        )}
      </Canvas>

      {/* 2. Optical Director's Monitor HUD Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10">
        {/* Top Monitor Status Line */}
        <div className="flex items-center justify-between text-[11px] font-mono gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-bold text-amber-500">CAM</span>
            <span className="text-text-muted">|</span>
            <span className="text-text-body font-semibold">
              {Math.round(pose.focalLengthMm)}mm
              {dof.enabled ? ` · ${formatApertureFStop(dof.apertureFStop)}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleDofBlur && (
              <button
                type="button"
                onClick={onToggleDofBlur}
                title={`Toggle Optical DoF Blur Simulation [Hotkey: B] — Currently ${
                  dofBlurEnabled ? 'ON' : 'OFF'
                }`}
                className={`pointer-events-auto px-2 py-0.5 rounded-md border text-[10px] font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  dofBlurEnabled
                    ? 'bg-emerald-500 text-white border-emerald-500 font-semibold shadow-2xs'
                    : 'bg-surface/80 border-border-main text-text-muted hover:text-text-main'
                }`}
              >
                BLUR {dofBlurEnabled ? 'ON' : 'OFF'}
              </button>
            )}

            <div className="hidden @md:flex items-center gap-1 bg-surface/80 border border-border-main px-2 py-0.5 rounded-md shadow-xs whitespace-nowrap shrink-0">
              <div className="flex items-center gap-1">
                <span className="text-text-muted">FOV</span>
                <span className="text-text-main font-semibold">
                  {uiFrame.stageCamera.transform.fovDeg.toFixed(1)}°
                </span>
              </div>
              <span className="text-border-main">·</span>
              <div className="flex items-center gap-1">
                <span className="text-text-muted">ROLL</span>
                <span
                  className={`font-semibold ${
                    Math.abs(rollDeg) >= 0.05
                      ? 'text-violet-500'
                      : 'text-text-main'
                  }`}
                >
                  {rollDeg.toFixed(1)}°
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Optical Reticle & Rule-of-Thirds Grid */}
        {showGuides && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Rule-of-Thirds Grid Lines */}
            <div className="absolute inset-x-0 top-1/3 border-b border-amber-500/20" />
            <div className="absolute inset-x-0 bottom-1/3 border-b border-amber-500/20" />
            <div className="absolute inset-y-0 left-1/3 border-r border-amber-500/20" />
            <div className="absolute inset-y-0 right-1/3 border-r border-amber-500/20" />

            {/* 90% Safe-Action Title Frame */}
            <div className="absolute inset-[5%] border border-amber-500/30 rounded-xs pointer-events-none" />

            {/* Center Focus Crosshair */}
            <div className="relative w-6 h-6 flex items-center justify-center">
              <div className="absolute w-4 h-px bg-amber-500/60" />
              <div className="absolute h-4 w-px bg-amber-500/60" />
              <div className="w-1.5 h-1.5 rounded-full border border-amber-500/80" />
            </div>
          </div>
        )}

        {/* Bottom Horizon & Telemetry Bar */}
        <div className="flex items-center justify-between text-[10px] font-mono text-text-muted z-10 gap-2">
          <div className="flex items-center gap-1 bg-surface/80 border border-border-main px-2 py-0.5 rounded-md shadow-xs whitespace-nowrap shrink-0">
            <span className="text-amber-500 font-bold">MANEUVER:</span>
            <span className="text-text-main uppercase font-semibold">
              {uiFrame.stageCamera.maneuver}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-surface/80 border border-border-main px-2 py-0.5 rounded-md shadow-xs whitespace-nowrap shrink-0">
            <span>
              YAW: <strong className="text-text-main">{yawDeg.toFixed(1)}°</strong>
            </span>
            <span className="text-border-main">·</span>
            <span>
              DIST: <strong className="text-text-main">{pose.distance.toFixed(2)}m</strong>
            </span>
            {(dof.hasExplicitFocus || dof.enabled) && (
              <>
                <span className="text-border-main">·</span>
                <span>
                  FOCUS:{' '}
                  <strong className="text-emerald-500">
                    {dof.focusDistanceM.toFixed(2)}m
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Headless Recorder Viewport Component.
 * Dedicated, chrome-free rendering environment mounted when ?mode=headless-render is present.
 * Exposes window.__STAGEFLOW_RECORDER__ for deterministic, frame-by-frame Playwright stepping.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { SphericalPose, StageFrame, StageScore, Vec3 } from '../core/types';
import { degToRad, sphericalToCartesian } from '../core/sphericalMath';
import { parseStageScore } from '../core/scoreParser';
import { computeStageFrame } from '../core/frameEngine';
import { INITIAL_CATALOG_ITEMS } from '../core/scoreCatalog';
import { DioramaCanvas } from '../stage/DioramaCanvas';
import { getDioramaThemeColors } from '../stage/dioramaTheme';
import { StageCamViewfinderOverlay } from '../ui/StageCamViewfinderOverlay';
import { ShotBreakdownHud } from '../ui/ShotBreakdownHud';
import { CameraTelemetryCapsule } from '../ui/CameraTelemetryCapsule';
import type {
  RecorderConfig,
  RecorderFrameResult,
  HeadlessRecorderBridge,
} from './recorderTypes';

const DEFAULT_CONFIG: RecorderConfig = {
  scoreYaml: INITIAL_CATALOG_ITEMS[0].rawYaml,
  cameraMode: 'scripted',
  labelMode: 'all',
  showGuides: false,
  showHud: false,
  dofBlur: undefined,
  theme: 'dark',
  fps: 60,
  width: 1920,
  height: 1080,
  startSec: 0,
  endSec: 0,
};

function applyCustomPoseToFrame(
  frame: StageFrame,
  customPose?: RecorderConfig['customPose']
): StageFrame {
  if (!customPose) return frame;

  const pitchRad = degToRad(customPose.pitchDeg ?? 35.264);
  const yawRad = degToRad(customPose.yawDeg ?? 45);
  const dist = customPose.distanceM ?? 10;
  const targetVec: Vec3 = customPose.target
    ? {
        x: customPose.target[0],
        y: customPose.target[1],
        z: customPose.target[2],
      }
    : { x: 0, y: 1.1, z: 0 };
  const pose: SphericalPose = {
    target: targetVec,
    pitch: pitchRad,
    yaw: yawRad,
    distance: dist,
    roll: 0,
    focalLengthMm: 35,
  };
  const aspect = frame.observerCamera.transform.aspectRatio ?? 16 / 9;
  const transform = sphericalToCartesian(pose, aspect);

  return {
    ...frame,
    observerCamera: {
      ...frame.observerCamera,
      transform,
    },
  };
}

export const HeadlessRecorderView: React.FC = () => {
  const [config, setConfig] = useState<RecorderConfig>(() => {
    if (typeof window !== 'undefined' && window.__STAGEFLOW_RECORDER_CONFIG__) {
      return window.__STAGEFLOW_RECORDER_CONFIG__;
    }
    return DEFAULT_CONFIG;
  });

  const parsedScoreResult = useMemo(() => {
    try {
      const res = parseStageScore(config.scoreYaml);
      return res.score ?? INITIAL_CATALOG_ITEMS[0].score;
    } catch {
      return INITIAL_CATALOG_ITEMS[0].score;
    }
  }, [config.scoreYaml]);

  const score: StageScore = parsedScoreResult;
  const initialFrame = useMemo(
    () =>
      applyCustomPoseToFrame(
        computeStageFrame(config.startSec, score),
        config.customPose
      ),
    [config.startSec, score, config.customPose]
  );

  const [uiFrame, setUiFrame] = useState<StageFrame>(initialFrame);
  const frameRef = useRef<StageFrame>(initialFrame);
  const lastManualSeekIdRef = useRef<number>(0);

  const configRef = useRef<RecorderConfig>(config);
  configRef.current = config;

  const scoreRef = useRef<StageScore>(score);
  scoreRef.current = score;

  const effectiveDofBlur =
    config.dofBlur !== undefined
      ? config.dofBlur
      : (score.optics?.dofBlur ?? false);

  const effectiveTheme = config.theme ?? 'dark';
  const themeColors = useMemo(
    () => getDioramaThemeColors(effectiveTheme),
    [effectiveTheme]
  );

  // Synchronize ref on uiFrame change
  useEffect(() => {
    frameRef.current = uiFrame;
  }, [uiFrame]);

  // Frame evaluation tick passed to DioramaCanvas
  const evaluateTick60fps = useCallback(() => {
    return frameRef.current;
  }, []);

  // Frame step execution called by Playwright bridge
  const stepFrame = useCallback((frameIndex: number): Promise<RecorderFrameResult> => {
    return new Promise((resolve) => {
      const cfg = configRef.current;
      const currentScore = scoreRef.current;
      const timeOffsetSec = frameIndex / cfg.fps;
      const currentTimestampSec = Math.min(
        cfg.startSec + timeOffsetSec,
        cfg.endSec > cfg.startSec ? cfg.endSec : currentScore.durationSec
      );

      const rawFrame = computeStageFrame(currentTimestampSec, currentScore);
      const nextFrame = applyCustomPoseToFrame(rawFrame, cfg.customPose);
      frameRef.current = nextFrame;
      setUiFrame(nextFrame);
      lastManualSeekIdRef.current += 1;

      // Two animation frames ensure React state flush + R3F WebGL draw + Drei HTML positioning
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const shotId = nextFrame.activeShot?.id ?? null;
          const total = Math.max(
            1,
            Math.ceil(
              ((cfg.endSec > cfg.startSec
                ? cfg.endSec
                : currentScore.durationSec) -
                cfg.startSec) *
                cfg.fps
            )
          );
          resolve({
            frameIndex,
            timestampSec: currentTimestampSec,
            shotId,
            totalFrames: total,
          });
        });
      });
    });
  }, []);

  // Initialize and register bridge on window
  useEffect(() => {
    const bridge: HeadlessRecorderBridge = {
      ready: true,
      init: async (newConfig: RecorderConfig) => {
        configRef.current = newConfig;
        setConfig(newConfig);
        const res = parseStageScore(newConfig.scoreYaml);
        const parsed = res.score ?? INITIAL_CATALOG_ITEMS[0].score;
        scoreRef.current = parsed;
        const effectiveEnd =
          newConfig.endSec > newConfig.startSec
            ? newConfig.endSec
            : parsed.durationSec;
        const total = Math.max(
          1,
          Math.ceil((effectiveEnd - newConfig.startSec) * newConfig.fps)
        );
        const rawFirstFrame = computeStageFrame(newConfig.startSec, parsed);
        const firstFrame = applyCustomPoseToFrame(
          rawFirstFrame,
          newConfig.customPose
        );
        frameRef.current = firstFrame;
        setUiFrame(firstFrame);
        return {
          totalFrames: total,
          durationSec: effectiveEnd - newConfig.startSec,
          fps: newConfig.fps,
        };
      },
      stepFrame,
    };

    window.__STAGEFLOW_RECORDER__ = bridge;

    return () => {
      // Keep bridge defined to prevent transient undefined window.__STAGEFLOW_RECORDER__ during render transitions
    };
  }, [stepFrame]);

  return (
    <div
      id="stageflow-recorder-root"
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{
        width: `${config.width}px`,
        height: `${config.height}px`,
        backgroundColor: themeColors.bg,
      }}
    >
      {/* 3D Blueprint Diorama */}
      <DioramaCanvas
        score={score}
        cameraMode={config.cameraMode}
        isPlaying={true}
        frameRef={frameRef}
        uiFrame={uiFrame}
        lastManualSeekIdRef={lastManualSeekIdRef}
        evaluateTick60fps={evaluateTick60fps}
        onFreeOrbitPoseChange={() => {}}
        labelMode={config.labelMode}
        dofBlurEnabled={effectiveDofBlur}
        themeCategory={effectiveTheme}
      />

      {/* Stage Camera POV Director's Optical Viewfinder Overlay */}
      {config.cameraMode === 'stage-pov' && (
        <StageCamViewfinderOverlay
          score={score}
          frame={uiFrame}
          showGuides={config.showGuides}
        />
      )}

      {/* Optional 2D Viewport HUD Chrome */}
      {config.showHud && (
        <>
          <ShotBreakdownHud
            score={score}
            frame={uiFrame}
            cameraMode={config.cameraMode}
            isPlaying={false}
          />
          <CameraTelemetryCapsule
            observerPose={uiFrame.observerCamera.transform.pose}
            stageCamera={uiFrame.stageCamera}
            observerRig={uiFrame.observerCamera.rig}
            cameraMode={config.cameraMode}
          />
        </>
      )}
    </div>
  );
};

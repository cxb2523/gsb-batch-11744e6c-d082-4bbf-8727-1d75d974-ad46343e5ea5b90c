/**
 * Universal Video Viewport Component.
 * Seamlessly renders:
 *   1. Native HTML5 <video> (local .mp4 / .webm or dropped file blob)
 *   2. YouTube IFrame Player (with unified transport & 60fps drift-corrected sync)
 *   3. True 3D Stage Cam Monitor Viewport (for zero-asset `procedural://` demos)
 * 100% clean, distraction-free viewport without floating badges.
 */

import React from 'react';
import type { AppThemeCategory, LabelDisplayMode, StageFrame, StageScore } from '../core/types';
import type { MediaSourceInfo } from '../media/mediaTypes';
import { StageCamMonitorCanvas } from '../stage/StageCamMonitorCanvas';

export interface UniversalVideoViewportProps {
  score: StageScore;
  sourceInfo: MediaSourceInfo;
  html5VideoRef: React.RefObject<HTMLVideoElement | null>;
  youtubeContainerRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
  isPlaying: boolean;
  labelMode?: LabelDisplayMode;
  showGuides?: boolean;
  dofBlurEnabled?: boolean;
  onToggleDofBlur?: () => void;
  themeCategory?: AppThemeCategory;
  onApplyVideoUrlOverride?: (url: string) => void;
}

export const UniversalVideoViewport: React.FC<UniversalVideoViewportProps> = ({
  score,
  sourceInfo,
  html5VideoRef,
  youtubeContainerRef,
  frameRef,
  uiFrame,
  isPlaying,
  labelMode,
  showGuides = true,
  dofBlurEnabled = false,
  onToggleDofBlur,
  themeCategory = 'light',
}) => {
  return (
    <div className="relative flex-1 w-full h-full aspect-fit-container bg-app select-none overflow-hidden p-2.5 md:p-3">
      {/* 16:9 / Gate Aspect Ratio Responsive Frame */}
      <div
        style={{
          ['--aspect-ratio' as string]: String(score.aspectRatio),
        }}
        className="aspect-fit-box relative bg-surface-dark rounded-2xl border border-border-main shadow-xl overflow-hidden flex items-center justify-center"
      >
        {/* 1. Native HTML5 <video> */}
        <video
          ref={html5VideoRef}
          src={sourceInfo.kind === 'html5' ? sourceInfo.url : undefined}
          playsInline
          preload="auto"
          className={`w-full h-full object-contain ${
            sourceInfo.kind === 'html5' ? 'block' : 'hidden'
          }`}
        />

        {/* 2. YouTube IFrame Container */}
        <div
          ref={youtubeContainerRef}
          className={`w-full h-full ${
            sourceInfo.kind === 'youtube' ? 'block' : 'hidden'
          }`}
        />

        {/* 3. True 3D Optical Stage Cam Monitor Viewport */}
        {sourceInfo.kind === 'procedural' && (
          <StageCamMonitorCanvas
            score={score}
            frameRef={frameRef}
            uiFrame={uiFrame}
            labelMode={labelMode}
            isPlaying={isPlaying}
            showGuides={showGuides}
            dofBlurEnabled={dofBlurEnabled}
            onToggleDofBlur={onToggleDofBlur}
            themeCategory={themeCategory}
          />
        )}
      </div>
    </div>
  );
};

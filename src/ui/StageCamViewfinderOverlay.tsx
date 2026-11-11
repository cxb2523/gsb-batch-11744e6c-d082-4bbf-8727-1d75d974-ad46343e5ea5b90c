/**
 * Stage Camera POV Director's Optical Viewfinder Overlay.
 * Renders:
 *   1. Centered active recording gate matching score.aspectRatio across any pane width
 *   2. Semi-translucent 82% obsidian "Look-Around" veil shading the off-camera perimeter
 *   3. 4 luminous corner framing brackets and optical gate stamp
 *   4. Toggleable composition guides (90% safe-action box, rule-of-thirds grid, center reticle)
 */

import React, { useRef, useState, useLayoutEffect } from 'react';
import type { StageFrame, StageScore } from '../core/types';
import {
  computeContainedGateDimensionsPx,
  formatApertureFStop,
} from '../core/opticsMath';
import { VIEWFINDER_GATE_SCALE } from '../core/constants';

export interface StageCamViewfinderOverlayProps {
  score: StageScore;
  frame: StageFrame;
  showGuides: boolean;
}

export const StageCamViewfinderOverlay: React.FC<
  StageCamViewfinderOverlayProps
> = ({ score, frame, showGuides }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateDimensions = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const contained = computeContainedGateDimensionsPx(
        rect.width,
        rect.height,
        score.aspectRatio,
        VIEWFINDER_GATE_SCALE
      );
      setDimensions(contained);
    };

    updateDimensions();

    const observer = new ResizeObserver(() => {
      updateDimensions();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [score.aspectRatio]);

  const lensMm = Math.round(frame.stageCamera.transform.pose.focalLengthMm);
  const dof = frame.stageCamera.dof;
  const aspectLabel =
    Math.abs(score.aspectRatio - 16 / 9) < 0.05
      ? '16:9'
      : Math.abs(score.aspectRatio - 2.39) < 0.08
      ? '2.39:1'
      : `${score.aspectRatio.toFixed(2)}:1`;

  const isGateReady = dimensions.width > 0 && dimensions.height > 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none select-none z-10 flex items-center justify-center overflow-hidden"
    >
      {isGateReady && (
        <div
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            // 82% obsidian look-around mask extending infinitely outside the active gate
            boxShadow: '0 0 0 9999px rgba(5, 8, 17, 0.82)',
          }}
          className="relative border border-amber-400/50 shadow-2xl flex items-center justify-center"
        >
          {/* 4 Optical Corner Framing Brackets */}
          <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-amber-400" />
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-amber-400" />
          <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-amber-400" />
          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-amber-400" />

          {/* Top-Left Gate Stamp Badge */}
          <div className="absolute -top-3 left-3 px-1.5 py-0.5 rounded bg-slate-950/90 border border-amber-500/40 text-[8px] font-mono font-bold tracking-wider text-amber-300 uppercase shadow-sm flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>REC GATE</span>
            <span className="text-slate-500">·</span>
            <span>{aspectLabel}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-200">{lensMm}mm</span>
            {dof.enabled && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-emerald-300">
                  {formatApertureFStop(dof.apertureFStop)}
                </span>
              </>
            )}
            {(dof.hasExplicitFocus || dof.enabled) && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-emerald-300">
                  F {dof.focusDistanceM.toFixed(1)}m
                </span>
              </>
            )}
          </div>

          {/* Toggleable Composition Guides */}
          {showGuides && (
            <>
              {/* 90% Safe-Action Guide Frame */}
              <div className="absolute inset-[5%] border border-dashed border-amber-400/35 pointer-events-none" />

              {/* Rule-of-Thirds 3x3 Grid */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
                <div className="border-r border-b border-amber-400" />
                <div className="border-r border-b border-amber-400" />
                <div className="border-b border-amber-400" />
                <div className="border-r border-b border-amber-400" />
                <div className="border-r border-b border-amber-400" />
                <div className="border-b border-amber-400" />
                <div className="border-r border-b border-amber-400" />
                <div className="border-r border-b border-amber-400" />
                <div />
              </div>

              {/* Center Optical Crosshair Reticle */}
              <div className="relative w-6 h-6 rounded-full border border-amber-400/60 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                <div className="absolute -top-2 w-[1px] h-2 bg-amber-400/60" />
                <div className="absolute -bottom-2 w-[1px] h-2 bg-amber-400/60" />
                <div className="absolute -left-2 h-[1px] w-2 bg-amber-400/60" />
                <div className="absolute -right-2 h-[1px] w-2 bg-amber-400/60" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

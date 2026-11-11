/**
 * Directorial Timeline Scrubber Track.
 * Features:
 *   - Proportional shot boundary razor cut ticks
 *   - Gradient active playback progress fill
 *   - Luminous emerald loop segment with `[` and `]` boundary brackets when Loop Shot is active
 *   - Razor hover hairline and floating directorial tooltip (timecode + shot label)
 *   - Accessible range input slider
 */

import React, { useState, useRef, useMemo, useCallback } from 'react';
import type { StageFrame, StageScore } from '../../core/types';

export interface DirectorialTimelineTrackProps {
  score: StageScore;
  frame: StageFrame;
  safeDuration: number;
  currentSec: number;
  loopActiveShot: boolean;
  isPlaying: boolean;
  onSeek: (targetSec: number) => void;
  onPause?: () => void;
}

export function formatTimecode(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

export const DirectorialTimelineTrack: React.FC<
  DirectorialTimelineTrackProps
> = ({
  score,
  frame,
  safeDuration,
  currentSec,
  loopActiveShot,
  isPlaying,
  onSeek,
  onPause,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverState, setHoverState] = useState<{
    sec: number;
    pct: number;
  } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const pct = (offsetX / rect.width) * 100;
      const sec = Math.max(0, Math.min(safeDuration, (offsetX / rect.width) * safeDuration));
      setHoverState({ sec, pct });
    },
    [safeDuration]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverState(null);
  }, []);

  const hoveredShot = useMemo(() => {
    if (!hoverState) return null;
    const sec = hoverState.sec;
    return (
      score.shots.find((s) => sec >= s.startSec && sec < s.endSec) ??
      score.shots[score.shots.length - 1] ??
      null
    );
  }, [score.shots, hoverState]);

  // Compute loop boundaries if loopActiveShot is enabled and activeShot is valid
  const loopBounds = useMemo(() => {
    if (!loopActiveShot || !frame.activeShot) return null;
    const shot = frame.activeShot;
    const leftPct = (shot.startSec / safeDuration) * 100;
    const widthPct = ((shot.endSec - shot.startSec) / safeDuration) * 100;
    return { leftPct, widthPct };
  }, [loopActiveShot, frame.activeShot, safeDuration]);

  // Clamp tooltip translateX to prevent overflowing screen boundaries
  const tooltipTransform = useMemo(() => {
    if (!hoverState) return 'translateX(-50%)';
    if (hoverState.pct < 12) return 'translateX(0%)';
    if (hoverState.pct > 88) return 'translateX(-100%)';
    return 'translateX(-50%)';
  }, [hoverState]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative flex items-center w-full h-6 group"
    >
      {/* 1. Shot Boundary Track under Scrubber */}
      <div className="absolute inset-x-0 h-2.5 rounded-full bg-surface-muted border border-border-main overflow-hidden pointer-events-none">
        {/* Layer 1: Shot Segment Background Highlights */}
        {score.shots.map((shot) => {
          const leftPct = (shot.startSec / safeDuration) * 100;
          const widthPct = ((shot.endSec - shot.startSec) / safeDuration) * 100;
          const isActive = frame.activeShot?.id === shot.id;
          return (
            <div
              key={shot.id}
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
              }}
              className={`absolute top-0 bottom-0 transition-colors ${
                isActive ? 'bg-amber-500/25' : 'bg-surface-hover/30'
              }`}
            />
          );
        })}

        {/* Layer 2: Luminous Emerald Active Loop Region Bar */}
        {loopBounds && (
          <div
            style={{
              left: `${loopBounds.leftPct}%`,
              width: `${loopBounds.widthPct}%`,
            }}
            className="absolute top-0 bottom-0 bg-emerald-500/25 border-y border-emerald-500/70 shadow-[0_0_8px_rgba(16,185,129,0.45)] pointer-events-none z-1"
          />
        )}

        {/* Layer 3: Active Progress Fill */}
        <div
          style={{
            width: `${Math.min(100, (currentSec / safeDuration) * 100)}%`,
          }}
          className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-amber-500"
        />

        {/* Layer 4: Razor Edit Cut Dividers (Rendered on top of progress fill) */}
        {score.shots.map((shot) => {
          if (shot.startSec <= 0.05 || shot.startSec >= safeDuration - 0.05) {
            return null;
          }
          const pct = (shot.startSec / safeDuration) * 100;
          const isPlayed = currentSec >= shot.startSec;
          return (
            <div
              key={`cut-${shot.id}`}
              style={{ left: `${pct}%` }}
              className={`absolute top-0 bottom-0 w-[1.5px] -translate-x-1/2 z-2 transition-colors ${
                isPlayed
                  ? 'bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.5)]'
                  : 'bg-text-faint/70 dark:bg-text-muted/60'
              }`}
            />
          );
        })}
      </div>

      {/* Luminous Emerald Boundary Bracket Ticks (Rendered over the track) */}
      {loopBounds && (
        <div className="absolute inset-x-0 h-4 pointer-events-none z-10">
          <div
            style={{
              left: `${loopBounds.leftPct}%`,
              width: `${loopBounds.widthPct}%`,
            }}
            className="relative w-full h-full"
          >
            <span
              style={{ left: 0 }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-0.5 text-[10px] font-mono font-black text-emerald-400 drop-shadow-xs"
              title="Loop Start"
            >
              [
            </span>
            <span
              style={{ left: '100%' }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1.5 text-[10px] font-mono font-black text-emerald-400 drop-shadow-xs"
              title="Loop End"
            >
              ]
            </span>
          </div>
        </div>
      )}

      {/* 2. Razor Hover Hairline & Directorial Preview Tooltip */}
      {hoverState && (
        <>
          <div
            style={{ left: `${hoverState.pct}%` }}
            className="absolute top-0 bottom-0 w-px bg-amber-400 pointer-events-none z-20 shadow-[0_0_4px_rgba(251,191,36,0.6)]"
          />
          <div
            style={{
              left: `${hoverState.pct}%`,
              transform: tooltipTransform,
            }}
            className="absolute -top-7 pointer-events-none z-30 whitespace-nowrap px-2 py-0.5 rounded-lg bg-surface border border-border-main text-[10px] font-mono text-text-main shadow-md backdrop-blur-xs flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <span className="font-bold text-amber-500">
              {formatTimecode(hoverState.sec)}
            </span>
            {hoveredShot && (
              <>
                <span className="text-text-muted opacity-50">·</span>
                <span className="font-bold text-text-body">
                  #{String(hoveredShot.shotNumber).padStart(2, '0')}
                </span>
                <span className="text-text-muted truncate max-w-[180px]">
                  {hoveredShot.label.replace(/^Shot\s*\d+\s*[·:–-]\s*/i, '').trim() ||
                    hoveredShot.label}
                </span>
              </>
            )}
          </div>
        </>
      )}

      {/* 3. Interactive Range Input Scrubber */}
      <input
        type="range"
        min={0}
        max={safeDuration}
        step={0.01}
        value={currentSec}
        onPointerDown={() => {
          if (isPlaying) {
            onPause?.();
          }
        }}
        onChange={(e) => {
          if (isPlaying) {
            onPause?.();
          }
          onSeek(parseFloat(e.target.value));
        }}
        className="relative w-full h-6 appearance-none bg-transparent cursor-pointer accent-text-main z-20"
        title="Scrub timeline (deterministically reconstructs 3D stage at any timestamp)"
      />
    </div>
  );
};


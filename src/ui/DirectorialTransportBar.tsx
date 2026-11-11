/**
 * Directorial Transport Bar Component.
 * Composes:
 *   1. DirectorialTimelineTrack: Proportional razor edit ticks, hover preview tooltip, and emerald loop brackets
 *   2. DirectorialShotChipsStrip: Auto-centering shot chip row with edge fade masks and clean free-peeking
 *   3. DirectorialTransportDeck: Unified centered playback controls island
 * Enforces strictly decoupled architecture (each submodule <= 200 lines).
 */

import React from 'react';
import type { StageFrame, StageScore } from '../core/types';
import { DirectorialTimelineTrack } from './transport/DirectorialTimelineTrack';
import { DirectorialShotChipsStrip } from './transport/DirectorialShotChipsStrip';
import { DirectorialTransportDeck } from './transport/DirectorialTransportDeck';

export interface DirectorialTransportBarProps {
  score: StageScore;
  frame: StageFrame;
  durationSec: number;
  isPlaying: boolean;
  playbackRate: number;
  isMuted: boolean;
  loopActiveShot: boolean;
  onTogglePlay: () => void;
  onPause?: () => void;
  onSeek: (targetSec: number) => void;
  onStepFrames: (frames: number) => void;
  onSetPlaybackRate: (rate: number) => void;
  onToggleMute: () => void;
  onToggleLoopActiveShot: () => void;
}

export const DirectorialTransportBar: React.FC<
  DirectorialTransportBarProps
> = ({
  score,
  frame,
  durationSec,
  isPlaying,
  playbackRate,
  isMuted,
  loopActiveShot,
  onTogglePlay,
  onPause,
  onSeek,
  onStepFrames,
  onSetPlaybackRate,
  onToggleMute,
  onToggleLoopActiveShot,
}) => {
  const safeDuration = Math.max(0.1, durationSec);
  const currentSec = frame.timestampSec;

  return (
    <footer className="shrink-0 bg-surface border-t border-border-main px-2 py-1.5 md:px-3 md:py-2 flex flex-col gap-1 md:gap-1.5 select-none z-20 text-text-main shadow-xs">
      {/* Row 1: Scrubber Track with Visual Cut Markers, Hover Tooltip & Emerald Loop Brackets */}
      <DirectorialTimelineTrack
        score={score}
        frame={frame}
        safeDuration={safeDuration}
        currentSec={currentSec}
        loopActiveShot={loopActiveShot}
        isPlaying={isPlaying}
        onSeek={onSeek}
        onPause={onPause}
      />

      {/* Row 2: Auto-Centering Shot Chips (Hidden on narrow/mobile viewports < md) */}
      <div className="hidden md:block">
        <DirectorialShotChipsStrip
          shots={score.shots}
          activeShotId={frame.activeShot?.id ?? null}
          onSeek={onSeek}
        />
      </div>

      {/* Row 3: Unified Centered Transport Island */}
      <DirectorialTransportDeck
        currentSec={currentSec}
        safeDuration={safeDuration}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        isMuted={isMuted}
        loopActiveShot={loopActiveShot}
        onTogglePlay={onTogglePlay}
        onSeek={onSeek}
        onStepFrames={onStepFrames}
        onSetPlaybackRate={onSetPlaybackRate}
        onToggleMute={onToggleMute}
        onToggleLoopActiveShot={onToggleLoopActiveShot}
      />
    </footer>
  );
};

/**
 * Directorial Transport Deck Component.
 * Unified centered island housing:
 *   1. Left Segment: Precision Timecode Readout (Current / Duration)
 *   2. Center Segment: Core Kinetic Transport (Restart to 0, Distinct Hero Play/Pause Icon Toggle)
 *   3. Right Segment: Directorial Modifiers (Loop Active Shot Icon, Audio Mute Icon)
 * Speed controls and frame-step buttons are omitted for maximum compactness and visual clarity.
 * Global keyboard shortcuts ([ and ] for frame step, Space for play/pause) remain active.
 */

import React from 'react';
import {
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatTimecode } from './DirectorialTimelineTrack';

export interface DirectorialTransportDeckProps {
  currentSec: number;
  safeDuration: number;
  isPlaying: boolean;
  playbackRate?: number;
  isMuted: boolean;
  loopActiveShot: boolean;
  onTogglePlay: () => void;
  onSeek: (targetSec: number) => void;
  onStepFrames?: (frames: number) => void;
  onSetPlaybackRate?: (rate: number) => void;
  onToggleMute: () => void;
  onToggleLoopActiveShot: () => void;
}

export const DirectorialTransportDeck: React.FC<
  DirectorialTransportDeckProps
> = ({
  currentSec,
  safeDuration,
  isPlaying,
  isMuted,
  loopActiveShot,
  onTogglePlay,
  onSeek,
  onToggleMute,
  onToggleLoopActiveShot,
}) => {
  return (
    <div className="flex items-center justify-center w-full py-0.5">
      {/* Unified Centered Island with Left-to-Right Hierarchy */}
      <div className="flex items-center justify-center gap-2 sm:gap-2.5">
        {/* Segment 1 (Left): Timecode Readout */}
        <div className="px-2.5 py-1.5 rounded-xl bg-surface-muted border border-border-main font-mono text-xs text-text-muted flex items-center gap-1 shadow-inner select-text">
          <span className="text-text-main font-bold">
            {formatTimecode(currentSec)}
          </span>
          <span className="text-text-faint">/</span>
          <span className="text-text-faint">
            {formatTimecode(safeDuration)}
          </span>
        </div>

        {/* Subtle Visual Divider */}
        <div className="w-px h-4 bg-border-main shrink-0" />

        {/* Segment 2 (Center): Core Kinetic Transport */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Restart to 00:00.00 */}
          <button
            type="button"
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-xl bg-surface hover:bg-surface-hover border border-border-main text-text-muted hover:text-text-main transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Restart to 00:00.00"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Primary Hero: Play / Pause Toggle `Space` (Distinct Hero Color) */}
          <button
            type="button"
            onClick={onTogglePlay}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              isPlaying
                ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20'
                : 'bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover'
            }`}
            title="Play / Pause (Hotkey: Space · Frame Step: [ and ])"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>
        </div>

        {/* Subtle Visual Divider */}
        <div className="w-px h-4 bg-border-main shrink-0" />

        {/* Segment 3 (Right): Directorial Modifiers */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Loop Active Shot (Icon Only) */}
          <button
            type="button"
            onClick={onToggleLoopActiveShot}
            className={`p-1.5 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95 ${
              loopActiveShot
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 dark:text-emerald-300 font-semibold shadow-xs'
                : 'bg-surface hover:bg-surface-hover border-border-main text-text-muted hover:text-text-main'
            }`}
            title={loopActiveShot ? 'Loop Active Shot (Active · Click to disable)' : 'Loop Active Shot'}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          {/* Audio Mute Toggle */}
          <button
            type="button"
            onClick={onToggleMute}
            className="p-1.5 rounded-xl bg-surface hover:bg-surface-hover border border-border-main text-text-muted hover:text-text-main transition-all cursor-pointer shadow-2xs active:scale-95"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-text-muted" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

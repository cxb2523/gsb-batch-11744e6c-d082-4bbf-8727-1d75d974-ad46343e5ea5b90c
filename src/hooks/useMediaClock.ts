/**
 * React hook managing the active MediaClockDriver (HTML5 <video>, YouTube IFrame, or Procedural),
 * playback transport controls, shot-boundary looping, frame-stepping (`[` / `]`), and keyboard shortcuts.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { StageScore } from '../core/types';
import {
  classifyMediaSource,
  type MediaClockDriver,
  type MediaSourceInfo,
} from '../media/mediaTypes';
import { Html5MediaDriver } from '../media/html5MediaDriver';
import { YouTubeMediaDriver } from '../media/youtubeMediaDriver';
import { ProceduralMediaDriver } from '../media/proceduralMediaDriver';

export const FRAME_STEP_SECONDS = 1 / 30; // ~33.3ms single-frame step

export interface UseMediaClockResult {
  sourceInfo: MediaSourceInfo;
  driverRef: React.RefObject<MediaClockDriver | null>;
  html5VideoRef: React.RefObject<HTMLVideoElement | null>;
  youtubeContainerRef: React.RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  playbackRate: number;
  isMuted: boolean;
  loopActiveShot: boolean;
  durationSec: number;
  lastManualSeekIdRef: React.RefObject<number>;
  togglePlay: () => void;
  pause: () => void;
  seek: (targetSec: number) => void;
  stepFrames: (frameCount: number) => void;
  setPlaybackRate: (rate: number) => void;
  toggleMute: () => void;
  toggleLoopActiveShot: () => void;
}

export function useMediaClock(
  score: StageScore,
  videoOverrideUrl?: string | null
): UseMediaClockResult {
  const effectiveUrl = videoOverrideUrl || score.videoUrl;
  const sourceInfo = useMemo(
    () => classifyMediaSource(effectiveUrl),
    [effectiveUrl]
  );

  const driverRef = useRef<MediaClockDriver | null>(null);
  const html5VideoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const lastManualSeekIdRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [loopActiveShot, setLoopActiveShot] = useState(false);
  const [durationSec, setDurationSec] = useState(score.durationSec);

  useEffect(() => {
    setDurationSec(score.durationSec);
  }, [score.durationSec]);

  // Instantiate the appropriate MediaClockDriver whenever sourceInfo changes
  useEffect(() => {
    let activeDriver: MediaClockDriver | null = null;
    setIsPlaying(false);

    const callbacks = {
      onPlayStateChange: (playing: boolean) => {
        setIsPlaying(playing);
      },
      onDurationChange: (dur: number) => {
        if (dur > 0) {
          setDurationSec(dur);
        }
      },
      onRateChange: (rate: number) => {
        setPlaybackRateState(rate);
      },
      onEnded: () => {
        setIsPlaying(false);
      },
    };

    if (sourceInfo.kind === 'html5' && html5VideoRef.current) {
      activeDriver = new Html5MediaDriver(
        html5VideoRef.current,
        score.durationSec,
        callbacks
      );
    } else if (
      sourceInfo.kind === 'youtube' &&
      sourceInfo.youtubeId &&
      youtubeContainerRef.current
    ) {
      activeDriver = new YouTubeMediaDriver(
        youtubeContainerRef.current,
        sourceInfo.youtubeId,
        score.durationSec,
        callbacks
      );
    } else {
      activeDriver = new ProceduralMediaDriver(score.durationSec, callbacks);
    }

    driverRef.current = activeDriver;

    return () => {
      activeDriver?.destroy();
      if (driverRef.current === activeDriver) {
        driverRef.current = null;
      }
    };
  }, [sourceInfo, score.durationSec]);

  const togglePlay = useCallback(() => {
    const drv = driverRef.current;
    if (!drv) return;
    if (drv.isPlaying()) {
      drv.pause();
    } else {
      if (drv.getCurrentTime() >= drv.getDuration() - 0.05) {
        drv.seek(0);
        lastManualSeekIdRef.current += 1;
      }
      drv.play();
    }
  }, []);

  const pause = useCallback(() => {
    driverRef.current?.pause();
  }, []);

  const seek = useCallback((targetSec: number) => {
    const drv = driverRef.current;
    if (!drv) return;
    drv.seek(targetSec);
    lastManualSeekIdRef.current += 1;
  }, []);

  const stepFrames = useCallback((frameCount: number) => {
    const drv = driverRef.current;
    if (!drv) return;
    if (drv.isPlaying()) {
      drv.pause();
    }
    const nextSec = drv.getCurrentTime() + frameCount * FRAME_STEP_SECONDS;
    drv.seek(nextSec);
    lastManualSeekIdRef.current += 1;
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    driverRef.current?.setPlaybackRate(rate);
    setPlaybackRateState(rate);
  }, []);

  const toggleMute = useCallback(() => {
    const drv = driverRef.current;
    if (!drv) return;
    const next = !drv.isMuted();
    drv.setMuted(next);
    setIsMuted(next);
  }, []);

  const toggleLoopActiveShot = useCallback(() => {
    setLoopActiveShot((prev) => !prev);
  }, []);

  // Global keyboard shortcuts: Space (play/pause), `[` / `]` (frame step), Left/Right arrows (1s skip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === '[') {
        e.preventDefault();
        stepFrames(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        stepFrames(1);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const drv = driverRef.current;
        if (drv) {
          seek(drv.getCurrentTime() - (e.shiftKey ? 5 : 1));
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const drv = driverRef.current;
        if (drv) {
          seek(drv.getCurrentTime() + (e.shiftKey ? 5 : 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, stepFrames, seek]);

  return {
    sourceInfo,
    driverRef,
    html5VideoRef,
    youtubeContainerRef,
    isPlaying,
    playbackRate,
    isMuted,
    loopActiveShot,
    durationSec,
    lastManualSeekIdRef,
    togglePlay,
    pause,
    seek,
    stepFrames,
    setPlaybackRate,
    toggleMute,
    toggleLoopActiveShot,
  };
}

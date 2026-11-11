/**
 * YouTube IFrame Player API implementation of the unified MediaClockDriver.
 * Features high-resolution 60fps drift-corrected time extrapolation so
 * YouTube playback drives the 3D diorama with the exact same silky 60fps
 * precision as a local HTML5 <video> element.
 */

import type {
  MediaClockDriver,
  MediaClockStateCallbacks,
} from './mediaTypes';

interface YTPlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  setPlaybackRate(suggestedRate: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}

interface YTWindow extends Window {
  YT?: {
    Player: new (
      container: HTMLElement,
      options: {
        videoId: string;
        width?: string | number;
        height?: string | number;
        playerVars?: Record<string, string | number>;
        events?: {
          onReady?: () => void;
          onStateChange?: (event: { data: number }) => void;
          onPlaybackRateChange?: (event: { data: number }) => void;
        };
      }
    ) => YTPlayerInstance;
    PlayerState?: {
      ENDED: number;
      PLAYING: number;
      PAUSED: number;
      BUFFERING: number;
      CUED: number;
    };
  };
  onYouTubeIframeAPIReady?: () => void;
}

let ytApiPromise: Promise<void> | null = null;

function ensureYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  const win = window as YTWindow;
  if (win.YT && win.YT.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<void>((resolve) => {
    const prevCallback = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  });

  return ytApiPromise;
}

export class YouTubeMediaDriver implements MediaClockDriver {
  public readonly kind = 'youtube' as const;
  private player: YTPlayerInstance | null = null;
  private ready = false;
  private playing = false;
  private muted = false;
  private playbackRate = 1.0;
  private fallbackDurationSec: number;
  private callbacks: MediaClockStateCallbacks;
  private destroyed = false;

  // High-resolution extrapolation state for 60fps clock smoothness
  private lastPolledYtTime = 0;
  private anchorVideoTimeSec = 0;
  private anchorPerfTimeMs = 0;
  private pendingSeekTarget: number | null = null;
  private pendingSeekTimestampMs = 0;

  constructor(
    containerElement: HTMLElement,
    videoId: string,
    fallbackDurationSec: number,
    callbacks: MediaClockStateCallbacks = {}
  ) {
    this.fallbackDurationSec = Math.max(0.1, fallbackDurationSec);
    this.callbacks = callbacks;
    this.anchorPerfTimeMs = performance.now();

    ensureYouTubeIframeApi().then(() => {
      if (this.destroyed) return;
      const win = window as YTWindow;
      if (!win.YT || !win.YT.Player) return;

      const mountTarget = document.createElement('div');
      containerElement.innerHTML = '';
      containerElement.appendChild(mountTarget);

      this.player = new win.YT.Player(mountTarget, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            if (this.destroyed || !this.player) return;
            this.ready = true;
            const dur = this.getDuration();
            if (dur > 0) {
              this.callbacks.onDurationChange?.(dur);
            }
          },
          onStateChange: (ev) => {
            if (this.destroyed || !this.player) return;
            const state = ev.data;
            const now = performance.now();
            // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
            if (state === 1) {
              this.playing = true;
              const rawT = this.player.getCurrentTime() || 0;
              const isSeekSettled =
                this.pendingSeekTarget === null ||
                Math.abs(rawT - this.pendingSeekTarget) < 1.5 ||
                now - this.pendingSeekTimestampMs > 600;
              if (isSeekSettled) {
                this.pendingSeekTarget = null;
                this.lastPolledYtTime = rawT;
                this.anchorVideoTimeSec = rawT;
                this.anchorPerfTimeMs = now;
              }
              this.callbacks.onPlayStateChange?.(true);
            } else if (state === 2) {
              this.playing = false;
              const rawT = this.player.getCurrentTime() || this.anchorVideoTimeSec;
              const isSeekSettled =
                this.pendingSeekTarget === null ||
                Math.abs(rawT - this.pendingSeekTarget) < 1.5 ||
                now - this.pendingSeekTimestampMs > 600;
              if (isSeekSettled) {
                this.pendingSeekTarget = null;
                this.lastPolledYtTime = rawT;
                this.anchorVideoTimeSec = rawT;
                this.anchorPerfTimeMs = now;
              }
              this.callbacks.onPlayStateChange?.(false);
            } else if (state === 0) {
              this.playing = false;
              this.pendingSeekTarget = null;
              this.anchorVideoTimeSec = this.getDuration();
              this.callbacks.onPlayStateChange?.(false);
              this.callbacks.onEnded?.();
            }
          },
          onPlaybackRateChange: (ev) => {
            if (this.destroyed) return;
            const newRate = Number(ev.data) || 1.0;
            this.anchorVideoTimeSec = this.getCurrentTime();
            this.anchorPerfTimeMs = performance.now();
            this.playbackRate = newRate;
            this.callbacks.onRateChange?.(newRate);
          },
        },
      });
    });
  }

  public isReady(): boolean {
    return this.ready;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getCurrentTime(): number {
    if (!this.ready || !this.player) {
      return this.anchorVideoTimeSec;
    }

    const rawYtTime = this.player.getCurrentTime();
    const now = performance.now();

    // If an asynchronous seek is pending, do not allow stale pre-seek time to revert the anchor
    if (this.pendingSeekTarget !== null) {
      const isClose =
        typeof rawYtTime === 'number' &&
        Number.isFinite(rawYtTime) &&
        Math.abs(rawYtTime - this.pendingSeekTarget) < 1.5;
      const isTimedOut = now - this.pendingSeekTimestampMs > 600;

      if (isClose || isTimedOut) {
        this.pendingSeekTarget = null;
        if (typeof rawYtTime === 'number' && Number.isFinite(rawYtTime)) {
          this.lastPolledYtTime = rawYtTime;
          this.anchorVideoTimeSec = rawYtTime;
          this.anchorPerfTimeMs = now;
        }
      } else {
        if (!this.playing) {
          return this.anchorVideoTimeSec;
        }
        const elapsedSec =
          ((now - this.anchorPerfTimeMs) / 1000) * this.playbackRate;
        return Math.max(
          0,
          Math.min(this.getDuration(), this.anchorVideoTimeSec + elapsedSec)
        );
      }
    }

    if (
      typeof rawYtTime === 'number' &&
      Number.isFinite(rawYtTime) &&
      Math.abs(rawYtTime - this.lastPolledYtTime) > 0.001
    ) {
      this.lastPolledYtTime = rawYtTime;
      this.anchorVideoTimeSec = rawYtTime;
      this.anchorPerfTimeMs = now;
    }

    if (!this.playing) {
      return this.anchorVideoTimeSec;
    }

    const elapsedSec =
      ((now - this.anchorPerfTimeMs) / 1000) * this.playbackRate;
    return Math.max(
      0,
      Math.min(this.getDuration(), this.anchorVideoTimeSec + elapsedSec)
    );
  }

  public getDuration(): number {
    if (this.ready && this.player) {
      const d = this.player.getDuration();
      if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
        return d;
      }
    }
    return this.fallbackDurationSec;
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  public isMuted(): boolean {
    if (this.ready && this.player) {
      return this.player.isMuted();
    }
    return this.muted;
  }

  public async play(): Promise<void> {
    if (this.ready && this.player) {
      this.anchorPerfTimeMs = performance.now();
      this.player.playVideo();
    }
  }

  public pause(): void {
    if (this.ready && this.player) {
      this.anchorVideoTimeSec = this.getCurrentTime();
      this.playing = false;
      this.player.pauseVideo();
      this.callbacks.onPlayStateChange?.(false);
    }
  }

  public seek(timeSec: number): void {
    const clamped = Math.max(0, Math.min(this.getDuration(), timeSec));
    this.anchorVideoTimeSec = clamped;
    this.lastPolledYtTime = clamped;
    this.anchorPerfTimeMs = performance.now();
    this.pendingSeekTarget = clamped;
    this.pendingSeekTimestampMs = performance.now();
    if (this.ready && this.player) {
      this.player.seekTo(clamped, true);
    }
  }

  public setPlaybackRate(rate: number): void {
    const safeRate = Math.max(0.25, Math.min(2.0, rate));
    this.anchorVideoTimeSec = this.getCurrentTime();
    this.anchorPerfTimeMs = performance.now();
    this.playbackRate = safeRate;
    if (this.ready && this.player) {
      this.player.setPlaybackRate(safeRate);
    }
    this.callbacks.onRateChange?.(safeRate);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ready && this.player) {
      if (muted) {
        this.player.mute();
      } else {
        this.player.unMute();
      }
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.playing = false;
    this.pendingSeekTarget = null;
    if (this.player) {
      try {
        this.player.destroy();
      } catch {
        // Ignore iframe teardown errors
      }
      this.player = null;
    }
  }
}

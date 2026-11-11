/**
 * HTML5 <video> implementation of the unified MediaClockDriver.
 * Powers local .mp4 / .webm files and drag-and-dropped blob URLs.
 */

import type {
  MediaClockDriver,
  MediaClockStateCallbacks,
} from './mediaTypes';

export class Html5MediaDriver implements MediaClockDriver {
  public readonly kind = 'html5' as const;
  private video: HTMLVideoElement;
  private fallbackDurationSec: number;
  private callbacks: MediaClockStateCallbacks;
  private ready = false;
  private pendingSeekSec: number | null = null;
  private pendingSeekTimestampMs = 0;

  private handlePlay = () => {
    this.callbacks.onPlayStateChange?.(true);
  };

  private handlePause = () => {
    this.callbacks.onPlayStateChange?.(false);
  };

  private handleSeeked = () => {
    this.pendingSeekSec = null;
  };

  private handleLoadedMetadata = () => {
    this.ready = true;
    const dur = this.getDuration();
    if (dur > 0) {
      this.callbacks.onDurationChange?.(dur);
    }
  };

  private handleRateChange = () => {
    this.callbacks.onRateChange?.(this.video.playbackRate);
  };

  private handleEnded = () => {
    this.callbacks.onPlayStateChange?.(false);
    this.callbacks.onEnded?.();
  };

  constructor(
    videoElement: HTMLVideoElement,
    fallbackDurationSec: number,
    callbacks: MediaClockStateCallbacks = {}
  ) {
    this.video = videoElement;
    this.fallbackDurationSec = Math.max(0.1, fallbackDurationSec);
    this.callbacks = callbacks;

    if (this.video.readyState >= 1) {
      this.ready = true;
    }

    this.video.addEventListener('play', this.handlePlay);
    this.video.addEventListener('pause', this.handlePause);
    this.video.addEventListener('seeked', this.handleSeeked);
    this.video.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.video.addEventListener('ratechange', this.handleRateChange);
    this.video.addEventListener('ended', this.handleEnded);
  }

  public isReady(): boolean {
    return this.ready || this.video.readyState >= 1;
  }

  public isPlaying(): boolean {
    return !this.video.paused && !this.video.ended;
  }

  public getCurrentTime(): number {
    if (this.pendingSeekSec !== null) {
      const now = performance.now();
      if (
        !this.video.seeking &&
        Math.abs((this.video.currentTime || 0) - this.pendingSeekSec) < 0.05
      ) {
        this.pendingSeekSec = null;
        return this.video.currentTime || 0;
      }
      if (now - this.pendingSeekTimestampMs > 500) {
        this.pendingSeekSec = null;
        return this.video.currentTime || 0;
      }
      return this.pendingSeekSec;
    }
    return this.video.currentTime || 0;
  }

  public getDuration(): number {
    const d = this.video.duration;
    return Number.isFinite(d) && d > 0 ? d : this.fallbackDurationSec;
  }

  public getPlaybackRate(): number {
    return this.video.playbackRate || 1;
  }

  public isMuted(): boolean {
    return this.video.muted;
  }

  public async play(): Promise<void> {
    try {
      await this.video.play();
    } catch {
      // Autoplay or missing source fallback handled gracefully
      this.callbacks.onPlayStateChange?.(false);
    }
  }

  public pause(): void {
    this.video.pause();
  }

  public seek(timeSec: number): void {
    const clamped = Math.max(0, Math.min(this.getDuration(), timeSec));
    this.pendingSeekSec = clamped;
    this.pendingSeekTimestampMs = performance.now();
    this.video.currentTime = clamped;
  }

  public setPlaybackRate(rate: number): void {
    const safeRate = Math.max(0.1, Math.min(4.0, rate));
    this.video.playbackRate = safeRate;
  }

  public setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  public destroy(): void {
    this.video.removeEventListener('play', this.handlePlay);
    this.video.removeEventListener('pause', this.handlePause);
    this.video.removeEventListener('seeked', this.handleSeeked);
    this.video.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.video.removeEventListener('ratechange', this.handleRateChange);
    this.video.removeEventListener('ended', this.handleEnded);
    this.video.pause();
  }
}

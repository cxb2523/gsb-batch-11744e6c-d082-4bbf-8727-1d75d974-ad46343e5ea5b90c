/**
 * High-precision virtual media clock driver for `procedural://` blueprint demo scenes
 * or missing video fallbacks. Runs at 60fps via `performance.now()`.
 */

import type {
  MediaClockDriver,
  MediaClockStateCallbacks,
} from './mediaTypes';

export class ProceduralMediaDriver implements MediaClockDriver {
  public readonly kind = 'procedural' as const;
  private durationSec: number;
  private callbacks: MediaClockStateCallbacks;
  private playing = false;
  private muted = false;
  private playbackRate = 1.0;
  private anchorTimeSec = 0;
  private anchorPerfMs = 0;

  constructor(
    durationSec: number,
    callbacks: MediaClockStateCallbacks = {}
  ) {
    this.durationSec = Math.max(0.5, durationSec);
    this.callbacks = callbacks;
    this.anchorPerfMs = performance.now();
  }

  public isReady(): boolean {
    return true;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getCurrentTime(): number {
    if (!this.playing) {
      return this.anchorTimeSec;
    }
    const now = performance.now();
    const elapsed = ((now - this.anchorPerfMs) / 1000) * this.playbackRate;
    const current = this.anchorTimeSec + elapsed;
    if (current >= this.durationSec) {
      this.anchorTimeSec = this.durationSec;
      this.playing = false;
      this.callbacks.onPlayStateChange?.(false);
      this.callbacks.onEnded?.();
      return this.durationSec;
    }
    return Math.max(0, current);
  }

  public getDuration(): number {
    return this.durationSec;
  }

  public setDuration(newDurationSec: number): void {
    this.durationSec = Math.max(0.5, newDurationSec);
    if (this.anchorTimeSec > this.durationSec) {
      this.anchorTimeSec = this.durationSec;
    }
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public async play(): Promise<void> {
    if (this.anchorTimeSec >= this.durationSec - 0.02) {
      this.anchorTimeSec = 0;
    }
    this.anchorPerfMs = performance.now();
    this.playing = true;
    this.callbacks.onPlayStateChange?.(true);
  }

  public pause(): void {
    if (this.playing) {
      this.anchorTimeSec = this.getCurrentTime();
      this.playing = false;
      this.callbacks.onPlayStateChange?.(false);
    }
  }

  public seek(timeSec: number): void {
    const clamped = Math.max(0, Math.min(this.durationSec, timeSec));
    this.anchorTimeSec = clamped;
    this.anchorPerfMs = performance.now();
  }

  public setPlaybackRate(rate: number): void {
    const safeRate = Math.max(0.25, Math.min(2.0, rate));
    if (this.playing) {
      this.anchorTimeSec = this.getCurrentTime();
      this.anchorPerfMs = performance.now();
    }
    this.playbackRate = safeRate;
    this.callbacks.onRateChange?.(safeRate);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public destroy(): void {
    this.playing = false;
  }
}

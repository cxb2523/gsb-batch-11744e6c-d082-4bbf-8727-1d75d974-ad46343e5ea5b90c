/**
 * Unified MediaClockDriver contracts and source URL classifiers.
 * Guarantees identical playback, scrubbing, rate-control, and 60fps timecode
 * synchronization across Local HTML5 video files, YouTube URLs, and Procedural slates.
 */

export type MediaSourceKind = 'html5' | 'youtube' | 'procedural';

export interface MediaSourceInfo {
  kind: MediaSourceKind;
  url: string;
  youtubeId?: string;
}

export interface MediaClockStateCallbacks {
  onPlayStateChange?: (isPlaying: boolean) => void;
  onDurationChange?: (durationSec: number) => void;
  onRateChange?: (rate: number) => void;
  onEnded?: () => void;
}

export interface MediaClockDriver {
  readonly kind: MediaSourceKind;
  isReady(): boolean;
  isPlaying(): boolean;
  getCurrentTime(): number; // Frame-accurate in seconds at 60fps
  getDuration(): number;    // Total duration in seconds
  getPlaybackRate(): number;
  isMuted(): boolean;
  play(): Promise<void>;
  pause(): void;
  seek(timeSec: number): void;
  setPlaybackRate(rate: number): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

/**
 * Extracts an 11-character YouTube video ID from standard watch, short, or embed URLs.
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Classifies any video URL string into 'youtube', 'html5', or 'procedural'.
 */
export function classifyMediaSource(rawUrl: string): MediaSourceInfo {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed.startsWith('procedural://')) {
    return {
      kind: 'procedural',
      url: trimmed || 'procedural://demo',
    };
  }

  const ytId = extractYouTubeId(trimmed);
  if (
    ytId &&
    (trimmed.includes('youtube.com') ||
      trimmed.includes('youtu.be') ||
      trimmed.length === 11)
  ) {
    return {
      kind: 'youtube',
      url: trimmed,
      youtubeId: ytId,
    };
  }

  return {
    kind: 'html5',
    url: trimmed,
  };
}

import { formatVideoTime } from './media.ts';

/**
 * Timeline & keyboard diagnostics for SimplePlayer.
 *
 * This module is a pure-function mirror of the private timeline/keyboard
 * decision logic inside `simple-player-element.ts`
 * (`#getVisualProgressTime`, `#updateProgress`, `#formatTimeForDisplay`,
 * `#handleProgressKeyDown`, `#handlePlayerKeyDown`). It takes a plain-data
 * snapshot and returns a plain-data diagnostic object so the behavior can be
 * verified without a DOM. It never touches the DOM, the disk, templates, or
 * styles, and its output is JSON-serializable.
 */

/** HTMLMediaElement.HAVE_FUTURE_DATA, mirrored so no DOM constant is needed. */
export const HAVE_FUTURE_DATA = 3;

/** Keys consumed by the progress track keyboard handler. */
export const PROGRESS_TRACK_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'] as const;

/** Sources for the visible progress time, in the priority order used by the player. */
export type VisualProgressSource = 'scrub-target' | 'pause-frozen' | 'current-time' | 'estimate';

export interface TimelineKeyDescriptor {
  /** KeyboardEvent.key, e.g. 'ArrowLeft', ' ', 'Enter', 'k', 'MediaPlayPause'. */
  key: string;
  shiftKey: boolean;
  /** KeyboardEvent.repeat — held-down keys must not be consumed on the player surface. */
  repeat: boolean;
  /** Whether the event target is the player surface (selects the player-surface handler). */
  isPlayerSurfaceTarget: boolean;
  /** Whether playback has currently reached the end (video.ended at event time). */
  ended: boolean;
}

export interface TimelineSnapshot {
  duration: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  loop: boolean;
  readyState: number;
  /** Whether playback is currently buffering / showing the loading state. */
  isBuffering: boolean;
  /** Whether the initial progress settle has completed. */
  hasInitialProgressSettled: boolean;
  /** Scrub-lock target time, or null when no scrub preview is locked. */
  scrubTargetTime: number | null;
  /** Pause-frozen progress fraction (0..1), or null when not frozen. */
  pauseFrozenProgressPercent: number | null;
  showRemainingTime: boolean;
  /** Base time of the playing estimate clock; defaults to currentTime. */
  visualProgressTime?: number;
  /** Seconds elapsed since the estimate clock was synced; defaults to 0. */
  estimateElapsedSeconds?: number;
  /** Whether the initial estimate hold (performance.now() < unlockAt) is active. */
  isInitialEstimateLocked?: boolean;
  key: TimelineKeyDescriptor;
}

export interface TimelineProgressDiagnostics {
  /** Visible progress time selected by the same priority order as #getVisualProgressTime. */
  time: number;
  source: VisualProgressSource;
  /** Progress fraction in [0, 1]; 0 when duration is not a positive finite number. */
  percent: number;
  ariaValueNow: number;
  ariaValueText: string;
}

export interface TimelineDisplayDiagnostics {
  /** Text exactly as formatVideoTime / remaining-time mode would render it. */
  text: string;
  isRemaining: boolean;
}

export type TimelineKeyHandler = 'player-surface' | 'progress-track' | 'none';

export interface TimelineKeyDiagnostics {
  key: string;
  handler: TimelineKeyHandler;
  /** Whether the keydown would be consumed (preventDefault + stopPropagation). */
  consumed: boolean;
  /** Whether the key would trigger a play/pause toggle (or media play/pause action). */
  togglesPlayback: boolean;
  /** 'play' | 'pause' when a playback action fires, otherwise 'none'. */
  playbackAction: 'play' | 'pause' | 'none';
  /** Resulting playback state after the key, or null when playback is untouched. */
  resultingPlaybackState: 'playing' | 'paused' | null;
  /** Target currentTime for progress-track keys, clamped to [0, duration]; null otherwise. */
  targetCurrentTime: number | null;
}

export interface TimelineCheck {
  name: string;
  passed: boolean;
  /** Human-readable reason, present when the check failed. */
  reason: string | null;
}

export interface TimelineDiagnostics {
  progress: TimelineProgressDiagnostics;
  display: TimelineDisplayDiagnostics;
  key: TimelineKeyDiagnostics;
  checks: TimelineCheck[];
  allChecksPassed: boolean;
}

function hasValidDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sanitizeCurrentTime(currentTime: number): number {
  // Mirrors `this.#video.currentTime || 0`: NaN falls back to 0.
  return Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
}

/**
 * Selects the visible progress time using the exact branch order of
 * `#getVisualProgressTime`: invalid duration -> scrub lock -> pause freeze ->
 * non-advancing fallback to currentTime -> playing estimate.
 */
export function selectVisualProgressTime(snapshot: TimelineSnapshot): { time: number; source: VisualProgressSource } {
  const { duration } = snapshot;

  if (!hasValidDuration(duration)) {
    // Degraded path: never emit NaN/Infinity; report 0 and let the checks explain.
    return { time: 0, source: 'current-time' };
  }

  if (snapshot.scrubTargetTime !== null) {
    return { time: snapshot.scrubTargetTime, source: 'scrub-target' };
  }

  if (snapshot.pauseFrozenProgressPercent !== null) {
    // #freezeRenderedProgressForPause sets pausedVisualProgressTime = percent * duration.
    return { time: snapshot.pauseFrozenProgressPercent * duration, source: 'pause-frozen' };
  }

  const currentTime = sanitizeCurrentTime(snapshot.currentTime);
  const isAdvancing =
    !snapshot.paused &&
    (!snapshot.ended || snapshot.loop) &&
    snapshot.readyState >= HAVE_FUTURE_DATA;

  if (!isAdvancing) {
    return { time: currentTime, source: 'current-time' };
  }

  // Buffering / not yet settled / initial estimate hold all fall back to the
  // live currentTime, matching the early returns in #getVisualProgressTime.
  if (snapshot.isBuffering || !snapshot.hasInitialProgressSettled || snapshot.isInitialEstimateLocked === true) {
    return { time: currentTime, source: 'current-time' };
  }

  const baseTime = Number.isFinite(snapshot.visualProgressTime)
    ? (snapshot.visualProgressTime as number)
    : currentTime;
  const elapsed = Number.isFinite(snapshot.estimateElapsedSeconds)
    ? (snapshot.estimateElapsedSeconds as number)
    : 0;
  const estimatedTime = baseTime + elapsed;
  const visualTime = snapshot.loop
    ? estimatedTime % duration
    : Math.min(estimatedTime, duration);

  // Large drift between the estimate and the real clock re-syncs to currentTime.
  if (!snapshot.loop && snapshot.currentTime - visualTime > 0.45) {
    return { time: currentTime, source: 'current-time' };
  }

  return { time: visualTime, source: 'estimate' };
}

/** Display text, mirroring #formatTimeForDisplay (including remaining-time mode). */
export function formatDisplayTime(snapshot: TimelineSnapshot, time: number): string {
  if (!snapshot.showRemainingTime) return formatVideoTime(time);
  const duration = Number.isFinite(snapshot.duration) ? snapshot.duration : 0;
  if (duration <= 0) return formatVideoTime(time);
  return `-${formatVideoTime(Math.max(0, duration - time))}`;
}

function diagnoseKey(
  snapshot: TimelineSnapshot,
  hasDuration: boolean,
  visualTime: number,
): TimelineKeyDiagnostics {
  const descriptor = snapshot.key;
  const idle: Omit<TimelineKeyDiagnostics, 'key' | 'handler'> = {
    consumed: false,
    togglesPlayback: false,
    playbackAction: 'none',
    resultingPlaybackState: null,
    targetCurrentTime: null,
  };

  if (descriptor.isPlayerSurfaceTarget) {
    const key = descriptor.key.toLowerCase();
    const isToggle = key === ' ' || key === 'spacebar' || key === 'enter' || key === 'k' || key === 'mediaplaypause';
    const isPlay = key === 'mediaplay';
    const isPause = key === 'mediapause';

    // #handlePlayerKeyDown ignores repeats and unrecognized keys entirely.
    if (descriptor.repeat || (!isToggle && !isPlay && !isPause)) {
      return { key: descriptor.key, handler: 'player-surface', ...idle };
    }

    const pausedOrEnded = snapshot.paused || descriptor.ended;

    // MediaPlay on an already-playing video / MediaPause on an already-paused
    // video is still consumed but triggers no action.
    if ((isPlay && !pausedOrEnded) || (isPause && pausedOrEnded)) {
      return { key: descriptor.key, handler: 'player-surface', ...idle, consumed: true };
    }

    // #handleButtonClick: shouldPlay = paused || ended.
    const shouldPlay = isPlay || (isToggle && pausedOrEnded);
    return {
      key: descriptor.key,
      handler: 'player-surface',
      consumed: true,
      togglesPlayback: true,
      playbackAction: shouldPlay ? 'play' : 'pause',
      resultingPlaybackState: shouldPlay ? 'playing' : 'paused',
      targetCurrentTime: null,
    };
  }

  // Progress-track handler (#handleProgressKeyDown).
  if (!hasDuration || !PROGRESS_TRACK_KEYS.includes(descriptor.key as (typeof PROGRESS_TRACK_KEYS)[number])) {
    return { key: descriptor.key, handler: 'progress-track', ...idle };
  }

  const { duration } = snapshot;
  const smallStep = descriptor.shiftKey ? 10 : 5;
  const largeStep = Math.max(10, duration * 0.1);
  const nextTime =
    descriptor.key === 'Home'
      ? 0
      : descriptor.key === 'End'
        ? duration
        : descriptor.key === 'PageUp'
          ? visualTime + largeStep
          : descriptor.key === 'PageDown'
            ? visualTime - largeStep
            : visualTime + (descriptor.key === 'ArrowRight' ? smallStep : -smallStep);

  return {
    key: descriptor.key,
    handler: 'progress-track',
    consumed: true,
    togglesPlayback: false,
    playbackAction: 'none',
    resultingPlaybackState: null,
    targetCurrentTime: Math.min(duration, Math.max(0, nextTime)),
  };
}

function buildChecks(
  snapshot: TimelineSnapshot,
  hasDuration: boolean,
  progress: TimelineProgressDiagnostics,
  display: TimelineDisplayDiagnostics,
  key: TimelineKeyDiagnostics,
): TimelineCheck[] {
  const checks: TimelineCheck[] = [];
  const push = (name: string, passed: boolean, reason: string | null = null) => {
    checks.push({ name, passed, reason: passed ? null : reason });
  };

  push(
    'duration-valid',
    hasDuration,
    `duration 非正或非有限（实际为 ${String(snapshot.duration)}），可视进度时间、百分比与 aria 值已降级为 0`,
  );

  const numericOutputs: Array<[string, number | null]> = [
    ['progress.time', progress.time],
    ['progress.percent', progress.percent],
    ['progress.ariaValueNow', progress.ariaValueNow],
    ['key.targetCurrentTime', key.targetCurrentTime],
  ];
  const nonFinite = numericOutputs
    .filter((entry): entry is [string, number] => entry[1] !== null && !Number.isFinite(entry[1]))
    .map(([name]) => name);
  push(
    'no-non-finite-output',
    nonFinite.length === 0,
    `输出包含 NaN 或 Infinity：${nonFinite.join(', ')}`,
  );

  const scrubLocked = snapshot.scrubTargetTime !== null;
  push(
    'scrub-lock-priority',
    !scrubLocked || (progress.source === 'scrub-target' && progress.time === snapshot.scrubTargetTime),
    'scrub 锁定期间必须使用 scrub 目标时间，不得使用暂停冻结值或其他来源',
  );

  const lowerKey = snapshot.key.key.toLowerCase();
  const isSurfaceToggleKey =
    lowerKey === ' ' || lowerKey === 'spacebar' || lowerKey === 'enter' || lowerKey === 'k' ||
    lowerKey === 'mediaplaypause' || lowerKey === 'mediaplay' || lowerKey === 'mediapause';
  push(
    'repeat-key-not-consumed',
    !(snapshot.key.repeat && snapshot.key.isPlayerSurfaceTarget && isSurfaceToggleKey) || !key.consumed,
    'repeat 为真的按键不得被消费',
  );

  const isSurfaceOnlyToggleKey = lowerKey === ' ' || lowerKey === 'spacebar' || lowerKey === 'enter' || lowerKey === 'k';
  push(
    'non-surface-key-no-toggle',
    snapshot.key.isPlayerSurfaceTarget || !isSurfaceOnlyToggleKey || !key.togglesPlayback,
    '事件目标不是播放器表面时 Space/Enter/K 不得触发播放切换',
  );

  push(
    'ended-estimate-within-duration',
    !(snapshot.ended && !snapshot.loop) || progress.source !== 'estimate' || progress.time <= snapshot.duration,
    'ended 为真且 loop 为假时估算时间不得超过 duration',
  );

  push(
    'key-target-clamped',
    key.targetCurrentTime === null ||
      (hasDuration && key.targetCurrentTime >= 0 && key.targetCurrentTime <= snapshot.duration),
    hasDuration
      ? '按键后的目标 currentTime 必须夹取到 [0, duration]'
      : 'duration 非正或非有限时进度按键不得产生目标时间',
  );

  const expectsRemaining = snapshot.showRemainingTime && hasDuration;
  push(
    'remaining-time-format',
    !expectsRemaining || display.text === `-${formatVideoTime(Math.max(0, snapshot.duration - progress.time))}`,
    '剩余时间模式下显示文本必须为 "-" 加剩余时长',
  );

  return checks;
}

/**
 * Runs the full timeline & keyboard diagnostic over a plain-data snapshot.
 * Pure: no DOM, no I/O, no timers; the result is JSON-serializable.
 */
export function diagnoseTimeline(snapshot: TimelineSnapshot): TimelineDiagnostics {
  const hasDuration = hasValidDuration(snapshot.duration);
  const { time, source } = selectVisualProgressTime(snapshot);

  const renderedTime = hasDuration ? Math.min(snapshot.duration, Math.max(0, time)) : 0;
  const progress: TimelineProgressDiagnostics = {
    time,
    source,
    percent: hasDuration ? clamp01(time / snapshot.duration) : 0,
    ariaValueNow: hasDuration ? renderedTime : 0,
    ariaValueText: hasDuration
      ? `${formatVideoTime(renderedTime)} of ${formatVideoTime(snapshot.duration)}`
      : 'Loading video',
  };

  const display: TimelineDisplayDiagnostics = {
    text: formatDisplayTime(snapshot, time),
    isRemaining: snapshot.showRemainingTime && hasDuration,
  };

  const key = diagnoseKey(snapshot, hasDuration, time);
  const checks = buildChecks(snapshot, hasDuration, progress, display, key);

  return {
    progress,
    display,
    key,
    checks,
    allChecksPassed: checks.every((check) => check.passed),
  };
}

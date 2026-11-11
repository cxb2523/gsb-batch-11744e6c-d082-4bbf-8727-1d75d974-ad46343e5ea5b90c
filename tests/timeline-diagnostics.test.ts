import test from 'node:test';
import assert from 'node:assert/strict';

import { formatVideoTime } from '../src/player/media.ts';
import {
  diagnoseTimeline,
  selectVisualProgressTime,
  type TimelineKeyDescriptor,
  type TimelineSnapshot,
} from '../src/player/timeline-diagnostics.ts';

const PROGRESS_KEY: TimelineKeyDescriptor = {
  key: 'ArrowRight',
  shiftKey: false,
  repeat: false,
  isPlayerSurfaceTarget: false,
  ended: false,
};

function makeSnapshot(overrides: Partial<TimelineSnapshot> = {}): TimelineSnapshot {
  return {
    duration: 120,
    currentTime: 30,
    paused: false,
    ended: false,
    loop: false,
    readyState: 4,
    isBuffering: false,
    hasInitialProgressSettled: true,
    scrubTargetTime: null,
    pauseFrozenProgressPercent: null,
    showRemainingTime: false,
    key: { ...PROGRESS_KEY },
    ...overrides,
  };
}

function checkByName(result: ReturnType<typeof diagnoseTimeline>, name: string) {
  const check = result.checks.find((entry) => entry.name === name);
  assert.ok(check, `expected a check named ${name}`);
  if (!check) throw new Error(`missing check ${name}`);
  return check;
}

test('playing snapshot uses the playing estimate and matches formatVideoTime', () => {
  const result = diagnoseTimeline(makeSnapshot({
    visualProgressTime: 30,
    estimateElapsedSeconds: 2,
  }));

  assert.equal(result.progress.source, 'estimate');
  assert.equal(result.progress.time, 32);
  assert.equal(result.progress.percent, 32 / 120);
  assert.equal(result.progress.ariaValueNow, 32);
  assert.equal(result.progress.ariaValueText, `${formatVideoTime(32)} of ${formatVideoTime(120)}`);
  assert.equal(result.display.text, formatVideoTime(32));
  assert.equal(result.display.isRemaining, false);
  assert.equal(result.allChecksPassed, true, JSON.stringify(result.checks, null, 2));
});

test('pause-frozen snapshot uses the frozen percent and ignores the live clock', () => {
  const result = diagnoseTimeline(makeSnapshot({
    paused: true,
    currentTime: 12,
    pauseFrozenProgressPercent: 0.5,
    showRemainingTime: true,
  }));

  assert.equal(result.progress.source, 'pause-frozen');
  assert.equal(result.progress.time, 60);
  assert.equal(result.progress.percent, 0.5);
  assert.equal(result.progress.ariaValueText, `${formatVideoTime(60)} of ${formatVideoTime(120)}`);
  // Remaining-time mode: "-" plus the remaining duration.
  assert.equal(result.display.text, `-${formatVideoTime(120 - 60)}`);
  assert.equal(result.display.isRemaining, true);
  assert.equal(result.allChecksPassed, true, JSON.stringify(result.checks, null, 2));
});

test('scrub lock wins over the pause-frozen value', () => {
  const result = diagnoseTimeline(makeSnapshot({
    paused: true,
    scrubTargetTime: 42,
    pauseFrozenProgressPercent: 0.9,
  }));

  assert.equal(result.progress.source, 'scrub-target');
  assert.equal(result.progress.time, 42);
  assert.equal(result.display.text, formatVideoTime(42));
  assert.equal(result.allChecksPassed, true, JSON.stringify(result.checks, null, 2));
});

test('non-advancing snapshot falls back to live currentTime', () => {
  const result = diagnoseTimeline(makeSnapshot({ paused: true, currentTime: 12.5 }));
  assert.equal(result.progress.source, 'current-time');
  assert.equal(result.progress.time, 12.5);
  assert.equal(result.allChecksPassed, true, JSON.stringify(result.checks, null, 2));
});

test('source priority order matches #getVisualProgressTime', () => {
  // Scrub lock beats everything else.
  assert.equal(selectVisualProgressTime(makeSnapshot({ scrubTargetTime: 5, pauseFrozenProgressPercent: 0.5 })).source, 'scrub-target');
  // Pause freeze beats the non-advancing fallback.
  assert.equal(selectVisualProgressTime(makeSnapshot({ paused: true, pauseFrozenProgressPercent: 0.5 })).source, 'pause-frozen');
  // Buffering while playing falls back to currentTime instead of estimating.
  assert.equal(selectVisualProgressTime(makeSnapshot({ isBuffering: true })).source, 'current-time');
  // Not yet settled while playing falls back to currentTime.
  assert.equal(selectVisualProgressTime(makeSnapshot({ hasInitialProgressSettled: false })).source, 'current-time');
  // ReadyState below HAVE_FUTURE_DATA is not advancing.
  assert.equal(selectVisualProgressTime(makeSnapshot({ readyState: 2 })).source, 'current-time');
  // Ended without loop is not advancing; with loop it estimates modulo duration.
  assert.equal(selectVisualProgressTime(makeSnapshot({ ended: true })).source, 'current-time');
  const looping = selectVisualProgressTime(makeSnapshot({ ended: true, loop: true, visualProgressTime: 118, estimateElapsedSeconds: 5 }));
  assert.equal(looping.source, 'estimate');
  assert.equal(looping.time, 3);
});

test('duration of 0 degrades to zeroed output without throwing', () => {
  const result = diagnoseTimeline(makeSnapshot({ duration: 0 }));

  assert.equal(result.progress.time, 0);
  assert.equal(result.progress.percent, 0);
  assert.equal(result.progress.ariaValueNow, 0);
  assert.equal(result.progress.ariaValueText, 'Loading video');
  assert.equal(result.display.text, formatVideoTime(0));
  assert.equal(Number.isFinite(result.progress.time), true);
  assert.equal(Number.isFinite(result.progress.percent), true);

  const durationCheck = checkByName(result, 'duration-valid');
  assert.equal(durationCheck.passed, false);
  assert.match(durationCheck.reason ?? '', /duration/);
  assert.equal(checkByName(result, 'no-non-finite-output').passed, true);
  assert.equal(result.allChecksPassed, false);
});

test('NaN duration degrades to zeroed output without throwing', () => {
  const result = diagnoseTimeline(makeSnapshot({ duration: Number.NaN }));

  assert.equal(result.progress.time, 0);
  assert.equal(result.progress.percent, 0);
  assert.equal(result.progress.ariaValueNow, 0);
  assert.equal(result.progress.ariaValueText, 'Loading video');
  assert.equal(checkByName(result, 'duration-valid').passed, false);
  assert.equal(checkByName(result, 'no-non-finite-output').passed, true);
  // Progress keys must not be consumed when duration is invalid.
  assert.equal(result.key.consumed, false);
  assert.equal(result.key.targetCurrentTime, null);
});

test('PageUp uses max(10, duration * 0.1) and clamps to duration', () => {
  // Short duration: 10% of 30s is 3s, so the 10s floor applies; 25 + 10 clamps to 30.
  const short = diagnoseTimeline(makeSnapshot({
    duration: 30,
    currentTime: 25,
    paused: true,
    key: { ...PROGRESS_KEY, key: 'PageUp' },
  }));
  assert.equal(short.key.consumed, true);
  assert.equal(short.key.targetCurrentTime, 30);

  // Long duration: 10% of 200s is 20s, larger than the 10s floor.
  const long = diagnoseTimeline(makeSnapshot({
    duration: 200,
    currentTime: 25,
    paused: true,
    key: { ...PROGRESS_KEY, key: 'PageUp' },
  }));
  assert.equal(long.key.targetCurrentTime, 45);

  // PageDown clamps at 0.
  const down = diagnoseTimeline(makeSnapshot({
    duration: 30,
    currentTime: 5,
    paused: true,
    key: { ...PROGRESS_KEY, key: 'PageDown' },
  }));
  assert.equal(down.key.targetCurrentTime, 0);
});

test('Home and End land exactly on 0 and duration', () => {
  const home = diagnoseTimeline(makeSnapshot({ key: { ...PROGRESS_KEY, key: 'Home' } }));
  assert.equal(home.key.targetCurrentTime, 0);

  const end = diagnoseTimeline(makeSnapshot({ key: { ...PROGRESS_KEY, key: 'End' } }));
  assert.equal(end.key.targetCurrentTime, 120);
});

test('arrow keys step by 5, or 10 with shiftKey, clamped to [0, duration]', () => {
  const left = diagnoseTimeline(makeSnapshot({ currentTime: 3, paused: true, key: { ...PROGRESS_KEY, key: 'ArrowLeft' } }));
  assert.equal(left.key.targetCurrentTime, 0); // 3 - 5 clamps to 0

  const shiftRight = diagnoseTimeline(makeSnapshot({
    currentTime: 115,
    paused: true,
    key: { ...PROGRESS_KEY, key: 'ArrowRight', shiftKey: true },
  }));
  assert.equal(shiftRight.key.targetCurrentTime, 120); // 115 + 10 clamps to duration
});

test('player surface toggles playback; repeat keys are not consumed', () => {
  const toggle = diagnoseTimeline(makeSnapshot({
    paused: true,
    key: { key: 'k', shiftKey: false, repeat: false, isPlayerSurfaceTarget: true, ended: false },
  }));
  assert.equal(toggle.key.consumed, true);
  assert.equal(toggle.key.togglesPlayback, true);
  assert.equal(toggle.key.playbackAction, 'play');
  assert.equal(toggle.key.resultingPlaybackState, 'playing');
  assert.equal(toggle.key.targetCurrentTime, null);

  const repeat = diagnoseTimeline(makeSnapshot({
    paused: true,
    key: { key: 'k', shiftKey: false, repeat: true, isPlayerSurfaceTarget: true, ended: false },
  }));
  assert.equal(repeat.key.consumed, false);
  assert.equal(repeat.key.togglesPlayback, false);
  assert.equal(checkByName(repeat, 'repeat-key-not-consumed').passed, true);
});

test('Space/Enter/K off the player surface never toggle playback', () => {
  for (const key of [' ', 'Enter', 'k']) {
    const result = diagnoseTimeline(makeSnapshot({
      paused: true,
      key: { key, shiftKey: false, repeat: false, isPlayerSurfaceTarget: false, ended: false },
    }));
    assert.equal(result.key.togglesPlayback, false, `key ${JSON.stringify(key)} must not toggle`);
    assert.equal(result.key.consumed, false);
    assert.equal(checkByName(result, 'non-surface-key-no-toggle').passed, true);
  }
});

test('ended without loop never estimates past duration', () => {
  const result = diagnoseTimeline(makeSnapshot({
    ended: true,
    loop: false,
    paused: false,
    currentTime: 120,
    visualProgressTime: 118,
    estimateElapsedSeconds: 10,
  }));
  assert.notEqual(result.progress.source, 'estimate');
  assert.ok(result.progress.time <= 120);
  assert.equal(checkByName(result, 'ended-estimate-within-duration').passed, true);
});

test('diagnostics object survives JSON.stringify round-trip', () => {
  const snapshots = [
    makeSnapshot({ visualProgressTime: 30, estimateElapsedSeconds: 2 }),
    makeSnapshot({ duration: 0 }),
    makeSnapshot({ duration: Number.NaN }),
    makeSnapshot({ paused: true, pauseFrozenProgressPercent: 0.5, showRemainingTime: true }),
  ];

  for (const snapshot of snapshots) {
    const result = diagnoseTimeline(snapshot);
    const serialized = JSON.stringify(result);
    assert.equal(typeof serialized, 'string');
    assert.deepEqual(JSON.parse(serialized), JSON.parse(JSON.stringify(result)));
    // No functions or element references anywhere in the output.
    assert.equal(/function|HTMLElement|undefined/.test(serialized), false, serialized);
  }
});

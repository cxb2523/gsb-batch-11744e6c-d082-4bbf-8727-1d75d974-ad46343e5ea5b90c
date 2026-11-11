import type { ThreadKind } from '../chapter/data';
import type { Voice } from './types';

/** Pure, dependency-free audio logic: scales, melodies, chords, babble syllables and the voice
 * budget. Nothing here touches WebAudio, so it is unit-tested in node (tests/audio.test.ts).
 * Everything lives in C major pentatonic (C D E G A) so that thread melodies, the intermittent
 * ambient phrases, sparkles and the finale all stay consonant no matter what plays together. */

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Small seeded PRNG so melodies, babble and tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

// ---------------------------------------------------------------- scale & melody
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Semitones above the scale root for a (possibly negative) pentatonic scale index. */
export function scaleSemitones(index: number): number {
  const whole = Math.floor(index);
  const octave = Math.floor(whole / PENTATONIC.length);
  const degree = ((whole % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length;
  return PENTATONIC[degree] + 12 * octave;
}

export type Timbre = 'bell' | 'marimba' | 'celesta' | 'flute' | 'kalimba';

/** Per-kind register and timbre. `base` is always a C so every melody shares one key. */
export const THREAD_VOICING: Record<ThreadKind, { base: number; offset: number; timbre: Timbre; order: number }> = {
  power: { base: 72, offset: 0, timbre: 'bell', order: 0 },
  water: { base: 60, offset: 1, timbre: 'marimba', order: 1 },
  lights: { base: 72, offset: 2, timbre: 'celesta', order: 2 },
  voice: { base: 60, offset: 3, timbre: 'flute', order: 3 },
  root: { base: 48, offset: 4, timbre: 'kalimba', order: 0 },
};

/** Four eight-note phrases (scale indices). End of each phrase is within one scale step of the
 * start of the next, so walking produces a continuous, singable tune rather than random notes. */
export const MELODY_PHRASES: readonly (readonly number[])[] = [
  [2, 3, 4, 3, 2, 1, 2, 0],
  [0, 1, 2, 3, 2, 3, 4, 3],
  [4, 3, 2, 3, 1, 2, 0, 1],
  [2, 4, 3, 2, 3, 5, 4, 3],
];

/** Scale index (relative, before kind offset) of the n-th step of a thread's tune. */
export function melodyDegree(step: number, order = 0): number {
  const n = Math.max(0, Math.floor(Number.isFinite(step) ? step : 0));
  const phrase = Math.floor(n / 8);
  const motif = MELODY_PHRASES[(phrase + order) % MELODY_PHRASES.length];
  // Every second time round the four phrases the tune lifts a step for variety.
  const lift = Math.floor(phrase / MELODY_PHRASES.length) % 2;
  return motif[n % 8] + lift;
}

export function threadNoteMidi(step: number, kind: ThreadKind): number {
  const voicing = THREAD_VOICING[kind];
  return voicing.base + scaleSemitones(melodyDegree(step, voicing.order) + voicing.offset);
}

export const threadNoteFreq = (step: number, kind: ThreadKind): number => midiToFreq(threadNoteMidi(step, kind));

// ---------------------------------------------------------------- ambient harmony & phrases
interface PadChord { name: string; root: number; fifth: number; ninth: number; third: number; seventh: number; sparkle: number }

/** C, Am, F, G(6/9): all diatonic, so every pentatonic note stays consonant over each. The
 * progression keeps ticking as a slow harmonic clock; the intermittent phrases borrow from it. */
export const PAD_CHORDS: readonly PadChord[] = [
  { name: 'C', root: 48, fifth: 55, ninth: 62, third: 64, seventh: 71, sparkle: 79 },
  { name: 'Am', root: 45, fifth: 52, ninth: 59, third: 60, seventh: 67, sparkle: 76 },
  { name: 'F', root: 41, fifth: 48, ninth: 55, third: 57, seventh: 64, sparkle: 72 },
  { name: 'G', root: 43, fifth: 50, ninth: 57, third: 59, seventh: 64, sparkle: 74 },
];
export const PAD_CHORD_SECONDS = 16;
export const nextChordIndex = (index: number): number => (index + 1) % PAD_CHORDS.length;

export interface PhraseNote { midi: number; offset: number; velocity: number }
export const PHRASE_MIN_GAP = 0.22;
export const PHRASE_MAX_GAP = 0.4;

/** Seconds until the next phrase: dense enough to feel alive, always inside the 7–13 s window. */
export const phraseInterval = (life: number, rng: () => number): number => {
  const l = clamp(Number.isFinite(life) ? life : 0);
  const shortest = lerp(9.5, 7, l);
  return shortest + rng() * (13 - shortest);
};

const uniqueSorted = (notes: readonly number[]): number[] => [...new Set(notes)].sort((a, b) => a - b);

/** The current chord plus its octave above; the paper world only gets root/fifth/octave. */
function phrasePool(chord: PadChord, life: number): number[] {
  if (life <= 0) return uniqueSorted([chord.root, chord.fifth, chord.root + 12]);
  const tones = uniqueSorted([chord.root, chord.fifth, chord.ninth, chord.third, chord.seventh, chord.sparkle]);
  return uniqueSorted([...tones, ...tones.map(midi => midi + 12)]);
}

/** A 3–6 note music-box phrase: chord tones climbing by adjacent steps, then a gentle fall.
 * It grows longer and reaches higher as `life` rises; at life 0 it stays on root/fifth/octave. */
export function phraseNotes(chordIndex: number, life: number, rng: () => number): PhraseNote[] {
  const l = clamp(Number.isFinite(life) ? life : 0);
  const index = Number.isFinite(chordIndex) ? Math.floor(chordIndex) : 0;
  const chord = PAD_CHORDS[((index % PAD_CHORDS.length) + PAD_CHORDS.length) % PAD_CHORDS.length];
  const pool = phrasePool(chord, l);
  const maxCount = 3 + Math.round(3 * l);
  const count = 3 + Math.floor(rng() * (maxCount - 2));
  const runLength = count - 1;
  const maxStart = Math.max(0, pool.length - runLength);
  // Paper-world phrases sit low; the register opens up as the planet revives.
  const spread = 0.75 + 0.25 * l;
  const start = Math.min(maxStart, Math.floor(rng() * (maxStart + 1) * spread));
  const run = pool.slice(start, start + runLength);
  const peak = run[run.length - 1];
  const lower = pool.filter(midi => midi < peak && midi >= run[0]);
  const settle = lower.length ? lower[lower.length - 1] : run[0];
  const velocity = lerp(0.2, 0.32, l);
  const gapHigh = lerp(PHRASE_MAX_GAP, 0.32, l);
  const notes: PhraseNote[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    notes.push({ midi: i < runLength ? run[i] : settle, offset, velocity: velocity * (0.9 + rng() * 0.2) });
    if (i < count - 1) offset += PHRASE_MIN_GAP + rng() * (gapHigh - PHRASE_MIN_GAP);
  }
  return notes;
}

/** Seconds until the next random twinkle: sparse, and rarer still so it never fights a phrase. */
export const sparkleInterval = (life: number, rng: () => number): number => {
  const l = clamp(life);
  return lerp(18, 9, l) + rng() * lerp(18, 8, l);
};
export function pickSparkleMidi(life: number, rng: () => number): number {
  const pool = life < 0.3 ? [67, 72, 79] : life < 0.7 ? [72, 74, 76, 79, 81, 84] : [74, 76, 79, 81, 84, 86, 88, 91];
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
export const sparkleVelocity = (life: number): number => lerp(0.18, 0.36, clamp(life));

// ---------------------------------------------------------------- finale melody
export interface MelodyNote { midi: number; t: number; dur: number; vel: number }
/** Chapter-complete theme (about nine seconds). Three phrases over C, Am, F, then home to C. */
export const CHAPTER_MELODY: readonly MelodyNote[] = [
  { midi: 76, t: 0.0, dur: 0.6, vel: 0.7 }, { midi: 79, t: 0.45, dur: 0.6, vel: 0.7 }, { midi: 81, t: 0.9, dur: 0.6, vel: 0.75 },
  { midi: 79, t: 1.35, dur: 0.6, vel: 0.65 }, { midi: 76, t: 1.8, dur: 1.2, vel: 0.7 },
  { midi: 74, t: 2.85, dur: 0.6, vel: 0.65 }, { midi: 76, t: 3.3, dur: 0.6, vel: 0.7 }, { midi: 79, t: 3.75, dur: 0.6, vel: 0.75 },
  { midi: 81, t: 4.2, dur: 0.6, vel: 0.75 }, { midi: 84, t: 4.65, dur: 1.5, vel: 0.85 },
  { midi: 81, t: 6.3, dur: 0.5, vel: 0.65 }, { midi: 79, t: 6.7, dur: 0.5, vel: 0.65 }, { midi: 76, t: 7.1, dur: 0.5, vel: 0.65 },
  { midi: 79, t: 7.5, dur: 0.6, vel: 0.7 }, { midi: 84, t: 8.1, dur: 2.6, vel: 0.9 },
];
export const CHAPTER_CHORDS: readonly { t: number; dur: number; midis: readonly number[] }[] = [
  { t: 0, dur: 3.2, midis: [48, 55, 64] },
  { t: 2.8, dur: 3.6, midis: [45, 52, 60, 67] },
  { t: 6.2, dur: 2.2, midis: [41, 48, 57, 64] },
  { t: 8.0, dur: 4.8, midis: [48, 55, 64, 71] },
];

// ---------------------------------------------------------------- dialogue babble
/** Rough [F1, F2] formant pairs for a e i o u. */
export const VOWELS: readonly (readonly [number, number])[] = [[800, 1250], [550, 1800], [330, 2300], [520, 950], [360, 800]];

export interface VoiceProfile {
  base: number;
  wave: 'sawtooth' | 'triangle' | 'square';
  /** Scales both formants (bigger = smaller/brighter mouth). */
  formant: number;
  dur: readonly [number, number];
  gap: readonly [number, number];
  /** Chance a syllable is followed by an extra word-break pause, and how long it is. */
  wordBreak: number;
  wordGap: number;
  shape: 'speech' | 'meow';
  gain: number;
}
export const VOICE_PROFILES: Record<Voice, VoiceProfile> = {
  low: { base: 112, wave: 'sawtooth', formant: 0.88, dur: [0.07, 0.11], gap: [0.02, 0.05], wordBreak: 0.16, wordGap: 0.09, shape: 'speech', gain: 1 },
  mid: { base: 172, wave: 'sawtooth', formant: 1, dur: [0.065, 0.1], gap: [0.02, 0.05], wordBreak: 0.16, wordGap: 0.08, shape: 'speech', gain: 0.95 },
  high: { base: 262, wave: 'sawtooth', formant: 1.12, dur: [0.06, 0.095], gap: [0.02, 0.045], wordBreak: 0.18, wordGap: 0.08, shape: 'speech', gain: 0.85 },
  child: { base: 392, wave: 'triangle', formant: 1.28, dur: [0.05, 0.085], gap: [0.018, 0.04], wordBreak: 0.2, wordGap: 0.07, shape: 'speech', gain: 1.1 },
  cat: { base: 560, wave: 'sawtooth', formant: 1, dur: [0.2, 0.32], gap: [0.28, 0.6], wordBreak: 0, wordGap: 0, shape: 'meow', gain: 0.8 },
};

export interface Syllable {
  freq: number; peakFreq: number; endFreq: number;
  dur: number; gap: number;
  /** Formant targets in Hz at the start and end of the syllable. */
  f1: number; f2: number; f1End: number; f2End: number;
  gain: number;
}

const WALK_STEPS = [-2, -1, -1, 0, 1, 1, 2] as const;
export const SYLLABLE_STEP_RANGE = [-4, 5] as const;

/** Endless stream of syllables for one voice; pitch drifts as a bounded random walk in semitones
 * so it sounds like babbling speech rather than a siren. */
export function createSyllableGenerator(voice: Voice, seed: number): () => Syllable {
  const profile = VOICE_PROFILES[voice];
  const rng = mulberry32(seed);
  let step = 0;
  return () => {
    if (profile.shape === 'meow') step = Math.floor(rng() * 6) - 2;
    else {
      step += WALK_STEPS[Math.floor(rng() * WALK_STEPS.length)];
      if (Math.abs(step) > 3 && rng() < 0.5) step -= Math.sign(step);
      step = clamp(step, SYLLABLE_STEP_RANGE[0], SYLLABLE_STEP_RANGE[1]);
    }
    const freq = profile.base * 2 ** (step / 12);
    const dur = lerp(profile.dur[0], profile.dur[1], rng());
    let gap = lerp(profile.gap[0], profile.gap[1], rng());
    if (rng() < profile.wordBreak) gap += profile.wordGap * (0.7 + rng() * 0.6);
    const vowel = Math.floor(rng() * VOWELS.length);
    let start: number, peak: number, end: number, vowelEnd = vowel;
    if (profile.shape === 'meow') {
      // "mi-ao": pitch arcs up then falls while the mouth opens from ee to ah.
      start = freq * 0.82; peak = freq * 1.28; end = freq * 0.8; vowelEnd = 0;
    } else {
      const glide = (rng() - 0.4) * 0.12;
      start = freq * 0.97; peak = freq * 1.03; end = freq * (1 + glide);
    }
    const from = profile.shape === 'meow' ? VOWELS[1] : VOWELS[vowel];
    const to = VOWELS[vowelEnd];
    return {
      freq: start, peakFreq: peak, endFreq: end, dur, gap,
      f1: from[0] * profile.formant, f2: from[1] * profile.formant,
      f1End: to[0] * profile.formant, f2End: to[1] * profile.formant,
      gain: profile.gain * (0.85 + rng() * 0.3),
    };
  };
}

// ---------------------------------------------------------------- voice budget
/** Caps simultaneous sounds so a burst of events can never overload the audio thread.
 * priority 0 (footsteps, twinkles) is dropped first, 1 is normal, 2 (UI, story beats) always fits. */
export class VoiceBudget {
  private ends: number[] = [];
  constructor(readonly capacity: number) {}
  active(now: number): number {
    this.ends = this.ends.filter(end => end > now);
    return this.ends.length;
  }
  limit(priority: number): number {
    return priority >= 2 ? Math.ceil(this.capacity * 1.35) : priority >= 1 ? this.capacity : Math.floor(this.capacity * 0.6);
  }
  acquire(now: number, duration: number, priority = 1): boolean {
    if (this.active(now) >= this.limit(priority)) return false;
    this.ends.push(now + Math.max(0.01, duration));
    return true;
  }
  reset(): void { this.ends = []; }
}

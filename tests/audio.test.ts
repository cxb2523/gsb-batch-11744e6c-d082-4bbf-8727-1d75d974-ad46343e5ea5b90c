import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSound } from '../src/audio/index.ts';
import {
  CHAPTER_MELODY, PAD_CHORDS, PENTATONIC, THREAD_VOICING, VOICE_PROFILES, VoiceBudget, createSyllableGenerator,
  melodyDegree, midiToFreq, mulberry32, nextChordIndex, phraseInterval, phraseNotes, pickSparkleMidi,
  scaleSemitones, sparkleInterval, threadNoteFreq, threadNoteMidi,
} from '../src/audio/theory.ts';
import { SampleBank } from '../src/audio/samples.ts';
import { SOUND_EVENTS, type UiSound, type Voice } from '../src/audio/types.ts';
import { THREAD_COLORS, type ThreadKind } from '../src/chapter/data.ts';

const KINDS = Object.keys(THREAD_COLORS) as ThreadKind[];
const PENTATONIC_CLASSES = new Set([0, 2, 4, 7, 9]);
const MAJOR_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const VOICES: Voice[] = ['low', 'mid', 'high', 'child', 'cat'];
const UI_SOUNDS: UiSound[] = ['click', 'open', 'close', 'paper', 'start', 'hover', 'toggle', 'shutter', 'stamp'];
const CHORD_VOICES = ['root', 'fifth', 'ninth', 'third', 'seventh', 'sparkle'] as const;

test('scale indices map onto C pentatonic, across octaves and below zero', () => {
  assert.deepEqual(PENTATONIC.map((_, i) => scaleSemitones(i)), [0, 2, 4, 7, 9]);
  assert.equal(scaleSemitones(5), 12);
  assert.equal(scaleSemitones(7), 16);
  assert.equal(scaleSemitones(-1), -3);
  assert.equal(scaleSemitones(-5), -12);
  assert.ok(Math.abs(midiToFreq(69) - 440) < 1e-9);
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3);
});

test('thread melodies stay in key, in range, and move like a tune', () => {
  for (const kind of KINDS) {
    let previous = threadNoteMidi(0, kind);
    for (let step = 0; step < 400; step++) {
      const midi = threadNoteMidi(step, kind);
      assert.ok(PENTATONIC_CLASSES.has(midi % 12), `${kind} step ${step} is ${midi}`);
      assert.ok(midi >= 40 && midi <= 100, `${kind} step ${step} out of range: ${midi}`);
      assert.ok(Math.abs(midi - previous) <= 7, `${kind} leaps ${previous}->${midi} at step ${step}`);
      assert.ok(Math.abs(threadNoteFreq(step, kind) - midiToFreq(midi)) < 1e-9);
      previous = midi;
    }
  }
});

test('every thread kind has its own timbre and its own tune', () => {
  assert.equal(new Set(KINDS.map(kind => THREAD_VOICING[kind].timbre)).size, KINDS.length);
  const tunes = KINDS.map(kind => Array.from({ length: 32 }, (_, step) => threadNoteMidi(step, kind)).join(','));
  assert.equal(new Set(tunes).size, KINDS.length);
  // Odd inputs never produce NaN notes.
  for (const step of [-5, 0.7, Number.NaN, Infinity]) assert.ok(Number.isFinite(threadNoteMidi(step, 'power')) || step === Infinity);
  assert.equal(melodyDegree(-3), melodyDegree(0));
});

test('the chord progression is diatonic to C major and advances in order', () => {
  for (const chord of PAD_CHORDS) {
    for (const voice of CHORD_VOICES) assert.ok(MAJOR_CLASSES.has(chord[voice] % 12), `${chord.name}.${voice}`);
    assert.equal(chord.fifth - chord.root, 7, `${chord.name} fifth`);
  }
  assert.equal(nextChordIndex(0), 1);
  assert.equal(nextChordIndex(PAD_CHORDS.length - 1), 0, 'the progression wraps');
});

test('music-box phrases climb and settle, softly spaced within the current chord', () => {
  for (const life of [0, 0.25, 0.5, 0.75, 1]) {
    const rng = mulberry32(17);
    for (let i = 0; i < 200; i++) {
      const chordIndex = i % PAD_CHORDS.length;
      const chord = PAD_CHORDS[chordIndex];
      const chordClasses = new Set(CHORD_VOICES.map(voice => chord[voice] % 12));
      const notes = phraseNotes(chordIndex, life, rng);
      assert.ok(notes.length >= 3 && notes.length <= 6, `phrase has ${notes.length} notes`);
      assert.equal(notes[0].offset, 0);
      for (let n = 1; n < notes.length; n++) {
        const gap = notes[n].offset - notes[n - 1].offset;
        assert.ok(gap >= 0.22 - 1e-9 && gap <= 0.4 + 1e-9, `gap ${gap} at life ${life}`);
      }
      const midis = notes.map(note => note.midi);
      const peak = Math.max(...midis);
      const peakIndex = midis.indexOf(peak);
      assert.ok(peakIndex < midis.length - 1, 'the phrase settles after its peak');
      assert.ok(midis[midis.length - 1] < peak, 'the final note falls');
      for (let n = 1; n < midis.length - 1; n++) assert.ok(midis[n] > midis[n - 1], 'the run climbs stepwise');
      for (const note of notes) {
        assert.ok(chordClasses.has(note.midi % 12), `${chord.name} phrase note ${note.midi} is outside the chord`);
        assert.ok(note.velocity > 0.1 && note.velocity < 0.4, `soft velocity ${note.velocity}`);
      }
      if (life === 0) {
        const paper = new Set([chord.root % 12, chord.fifth % 12]);
        for (const midi of midis) assert.ok(paper.has(midi % 12), `paper-world note ${midi} should be root/fifth/octave`);
      }
    }
  }
});

test('phrases grow denser and brighter as life rises, arriving every 7–13 seconds', () => {
  const sample = (life: number) => {
    const rng = mulberry32(23);
    let noteCount = 0, pitchTotal = 0, pitchCount = 0;
    for (let i = 0; i < 300; i++) {
      const phrase = phraseNotes(i % PAD_CHORDS.length, life, rng);
      noteCount += phrase.length;
      for (const note of phrase) { pitchTotal += note.midi; pitchCount++; }
    }
    return { perPhrase: noteCount / 300, meanMidi: pitchTotal / pitchCount };
  };
  const paper = sample(0), revived = sample(1);
  assert.ok(revived.perPhrase > paper.perPhrase + 0.5, `${paper.perPhrase} -> ${revived.perPhrase} notes per phrase`);
  assert.ok(revived.meanMidi > paper.meanMidi, `${paper.meanMidi} -> ${revived.meanMidi} mean MIDI`);

  const intervalMean = (life: number) => {
    const rng = mulberry32(31);
    let total = 0;
    for (let i = 0; i < 500; i++) {
      const interval = phraseInterval(life, rng);
      assert.ok(interval >= 7 - 1e-9 && interval <= 13 + 1e-9, `interval ${interval}`);
      total += interval;
    }
    return total / 500;
  };
  assert.ok(intervalMean(1) < intervalMean(0), 'revived phrases come round a little sooner');
});

test('twinkles are sparse in the paper world and quicker once revived', () => {
  const rngA = mulberry32(5), rngB = mulberry32(5);
  const mean = (life: number, rng: () => number) => Array.from({ length: 200 }, () => sparkleInterval(life, rng)).reduce((a, b) => a + b, 0) / 200;
  assert.ok(mean(0, rngA) > 18, 'twinkles stay rare enough to leave room for phrases');
  assert.ok(mean(0, rngA) > mean(1, rngB) * 1.8);
  const rng = mulberry32(9);
  for (const life of [0, 0.5, 1]) for (let i = 0; i < 50; i++) assert.ok(PENTATONIC_CLASSES.has(pickSparkleMidi(life, rng) % 12));
});

test('the chapter-complete melody is in key and ends at home', () => {
  for (const note of CHAPTER_MELODY) assert.ok(PENTATONIC_CLASSES.has(note.midi % 12), `note ${note.midi}`);
  const last = CHAPTER_MELODY[CHAPTER_MELODY.length - 1];
  assert.equal(last.midi % 12, 0);
  for (let i = 1; i < CHAPTER_MELODY.length; i++) assert.ok(CHAPTER_MELODY[i].t > CHAPTER_MELODY[i - 1].t);
});

test('babble syllables are seeded, bounded and voice-shaped', () => {
  const a = createSyllableGenerator('mid', 42), b = createSyllableGenerator('mid', 42), c = createSyllableGenerator('mid', 43);
  const firstA = Array.from({ length: 10 }, a), firstB = Array.from({ length: 10 }, b), firstC = Array.from({ length: 10 }, c);
  assert.deepEqual(firstA, firstB);
  assert.notDeepEqual(firstA, firstC);
  const means: number[] = [];
  for (const voice of VOICES) {
    const profile = VOICE_PROFILES[voice], next = createSyllableGenerator(voice, 7);
    let total = 0;
    for (let i = 0; i < 300; i++) {
      const s = next();
      assert.ok(s.freq > profile.base * 0.5 && s.freq < profile.base * 1.6, `${voice} freq ${s.freq}`);
      assert.ok(s.peakFreq > 0 && s.endFreq > 0);
      assert.ok(s.dur >= profile.dur[0] - 1e-9 && s.dur <= profile.dur[1] + 1e-9, `${voice} dur ${s.dur}`);
      assert.ok(s.gap >= profile.gap[0] - 1e-9 && s.gap < profile.gap[1] + profile.wordGap * 1.3 + 1e-9);
      assert.ok(s.f1 > 200 && s.f2 > s.f1 * 0.9 && Number.isFinite(s.gain) && s.gain > 0);
      if (voice === 'cat') assert.ok(s.peakFreq > s.freq * 1.4 && s.endFreq < s.peakFreq, 'meow arcs up then falls');
      total += s.freq;
    }
    means.push(total / 300);
  }
  assert.deepEqual([...means].sort((x, y) => x - y), means, 'voices rise in pitch: low < mid < high < child < cat');
  // Speech pitch is a bounded walk, never a siren: consecutive syllables stay within a fifth.
  const next = createSyllableGenerator('low', 3);
  let previous = next().freq;
  for (let i = 0; i < 300; i++) { const f = next().freq; assert.ok(Math.abs(12 * Math.log2(f / previous)) <= 8, 'syllable jump'); previous = f; }
});

test('the voice budget caps simultaneous sounds by priority and frees them on time', () => {
  const budget = new VoiceBudget(10);
  let accepted = 0;
  for (let i = 0; i < 30; i++) if (budget.acquire(0, 1, 0)) accepted++;
  assert.equal(accepted, 6, 'background sounds are dropped first');
  accepted = 0;
  for (let i = 0; i < 30; i++) if (budget.acquire(0, 1, 1)) accepted++;
  assert.equal(accepted, 4, 'normal sounds fill up to capacity');
  assert.equal(budget.acquire(0, 1, 1), false);
  assert.equal(budget.acquire(0, 1, 2), true, 'essential sounds still fit');
  assert.equal(budget.active(0.5), 11);
  assert.equal(budget.active(1.5), 0, 'everything ended');
  assert.equal(budget.acquire(1.5, 1, 0), true);
});

test('sample registry registers without loading and rejects unknown events', () => {
  const bank = new SampleBank();
  assert.equal(bank.has('ui.click'), false);
  bank.register('ui.click', '/audio/click.ogg', { gain: 0.8 });
  assert.equal(bank.has('ui.click'), true);
  assert.equal(bank.url('ui.click'), '/audio/click.ogg');
  assert.equal(bank.ready('ui.click'), false, 'nothing is fetched until play/preload');
  assert.deepEqual(bank.registered(), ['ui.click']);
  assert.throws(() => bank.register('nope' as never, '/x.ogg'));
  bank.unregister('ui.click');
  assert.equal(bank.has('ui.click'), false);
  assert.ok(SOUND_EVENTS.includes('music.loop') && SOUND_EVENTS.includes('thread.taut'));
});

test('GameSound is a safe no-op when WebAudio is unavailable', async () => {
  assert.equal(typeof (globalThis as { AudioContext?: unknown }).AudioContext, 'undefined');
  const sound = new GameSound({ strict: true });
  const frame = { dt: 0.016, moving: 1, grounded: true, sprinting: true, water: true, verticalSpeed: 0, active: true, life: 0.5 };
  const everything = () => {
    sound.start(); sound.setEnabled(false); sound.setEnabled(true); sound.setPaused(true); sound.setPaused(false);
    for (const action of UI_SOUNDS) sound.ui(action);
    sound.update(frame); sound.update({ ...frame, grounded: false, verticalSpeed: 5 }); sound.update({ ...frame, active: false });
    for (const voice of VOICES) { sound.dialogue(voice); sound.update(frame); }
    sound.stopDialogue();
    for (const kind of KINDS) sound.threadStep(3, kind);
    sound.threadPickup(); sound.threadReel(); sound.threadTaut(); sound.connect(); sound.connect('water'); sound.revive(); sound.chapterComplete();
    sound.registerSample('ui.click', '/x.ogg'); sound.unregisterSample('ui.click');
    sound.dispose();
  };
  assert.doesNotThrow(everything);
  assert.doesNotThrow(everything, 'calls after dispose are still safe');
  assert.equal(sound.live, false);
  assert.equal(sound.started, true);
  assert.equal(sound.enabled, true);
  await sound.preloadSamples();
});

// ---------------------------------------------------------------- fake WebAudio context
function fakeParam() {
  const param = {
    value: 0, calls: 0,
    setValueAtTime() { param.calls++; return param; }, linearRampToValueAtTime() { param.calls++; return param; },
    exponentialRampToValueAtTime() { param.calls++; return param; }, setTargetAtTime() { param.calls++; return param; },
    cancelScheduledValues() { return param; },
  };
  return param;
}

/** A permissive stand-in for the WebAudio graph: enough to run every code path in node. */
function fakeContext() {
  const created: { kind: string; node: Record<string, unknown> }[] = [];
  let disconnects = 0;
  const makeNode = (kind: string) => {
    const store: Record<string, unknown> = { kind };
    const node: Record<string, unknown> = new Proxy(store, {
      get(target, property: string) {
        if (property === 'connect') return (destination: unknown) => destination;
        if (property === 'disconnect') return () => { disconnects++; };
        if (property === 'start' || property === 'stop') return () => {};
        if (property === 'then') return undefined;
        if (!(property in target)) target[property] = fakeParam();
        return target[property];
      },
      set(target, property: string, value) { target[property] = value; return true; },
    });
    created.push({ kind, node });
    return node;
  };
  const ctx: Record<string, unknown> = {
    state: 'running', currentTime: 0, sampleRate: 8000, destination: makeNode('destination'),
    createGain: () => makeNode('gain'), createOscillator: () => makeNode('osc'), createBiquadFilter: () => makeNode('biquad'),
    createDynamicsCompressor: () => makeNode('compressor'), createDelay: () => makeNode('delay'), createConvolver: () => makeNode('convolver'),
    createBufferSource: () => makeNode('source'), createStereoPanner: () => makeNode('panner'),
    createBuffer: (channels: number, length: number, rate: number) => ({
      duration: length / rate, sampleRate: rate, length, numberOfChannels: channels,
      getChannelData: () => new Float32Array(length),
    }),
    resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
  };
  return {
    ctx: ctx as unknown as AudioContext,
    raw: ctx,
    count: (kind: string) => created.filter(entry => entry.kind === kind).length,
    endAll: () => { for (const { node } of created) if (typeof node.onended === 'function') (node.onended as () => void)(); },
    disconnects: () => disconnects,
  };
}

test('the ambient beds hold no sustained pad oscillators', () => {
  const fake = fakeContext();
  const sound = new GameSound({ createContext: () => fake.ctx, strict: true });
  sound.start();
  sound.update({ dt: 0.016, moving: 0, grounded: true, sprinting: false, water: false, verticalSpeed: 0, active: true, life: 0.5 });
  assert.equal(fake.count('osc'), 3, 'only the sea, foam and wind swells oscillate');
  assert.equal(fake.count('source'), 3, 'and only the three noise beds run');
});

test('with a context, every sound builds a valid graph and cleans up after itself', () => {
  const fake = fakeContext();
  const sound = new GameSound({ createContext: () => fake.ctx, strict: true });
  sound.start();
  assert.equal(sound.live, true);
  assert.ok(fake.count('convolver') === 1 && fake.count('compressor') === 1, 'master chain exists once');
  const frame = { dt: 0.016, moving: 1, grounded: true, sprinting: false, water: false, verticalSpeed: 0, active: true, life: 0 };
  assert.doesNotThrow(() => {
    for (let i = 0; i < 400; i++) {
      const life = Math.min(1, i / 300);
      sound.update({ ...frame, life, water: i > 150 && i < 250, waterNear: i > 150 && i < 250 ? 0.8 : undefined, moving: i % 120 < 60 ? 1 : 0 });
    }
    sound.update({ ...frame, grounded: false, verticalSpeed: 4 });
    sound.update({ ...frame, grounded: false, verticalSpeed: -6 });
    sound.update({ ...frame, grounded: true });
    for (const action of UI_SOUNDS) sound.ui(action);
    for (const kind of KINDS) for (let step = 0; step < 6; step++) sound.threadStep(step, kind);
    sound.threadPickup(); sound.threadReel(); sound.threadTaut(); sound.connect(); sound.connect('lights'); sound.revive(); sound.chapterComplete();
    for (const voice of VOICES) { sound.dialogue(voice); for (let i = 0; i < 40; i++) sound.update(frame); }
    sound.stopDialogue();
    sound.setEnabled(false); sound.ui('click'); sound.setEnabled(true);
    sound.setPaused(true); sound.setPaused(false);
  });
  const oscillators = fake.count('osc');
  assert.ok(oscillators > 50, 'sounds were actually built');
  const before = fake.disconnects();
  fake.endAll();
  assert.ok(fake.disconnects() > before, 'ended sources disconnect their nodes');
  sound.dispose();
});

test('a flood of events at one instant is capped by the voice budget', () => {
  const fake = fakeContext();
  const sound = new GameSound({ createContext: () => fake.ctx, strict: true });
  sound.start();
  const baseline = fake.count('osc'); // beds are created lazily by update(), so none yet
  for (let i = 0; i < 500; i++) sound.threadStep(i, 'power');
  const notes = (fake.count('osc') - baseline) / 3; // bell = three partials per note
  assert.ok(notes <= 28, `at most the budget of notes, got ${notes}`);
  assert.ok(notes >= 20, 'but a normal burst is not silenced');
});

test('muted and paused states drop sounds instead of queueing them', () => {
  const fake = fakeContext();
  const sound = new GameSound({ createContext: () => fake.ctx, strict: true });
  sound.start();
  sound.setEnabled(false);
  const before = fake.count('osc');
  sound.ui('click'); sound.threadStep(0, 'water'); sound.connect();
  assert.equal(fake.count('osc'), before, 'muted: nothing scheduled');
  sound.setEnabled(true); sound.setPaused(true);
  sound.ui('click');
  assert.equal(fake.count('osc'), before, 'paused: nothing scheduled');
  sound.setPaused(false);
  sound.ui('click');
  assert.ok(fake.count('osc') > before, 'sound returns after resume');
});

test('nothing is created before a user gesture when the browser reports none', () => {
  const fake = fakeContext();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userActivation: { hasBeenActive: false } } });
  try {
    const sound = new GameSound({ createContext: () => fake.ctx, strict: true });
    sound.ui('click'); sound.update({ dt: 0.016, moving: 0, grounded: true });
    assert.equal(sound.live, false);
    assert.equal(fake.count('gain'), 0, 'no graph before a gesture');
    sound.start(); // start() is itself the gesture handler
    assert.equal(sound.live, true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
  }
});

test('a registered sample with no decoded buffer falls back to the synth', () => {
  const fake = fakeContext();
  const sound = new GameSound({ createContext: () => fake.ctx, strict: true });
  sound.start();
  sound.registerSample('ui.click', 'data:audio/wav;base64,');
  const before = fake.count('osc');
  sound.ui('click');
  assert.ok(fake.count('osc') > before, 'synth click still plays while the sample is not ready');
});

test('a context the browser keeps suspended (autoplay policy) drops sounds until it runs', async () => {
  const fake = fakeContext();
  fake.raw.state = 'suspended';
  fake.raw.resume = () => new Promise(() => {}); // Chrome leaves resume() pending without a gesture
  const sound = new GameSound({ createContext: () => fake.ctx, strict: true });
  sound.start();
  assert.equal(sound.live, true, 'optimistic while the resume request is pending');
  await new Promise(resolve => setTimeout(resolve, 520));
  assert.equal(sound.live, false, 'locked after the grace period');
  const before = fake.count('osc');
  sound.ui('click'); sound.threadStep(1, 'power');
  assert.equal(fake.count('osc'), before, 'nothing piles up while locked');
  fake.raw.state = 'running';
  (fake.raw.onstatechange as () => void)();
  assert.equal(sound.live, true, 'plays again once the context runs');
  sound.ui('click');
  assert.ok(fake.count('osc') > before);
});

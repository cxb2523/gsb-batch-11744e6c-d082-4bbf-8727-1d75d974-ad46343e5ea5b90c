import type { ThreadKind } from '../chapter/data';
import type { AudioEngine, Bus, Graph } from './engine';
import type { Synth } from './synth';
import { CHAPTER_CHORDS, CHAPTER_MELODY, THREAD_VOICING, midiToFreq, threadNoteMidi, type PhraseNote, type Timbre } from './theory';

/** Music-box voices. One timbre per thread kind; the notes come from theory.ts so that walking
 * lays down a pentatonic tune. All timbres share the same C-pentatonic key as the ambient chords. */

export interface NoteOptions {
  /** 0..1 loudness. */
  velocity?: number;
  /** Absolute context time. */
  start?: number;
  pan?: number;
  /** Extra reverb send. */
  wet?: number;
  bus?: Bus;
}

export class MusicPlayer {
  constructor(private readonly engine: AudioEngine, private readonly synth: Synth) {}

  /** One note of `timbre` at `midi`. */
  note(g: Graph, timbre: Timbre, midi: number, options: NoteOptions = {}): void {
    const { synth } = this;
    const bus = options.bus ?? g.music;
    const f = midiToFreq(midi);
    const v = Math.max(0.05, Math.min(1, options.velocity ?? 0.7)) * (0.92 + Math.random() * 0.16);
    const start = options.start ?? g.ctx.currentTime;
    const detune = (Math.random() - 0.5) * 8;
    const base = { start, pan: options.pan ?? (Math.random() - 0.5) * 0.3, wet: options.wet, detune };
    switch (timbre) {
      case 'bell': // bright glockenspiel: inharmonic partials, upper ones die quickly
        synth.tone(g, bus, { ...base, freq: f, attack: 0.002, decay: 1.5, gain: 0.1 * v });
        synth.tone(g, bus, { ...base, freq: f * 2.76, attack: 0.002, decay: 0.55, gain: 0.045 * v });
        synth.tone(g, bus, { ...base, freq: f * 5.4, attack: 0.001, decay: 0.2, gain: 0.022 * v });
        synth.noise(g, bus, { start, attack: 0.001, decay: 0.012, gain: 0.02 * v, filter: { type: 'highpass', freq: 6000 }, wet: options.wet });
        break;
      case 'marimba': // soft wooden mallet: fundamental, 4x partial, dull knock
        synth.tone(g, bus, { ...base, freq: f, attack: 0.003, decay: 0.55, gain: 0.15 * v, lowpass: 3200 });
        synth.tone(g, bus, { ...base, freq: f * 4, attack: 0.002, decay: 0.1, gain: 0.04 * v });
        synth.noise(g, bus, { start, attack: 0.002, decay: 0.03, gain: 0.035 * v, color: 'brown', filter: { type: 'bandpass', freq: Math.min(2000, f * 1.5), q: 1.4 }, wet: options.wet });
        break;
      case 'celesta': // glassy two-operator FM chime
        this.fmChime(g, bus, f, v, start, options.wet, base.pan);
        break;
      case 'flute': // warm hollow tone with a little breath and late vibrato
        synth.tone(g, bus, { ...base, freq: f, type: 'triangle', attack: 0.045, hold: 0.1, decay: 0.45, gain: 0.1 * v, lowpass: 2600, vibrato: { cents: 9, rate: 5.3 } });
        synth.tone(g, bus, { ...base, freq: f * 2, attack: 0.06, decay: 0.3, gain: 0.018 * v });
        synth.noise(g, bus, { start, attack: 0.03, decay: 0.16, gain: 0.014 * v, filter: { type: 'bandpass', freq: f * 2, q: 2 }, wet: options.wet });
        break;
      case 'kalimba': // low metal tine on a wooden box
        synth.tone(g, bus, { ...base, freq: f, attack: 0.002, decay: 0.85, gain: 0.17 * v, lowpass: 2400 });
        synth.tone(g, bus, { ...base, freq: f * 5.9, attack: 0.001, decay: 0.07, gain: 0.03 * v });
        synth.noise(g, bus, { start, attack: 0.002, decay: 0.035, gain: 0.03 * v, color: 'pink', filter: { type: 'bandpass', freq: 900, q: 1.2 }, wet: options.wet });
        break;
    }
  }

  private fmChime(g: Graph, bus: Bus, f: number, v: number, start: number, wet: number | undefined, pan: number): void {
    const { ctx } = g;
    const t0 = Math.max(start, ctx.currentTime);
    const carrier = ctx.createOscillator(); carrier.frequency.value = f;
    const modulator = ctx.createOscillator(); modulator.frequency.value = f * 3.5;
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 1.5, t0);
    index.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.04), t0 + 0.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.085 * v, t0 + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
    const nodes: AudioNode[] = [carrier, modulator, index, env];
    modulator.connect(index).connect(carrier.frequency);
    carrier.connect(env);
    let tail: AudioNode = env;
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner(); panner.pan.value = pan; env.connect(panner); nodes.push(panner); tail = panner;
    }
    tail.connect(bus.input);
    if (wet) { const send = ctx.createGain(); send.gain.value = wet; tail.connect(send).connect(g.reverbIn); nodes.push(send); }
    carrier.onended = () => { for (const node of nodes) node.disconnect(); };
    carrier.start(t0); modulator.start(t0);
    carrier.stop(t0 + 1.3); modulator.stop(t0 + 1.3);
    // A faint octave sine keeps the chime bright without extra harshness.
    this.synth.tone(g, bus, { start: t0, freq: f * 2, attack: 0.002, decay: 0.5, gain: 0.02 * v, pan, wet });
  }

  /** The melody note for step `index` of a thread of `kind`. */
  threadStep(g: Graph, index: number, kind: ThreadKind): void {
    if (!this.engine.claim(1.2, 1)) return;
    const voicing = THREAD_VOICING[kind];
    const midi = threadNoteMidi(index, kind);
    // Higher notes sit a little to the right so the tune sparkles across the stereo field.
    const pan = Math.max(-0.35, Math.min(0.35, (midi - 66) / 40));
    this.note(g, voicing.timbre, midi, { velocity: 0.6 + Math.random() * 0.15, pan, wet: 0.12 });
  }

  /** A quiet random twinkle for the ambient bed. */
  twinkle(g: Graph, midi: number, velocity: number): void {
    if (!this.engine.claim(1.5, 0)) return;
    this.note(g, 'celesta', midi, { velocity, wet: 0.7, pan: (Math.random() - 0.5) * 0.9 });
  }

  /** Schedule one short music-box phrase; its notes already carry offsets and soft velocities.
   * Returns false when the voice budget has no room for another background phrase. */
  phrase(g: Graph, notes: readonly PhraseNote[]): boolean {
    if (notes.length === 0) return true;
    const duration = notes[notes.length - 1].offset + 1.2;
    if (!this.engine.claim(duration, 0)) return false;
    const start = g.ctx.currentTime + 0.02;
    for (const note of notes) {
      // Higher notes sit a little to the right, keeping the phrase airy and wide.
      const pan = Math.max(-0.35, Math.min(0.35, (note.midi - 72) / 40));
      this.note(g, 'celesta', note.midi, { velocity: note.velocity, start: start + note.offset, wet: 0.65, pan });
    }
    return true;
  }

  /** Chapter-complete theme: melody in layered celesta + bell over soft chord swells. */
  chapterComplete(g: Graph): void {
    const t0 = g.ctx.currentTime + 0.05;
    for (const note of CHAPTER_MELODY) {
      const start = t0 + note.t;
      this.note(g, 'celesta', note.midi, { velocity: note.vel * 0.8, start, wet: 0.5, pan: -0.1 });
      this.note(g, 'bell', note.midi + 12 > 96 ? note.midi : note.midi + 12, { velocity: note.vel * 0.35, start, wet: 0.6, pan: 0.15 });
      if (note.dur > 1.1) this.note(g, 'flute', note.midi - 12, { velocity: 0.5, start, wet: 0.5 });
    }
    for (const chord of CHAPTER_CHORDS) {
      chord.midis.forEach((midi, i) => this.synth.tone(g, g.music, {
        start: t0 + chord.t + i * 0.05, freq: midiToFreq(midi), type: i % 2 ? 'triangle' : 'sine', attack: 0.5, hold: chord.dur * 0.3,
        decay: chord.dur * 0.8, gain: 0.028, lowpass: 1800, wet: 0.5, detune: (i - 1.5) * 3,
      }));
    }
    // A last high shimmer when the tune lands home.
    [91, 96, 100].forEach((midi, i) => this.note(g, 'bell', midi, { velocity: 0.35, start: t0 + 8.2 + i * 0.22, wet: 0.8 }));
  }
}

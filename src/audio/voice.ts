import type { AudioEngine, Graph } from './engine';
import { createSyllableGenerator, type Syllable } from './theory';
import type { Voice } from './types';

/** Animal-Crossing-style dialogue babble: each blip is a short sawtooth/triangle syllable with a
 * little pitch glide, shaped by two parallel formant filters so it reads as a vowel. The cat
 * produces slow rising-falling "mi-ao" glides instead. */
export class Babble {
  private voice: Voice | null = null;
  private next: (() => Syllable) | null = null;
  private clock = 0;
  private conversations = 0;

  constructor(private readonly engine: AudioEngine) {}

  get speaking(): boolean { return this.voice !== null; }

  /** Called every frame while text is revealing; only a change of voice restarts the babble. */
  set(voice: Voice): void {
    if (voice === this.voice) return;
    this.voice = voice;
    this.next = createSyllableGenerator(voice, 0x9e3779b1 + ++this.conversations * 7919);
    this.clock = 0;
  }

  stop(): void { this.voice = null; this.next = null; this.clock = 0; }

  update(dt: number, g: Graph | null): void {
    if (!this.voice || !this.next) return;
    this.clock -= dt;
    if (this.clock > 0) return;
    const syllable = this.next();
    this.clock = syllable.dur + syllable.gap;
    if (g && this.engine.claim(syllable.dur + 0.05, 1)) this.play(g, this.voice, syllable);
  }

  private play(g: Graph, voice: Voice, s: Syllable): void {
    const { ctx } = g;
    const t = ctx.currentTime;
    const meow = voice === 'cat';
    const wave: OscillatorType = voice === 'child' ? 'triangle' : 'sawtooth';
    const osc = ctx.createOscillator(); osc.type = wave;
    osc.frequency.setValueAtTime(s.freq, t);
    osc.frequency.linearRampToValueAtTime(s.peakFreq, t + s.dur * 0.4);
    osc.frequency.linearRampToValueAtTime(s.endFreq, t + s.dur);
    const formant1 = ctx.createBiquadFilter(), formant2 = ctx.createBiquadFilter();
    formant1.type = formant2.type = 'bandpass';
    formant1.Q.value = 5; formant2.Q.value = 7;
    formant1.frequency.setValueAtTime(s.f1, t); formant1.frequency.linearRampToValueAtTime(s.f1End, t + s.dur);
    formant2.frequency.setValueAtTime(s.f2, t); formant2.frequency.linearRampToValueAtTime(s.f2End, t + s.dur);
    const level2 = ctx.createGain(); level2.gain.value = 0.55;
    const env = ctx.createGain();
    const peak = 0.12 * s.gain;
    const attack = meow ? 0.04 : 0.008;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.setValueAtTime(peak * 0.85, t + Math.max(attack, s.dur * 0.6));
    env.gain.exponentialRampToValueAtTime(0.0001, t + s.dur + 0.02);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = meow ? 3200 : 3800;
    osc.connect(formant1).connect(env);
    osc.connect(formant2).connect(level2).connect(env);
    env.connect(tone).connect(g.speech.input);
    const nodes = [osc, formant1, formant2, level2, env, tone];
    osc.onended = () => { for (const node of nodes) node.disconnect(); };
    osc.start(t); osc.stop(t + s.dur + 0.06);
  }
}

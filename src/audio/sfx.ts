import type { ThreadKind } from '../chapter/data';
import type { AudioEngine, Graph } from './engine';
import type { MusicPlayer } from './music';
import type { Synth } from './synth';
import { clamp, midiToFreq, scaleSemitones } from './theory';
import type { UiSound } from './types';

/** One-shot effects. Everything is quiet, soft-attacked and slightly randomized so repetition
 * (footsteps, clicks) never sounds mechanical. */

const TOP_NOTE: Record<ThreadKind, number> = { power: 88, water: 81, lights: 86, voice: 79, root: 76 };

export class Sfx {
  private side: -1 | 1 = 1;

  constructor(private readonly engine: AudioEngine, private readonly synth: Synth, private readonly music: MusicPlayer) {}

  // ---------------------------------------------------------------- movement
  footstep(g: Graph, options: { water: boolean; sprint: boolean }): void {
    if (!this.engine.claim(0.2, 0)) return;
    const r = Math.random;
    const k = (options.sprint ? 1.2 : 1) * (0.75 + r() * 0.5) * 1.3;
    this.side = this.side === 1 ? -1 : 1;
    const pan = this.side * 0.1;
    const { synth } = this;
    if (options.water) {
      synth.noise(g, g.sfx, { color: 'white', attack: 0.005, decay: 0.12 + r() * 0.06, gain: 0.05 * k, filter: { type: 'bandpass', freq: 1500 + r() * 900, q: 0.9 }, pan, wet: 0.2 });
      synth.tone(g, g.sfx, { freq: 480 + r() * 200, glide: { to: 900 + r() * 400, time: 0.05 }, attack: 0.003, decay: 0.07, gain: 0.03 * k, pan });
    } else {
      synth.noise(g, g.sfx, { color: 'brown', attack: 0.003, decay: 0.05 + r() * 0.035, gain: 0.2 * k, filter: { type: 'lowpass', freq: 650 + r() * 550, q: 0.6 }, rate: 0.9 + r() * 0.25, pan });
      synth.tone(g, g.sfx, { freq: 100 + r() * 35, glide: { to: 56, time: 0.07 }, attack: 0.003, decay: 0.09, gain: 0.07 * k, pan });
      if (r() < 0.3) synth.noise(g, g.sfx, { color: 'pink', start: g.ctx.currentTime + 0.02, attack: 0.004, decay: 0.05, gain: 0.025 * k, filter: { type: 'highpass', freq: 2500 }, pan: -pan });
    }
  }

  jump(g: Graph): void {
    if (!this.engine.claim(0.3, 1)) return;
    this.synth.tone(g, g.sfx, { freq: 260, glide: { to: 520, time: 0.14 }, attack: 0.01, decay: 0.16, gain: 0.06, type: 'triangle', lowpass: 1800 });
    this.synth.noise(g, g.sfx, { color: 'pink', attack: 0.02, decay: 0.12, gain: 0.04, filter: { type: 'bandpass', freq: 1200, freqEnd: 2400, q: 0.8 } });
  }

  land(g: Graph, intensity: number): void {
    if (!this.engine.claim(0.3, 1)) return;
    const k = clamp(intensity, 0.2, 1);
    this.synth.tone(g, g.sfx, { freq: 120, glide: { to: 50, time: 0.12 }, attack: 0.003, decay: 0.16, gain: 0.12 * k });
    this.synth.noise(g, g.sfx, { color: 'brown', attack: 0.003, decay: 0.1, gain: 0.25 * k, filter: { type: 'lowpass', freq: 700 } });
  }

  // ---------------------------------------------------------------- thread
  pickup(g: Graph): void {
    this.engine.claim(0.6, 2);
    this.synth.tone(g, g.sfx, { freq: 380, glide: { to: 1150, time: 0.06 }, attack: 0.002, decay: 0.12, gain: 0.13, wet: 0.15 });
    this.synth.noise(g, g.sfx, { attack: 0.001, decay: 0.02, gain: 0.04, filter: { type: 'highpass', freq: 4000 } });
    const t = g.ctx.currentTime;
    this.music.note(g, 'celesta', 79, { velocity: 0.45, start: t + 0.05, wet: 0.5 });
    this.music.note(g, 'celesta', 84, { velocity: 0.5, start: t + 0.11, wet: 0.5 });
  }

  reel(g: Graph): void {
    this.engine.claim(0.8, 2);
    const t = g.ctx.currentTime, span = 0.55, clicks = 14;
    this.synth.noise(g, g.sfx, { attack: 0.03, decay: 0.5, gain: 0.07, filter: { type: 'bandpass', freq: 500, freqEnd: 3800, q: 2.2 }, wet: 0.1 });
    this.synth.tone(g, g.sfx, { freq: 220, glide: { to: 900, time: span }, type: 'sawtooth', attack: 0.04, decay: 0.5, gain: 0.018, lowpass: 1400 });
    for (let i = 0; i < clicks; i++) {
      const at = t + span * (i / clicks) ** 0.7;
      this.synth.tone(g, g.sfx, { start: at, freq: 1400 + i * 70, attack: 0.001, decay: 0.02, gain: 0.03, pan: i % 2 ? 0.15 : -0.15 });
    }
    this.music.note(g, 'bell', 88, { velocity: 0.4, start: t + span, wet: 0.4 });
  }

  taut(g: Graph): void {
    this.engine.claim(1, 2);
    const buffer = this.engine.pluck(165);
    if (!buffer) return;
    const { ctx } = g, t = ctx.currentTime;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    source.playbackRate.setValueAtTime(1.07, t);
    source.playbackRate.exponentialRampToValueAtTime(0.95, t + 0.5);
    const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 2400;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3, t); env.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    const send = ctx.createGain(); send.gain.value = 0.25;
    source.connect(lowpass).connect(env).connect(g.sfx.input);
    env.connect(send).connect(g.reverbIn);
    source.onended = () => { for (const node of [source, lowpass, env, send]) node.disconnect(); };
    source.start(t); source.stop(t + 1.3);
    this.synth.noise(g, g.sfx, { attack: 0.01, decay: 0.15, gain: 0.03, filter: { type: 'bandpass', freq: 420, q: 3 } });
  }

  connect(g: Graph, kind?: ThreadKind): void {
    this.engine.claim(2, 2);
    const t = g.ctx.currentTime;
    // The plug: a soft "tok" then a bell chord with the thread colour deciding the top note.
    this.synth.tone(g, g.sfx, { freq: 240, glide: { to: 120, time: 0.07 }, attack: 0.002, decay: 0.1, gain: 0.1 });
    this.synth.noise(g, g.sfx, { attack: 0.001, decay: 0.03, gain: 0.05, filter: { type: 'bandpass', freq: 2000, q: 1 } });
    const top = kind ? TOP_NOTE[kind] : 88;
    [72, 79, 84, top].forEach((midi, i) => this.music.note(g, i === 3 ? 'celesta' : 'bell', midi, { velocity: 0.7 - i * 0.05, start: t + 0.06 + i * 0.06, wet: 0.45 }));
    [60, 67, 76].forEach((midi, i) => this.synth.tone(g, g.music, {
      start: t + 0.1 + i * 0.04, freq: midiToFreq(midi), type: 'triangle', attack: 0.12, decay: 1.8, gain: 0.035, lowpass: 2400, wet: 0.6, detune: (i - 1) * 4,
    }));
  }

  revive(g: Graph): void {
    this.engine.claim(3, 2);
    const t = g.ctx.currentTime, count = 13;
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const midi = Math.min(100, 72 + scaleSemitones(i));
      this.music.note(g, i % 2 ? 'celesta' : 'bell', midi, {
        velocity: 0.28 + u * 0.4, start: t + 0.05 + u ** 1.2 * 1.7 + Math.random() * 0.04, wet: 0.75, pan: Math.sin(i * 1.7) * 0.5,
      });
    }
    this.synth.noise(g, g.sfx, { attack: 0.9, decay: 1.2, gain: 0.05, filter: { type: 'bandpass', freq: 300, freqEnd: 4200, q: 1.2 }, wet: 0.5 });
    [60, 64, 67, 71].forEach((midi, i) => this.synth.tone(g, g.music, {
      start: t + 0.3 + i * 0.07, freq: midiToFreq(midi), type: 'triangle', attack: 0.5, decay: 2.6, gain: 0.028, lowpass: 1800, wet: 0.7, detune: (i - 1.5) * 4,
    }));
  }

  // ---------------------------------------------------------------- UI
  ui(g: Graph, action: UiSound): void {
    if (!this.engine.claim(0.5, 2)) return;
    const { synth } = this;
    const t = g.ctx.currentTime;
    const r = () => 1 + (Math.random() - 0.5) * 0.04;
    switch (action) {
      case 'click':
        synth.tone(g, g.sfx, { freq: 660 * r(), glide: { to: 430, time: 0.04 }, attack: 0.002, decay: 0.07, gain: 0.08, type: 'triangle', lowpass: 2600 });
        synth.noise(g, g.sfx, { attack: 0.001, decay: 0.012, gain: 0.03, filter: { type: 'highpass', freq: 3000 } });
        break;
      case 'hover':
        synth.tone(g, g.sfx, { freq: 1250 * r(), attack: 0.003, decay: 0.03, gain: 0.02, type: 'triangle' });
        break;
      case 'toggle':
        synth.tone(g, g.sfx, { freq: 520, attack: 0.002, decay: 0.06, gain: 0.06, type: 'triangle' });
        synth.tone(g, g.sfx, { start: t + 0.055, freq: 780, attack: 0.002, decay: 0.08, gain: 0.06, type: 'triangle' });
        break;
      case 'open':
        this.paper(g, 0.7);
        [67, 72, 76].forEach((midi, i) => synth.tone(g, g.sfx, { start: t + i * 0.055, freq: midiToFreq(midi), type: 'triangle', attack: 0.004, decay: 0.28, gain: 0.05, lowpass: 3000, wet: 0.3 }));
        break;
      case 'close':
        this.paper(g, 0.5);
        [76, 72, 67].forEach((midi, i) => synth.tone(g, g.sfx, { start: t + i * 0.05, freq: midiToFreq(midi), type: 'triangle', attack: 0.004, decay: 0.2, gain: 0.04, lowpass: 2600, wet: 0.25 }));
        break;
      case 'paper':
        this.paper(g, 1);
        break;
      case 'start':
        [72, 76, 79, 84, 88].forEach((midi, i) => this.music.note(g, 'celesta', midi, { velocity: 0.5 + i * 0.05, start: t + i * 0.08, wet: 0.5 }));
        synth.noise(g, g.sfx, { attack: 0.3, decay: 0.6, gain: 0.03, filter: { type: 'bandpass', freq: 800, freqEnd: 3000, q: 1 }, wet: 0.4 });
        break;
      case 'shutter':
        synth.noise(g, g.sfx, { attack: 0.001, decay: 0.025, gain: 0.12, filter: { type: 'bandpass', freq: 3200, q: 1.5 } });
        synth.tone(g, g.sfx, { freq: 900, glide: { to: 500, time: 0.03 }, attack: 0.001, decay: 0.04, gain: 0.05 });
        synth.noise(g, g.sfx, { start: t + 0.07, attack: 0.001, decay: 0.03, gain: 0.1, filter: { type: 'bandpass', freq: 2200, q: 1.5 } });
        break;
      case 'stamp':
        synth.tone(g, g.sfx, { freq: 140, glide: { to: 60, time: 0.09 }, attack: 0.002, decay: 0.14, gain: 0.14 });
        synth.noise(g, g.sfx, { color: 'brown', attack: 0.002, decay: 0.07, gain: 0.2, filter: { type: 'lowpass', freq: 900 } });
        break;
    }
  }

  /** Paper rustle: a few short filtered grains. */
  private paper(g: Graph, amount: number): void {
    const t = g.ctx.currentTime;
    const grains = 2 + Math.round(amount * 2);
    for (let i = 0; i < grains; i++) {
      this.synth.noise(g, g.sfx, {
        start: t + i * (0.022 + Math.random() * 0.02), color: 'pink', attack: 0.004, decay: 0.03 + Math.random() * 0.03,
        gain: 0.05 * amount, filter: { type: 'bandpass', freq: 2200 + Math.random() * 2400, q: 0.8 }, pan: (Math.random() - 0.5) * 0.3,
      });
    }
  }
}

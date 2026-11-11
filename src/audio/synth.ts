import type { AudioEngine, Bus, Graph, NoiseColor } from './engine';

/** Tiny voice builders shared by every sound. Each call creates a short-lived graph
 * (source -> envelope -> optional filter/pan -> bus), schedules it, and disconnects every node
 * when the source ends, so nothing accumulates. */

export interface FilterSpec { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }

interface CommonSpec {
  /** Absolute context time to begin (default now). */
  start?: number;
  attack?: number;
  /** Seconds held at full level between attack and decay. */
  hold?: number;
  /** Exponential fall to silence, in seconds. */
  decay: number;
  gain: number;
  /** -1..1 stereo position. */
  pan?: number;
  /** Extra reverb send for this one sound, 0..1. */
  wet?: number;
}
export interface ToneSpec extends CommonSpec {
  freq: number;
  type?: OscillatorType;
  /** Cents. */
  detune?: number;
  glide?: { to: number; time: number };
  lowpass?: number;
  /** Vibrato depth in cents and rate in Hz. */
  vibrato?: { cents: number; rate: number };
}
export interface NoiseSpec extends CommonSpec {
  color?: NoiseColor;
  filter?: FilterSpec;
  filter2?: FilterSpec;
  /** Buffer playback rate (also shifts the colour). */
  rate?: number;
}

const FLOOR = 0.0001;

export class Synth {
  constructor(private readonly engine: AudioEngine) {}

  private output(g: Graph, bus: Bus, last: AudioNode, spec: CommonSpec, nodes: AudioNode[]): void {
    let tail = last;
    if (spec.pan && typeof g.ctx.createStereoPanner === 'function') {
      const panner = g.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, spec.pan));
      tail.connect(panner); nodes.push(panner); tail = panner;
    }
    tail.connect(bus.input);
    if (spec.wet) {
      const send = g.ctx.createGain(); send.gain.value = spec.wet;
      tail.connect(send).connect(g.reverbIn); nodes.push(send);
    }
  }

  private envelope(g: Graph, spec: CommonSpec, t0: number): { env: GainNode; end: number } {
    const attack = Math.max(0.002, spec.attack ?? 0.005), hold = spec.hold ?? 0;
    const env = g.ctx.createGain();
    env.gain.setValueAtTime(FLOOR, t0);
    env.gain.linearRampToValueAtTime(Math.max(FLOOR * 2, spec.gain), t0 + attack);
    if (hold > 0) env.gain.setValueAtTime(Math.max(FLOOR * 2, spec.gain), t0 + attack + hold);
    const end = t0 + attack + hold + spec.decay;
    env.gain.exponentialRampToValueAtTime(FLOOR, end);
    return { env, end };
  }

  tone(g: Graph, bus: Bus, spec: ToneSpec): void {
    const { ctx } = g;
    const t0 = Math.max(spec.start ?? ctx.currentTime, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = spec.type ?? 'sine';
    osc.frequency.setValueAtTime(spec.freq, t0);
    if (spec.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.glide.to), t0 + spec.glide.time);
    if (spec.detune) osc.detune.value = spec.detune;
    const { env, end } = this.envelope(g, spec, t0);
    const nodes: AudioNode[] = [osc, env];
    let tail: AudioNode = osc;
    if (spec.vibrato) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = spec.vibrato.rate;
      const depth = ctx.createGain(); depth.gain.setValueAtTime(0, t0);
      depth.gain.linearRampToValueAtTime(spec.vibrato.cents, t0 + Math.min(0.25, spec.decay * 0.5));
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t0); lfo.stop(end + 0.03);
      nodes.push(lfo, depth);
    }
    if (spec.lowpass) {
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = spec.lowpass; filter.Q.value = 0.5;
      osc.connect(filter); nodes.push(filter); tail = filter;
    }
    tail.connect(env);
    this.output(g, bus, env, spec, nodes);
    osc.onended = () => { for (const node of nodes) node.disconnect(); };
    osc.start(t0); osc.stop(end + 0.03);
  }

  noise(g: Graph, bus: Bus, spec: NoiseSpec): void {
    const { ctx } = g;
    const buffer = this.engine.noise(spec.color ?? 'white');
    if (!buffer) return;
    const t0 = Math.max(spec.start ?? ctx.currentTime, ctx.currentTime);
    const rate = spec.rate ?? 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.playbackRate.value = rate;
    const { env, end } = this.envelope(g, spec, t0);
    const nodes: AudioNode[] = [source, env];
    let tail: AudioNode = source;
    for (const f of [spec.filter, spec.filter2]) {
      if (!f) continue;
      const filter = ctx.createBiquadFilter();
      filter.type = f.type; filter.Q.value = f.q ?? 0.7;
      filter.frequency.setValueAtTime(f.freq, t0);
      if (f.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f.freqEnd), end);
      tail.connect(filter); nodes.push(filter); tail = filter;
    }
    tail.connect(env);
    this.output(g, bus, env, spec, nodes);
    const length = end - t0 + 0.03;
    const offset = Math.random() * Math.max(0, buffer.duration - length * rate - 0.1);
    source.onended = () => { for (const node of nodes) node.disconnect(); };
    source.start(t0, offset, length * rate);
  }
}

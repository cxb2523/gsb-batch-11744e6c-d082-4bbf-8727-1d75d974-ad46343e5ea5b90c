import { VoiceBudget, mulberry32 } from './theory';
import { SampleBank } from './samples';

/** WebAudio plumbing: lazy context, master chain, buses, generated reverb, noise and pluck
 * buffers, run-state (enabled / paused / autoplay-locked). Never throws: if the browser has no
 * AudioContext (or the constructor throws) every accessor just reports "not live". */

export interface Bus { input: GainNode }
export type NoiseColor = 'white' | 'pink' | 'brown';

export interface Graph {
  ctx: AudioContext;
  master: GainNode;
  /** One-shot effects (steps, pickups, UI, chimes). */
  sfx: Bus;
  /** Music-box notes, twinkles, finale melody. Has a soft echo. */
  music: Bus;
  /** Sea and wind beds. Ducked while menus/dialogue are open. */
  ambient: Bus;
  /** Dialogue babble. */
  speech: Bus;
  /** Anything connected here is convolved with the generated room. */
  reverbIn: GainNode;
}

export interface EngineOptions {
  /** Test hook: supply a context (e.g. OfflineAudioContext) instead of `new AudioContext()`. */
  createContext?: () => AudioContext;
}

export const MASTER_LEVEL = 0.8;
const BUS_LEVEL = { sfx: 0.9, music: 0.8, ambient: 0.62, speech: 0.7 };
const BUS_WET = { sfx: 0.16, music: 0.34, ambient: 0.3, speech: 0.07 };

function userHasActivated(): boolean {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  // Browsers without the API cannot tell us; try, and the unlock listeners cover a suspended start.
  return nav?.userActivation ? nav.userActivation.hasBeenActive : true;
}

function contextConstructor(): (new (options?: AudioContextOptions) => AudioContext) | undefined {
  const scope = globalThis as unknown as { AudioContext?: new (options?: AudioContextOptions) => AudioContext; webkitAudioContext?: new (options?: AudioContextOptions) => AudioContext };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  enabled = true;
  started = false;
  paused = false;
  readonly budget = new VoiceBudget(28);
  readonly samples = new SampleBank();
  private graph: Graph | null = null;
  private failed = false;
  private locked = false;
  private offline = false;
  private resumeToken = 0;
  private unlockArmed = false;
  private readonly noises = new Map<NoiseColor, AudioBuffer>();
  private readonly plucks = new Map<number, AudioBuffer>();

  constructor(private readonly options: EngineOptions = {}) {}

  /** Context time, or 0 when there is no context. */
  get time(): number { return this.ctx?.currentTime ?? 0; }

  /** Create the context after a user gesture (idempotent). Returns the graph, or null. */
  ensure(): Graph | null {
    if (this.graph) return this.graph;
    if (this.failed) return null;
    if (!this.started && !userHasActivated()) return null;
    try {
      const Constructor = contextConstructor();
      if (!this.options.createContext && !Constructor) { this.failed = true; return null; }
      const ctx = this.options.createContext ? this.options.createContext() : new Constructor!({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
      this.graph = this.build(ctx);
      ctx.onstatechange = () => { if (ctx.state === 'running') this.locked = false; };
      this.applyRunState();
    } catch {
      this.failed = true; this.ctx = null; this.graph = null;
    }
    return this.graph;
  }

  /** The graph when sound may play right now, otherwise null. */
  live(): Graph | null {
    const graph = this.graph ?? this.ensure();
    if (!graph || !this.enabled || this.paused || this.locked || graph.ctx.state === 'closed') return null;
    return graph;
  }

  start(): void {
    this.started = true;
    if (this.ensure()) this.applyRunState();
  }
  setEnabled(enabled: boolean): void { this.enabled = enabled; this.applyRunState(); }
  setPaused(paused: boolean): void { this.paused = paused; this.applyRunState(); }

  dispose(): void {
    const ctx = this.ctx;
    this.graph = null; this.ctx = null; this.failed = true;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }

  /** Reserve budget for one logical sound. Priority: 0 background, 1 normal, 2 essential. */
  claim(duration: number, priority = 1): boolean { return this.budget.acquire(this.time, duration, priority); }

  // ---------------------------------------------------------------- run state
  private applyRunState(): void {
    const graph = this.graph, ctx = this.ctx;
    if (!graph || !ctx || ctx.state === 'closed') return;
    const t = ctx.currentTime;
    graph.master.gain.cancelScheduledValues(t);
    graph.master.gain.setTargetAtTime(this.enabled ? MASTER_LEVEL : 0, t, 0.05);
    if (this.offline) return;
    if (this.enabled && !this.paused) { if (ctx.state !== 'running') this.requestResume(); }
    else if (this.paused) void ctx.suspend().catch(() => {});
    else setTimeout(() => { if (!this.enabled && ctx.state === 'running') void ctx.suspend().catch(() => {}); }, 420);
  }

  private requestResume(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    const token = ++this.resumeToken;
    ctx.resume().then(() => { if (token === this.resumeToken && ctx.state === 'running') this.locked = false; })
      .catch(() => { this.locked = true; this.armUnlock(); });
    // Chrome leaves resume() pending without a gesture: stop scheduling until one arrives.
    setTimeout(() => {
      if (token === this.resumeToken && ctx.state === 'suspended' && this.enabled && !this.paused) { this.locked = true; this.armUnlock(); }
    }, 450);
  }

  private armUnlock(): void {
    if (this.unlockArmed || typeof window === 'undefined') return;
    this.unlockArmed = true;
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const unlock = () => {
      const ctx = this.ctx;
      if (!ctx) { remove(); return; }
      void ctx.resume().then(() => {
        if (ctx.state === 'running') { this.locked = false; remove(); }
      }).catch(() => {});
    };
    const remove = () => { this.unlockArmed = false; for (const name of events) window.removeEventListener(name, unlock, true); };
    for (const name of events) window.addEventListener(name, unlock, true);
  }

  // ---------------------------------------------------------------- graph
  private build(ctx: AudioContext): Graph {
    const master = ctx.createGain();
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20; compressor.knee.value = 18; compressor.ratio.value = 3.2;
    compressor.attack.value = 0.006; compressor.release.value = 0.28;
    master.connect(compressor).connect(ctx.destination);

    // Generated room: pre-delay then a darkening noise tail.
    const reverbIn = ctx.createGain();
    const preDelay = ctx.createDelay(0.1); preDelay.delayTime.value = 0.022;
    const convolver = ctx.createConvolver(); convolver.buffer = makeImpulse(ctx);
    const reverbOut = ctx.createGain(); reverbOut.gain.value = 0.85;
    reverbIn.connect(preDelay).connect(convolver).connect(reverbOut).connect(master);

    const makeBus = (level: number, wet: number): Bus => {
      const input = ctx.createGain(); input.gain.value = level;
      input.connect(master);
      const send = ctx.createGain(); send.gain.value = wet;
      input.connect(send).connect(reverbIn);
      return { input };
    };
    const sfx = makeBus(BUS_LEVEL.sfx, BUS_WET.sfx);
    const music = makeBus(BUS_LEVEL.music, BUS_WET.music);
    const ambient = makeBus(BUS_LEVEL.ambient, BUS_WET.ambient);
    const speech = makeBus(BUS_LEVEL.speech, BUS_WET.speech);

    // Soft music-box echo: dark feedback delay returning into the master.
    const echoSend = ctx.createGain(); echoSend.gain.value = 0.2;
    const echo = ctx.createDelay(1); echo.delayTime.value = 0.31;
    const echoTone = ctx.createBiquadFilter(); echoTone.type = 'lowpass'; echoTone.frequency.value = 2400;
    const feedback = ctx.createGain(); feedback.gain.value = 0.3;
    const echoOut = ctx.createGain(); echoOut.gain.value = 0.8;
    music.input.connect(echoSend).connect(echo);
    echo.connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(echoOut).connect(master);

    return { ctx, master, sfx, music, ambient, speech, reverbIn };
  }

  // ---------------------------------------------------------------- buffers
  /** Shared looping-friendly noise (4 s). Cached per colour. */
  noise(color: NoiseColor): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const cached = this.noises.get(color);
    if (cached) return cached;
    const length = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = mulberry32(color === 'white' ? 11 : color === 'pink' ? 23 : 37);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, peak = 0;
    for (let i = 0; i < length; i++) {
      const white = rng() * 2 - 1;
      let value = white;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759; b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856; b4 = 0.55 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.016898;
        value = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362; b6 = white * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * white) / 1.02; value = last * 3.5;
      }
      data[i] = value;
      peak = Math.max(peak, Math.abs(value));
    }
    const scale = 0.9 / (peak || 1);
    for (let i = 0; i < length; i++) data[i] *= scale;
    // Cross-fade the loop seam so looping beds never click.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const mix = i / fade;
      data[length - fade + i] = data[length - fade + i] * (1 - mix) + data[i] * mix;
    }
    this.noises.set(color, buffer);
    return buffer;
  }

  /** Karplus-Strong plucked string at roughly `frequency` (cached by rounded pitch). */
  pluck(frequency: number): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const key = Math.round(frequency);
    const cached = this.plucks.get(key);
    if (cached) return cached;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * 1.4);
    const period = Math.max(2, Math.round(rate / key));
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const rng = mulberry32(key);
    let smooth = 0;
    for (let i = 0; i < period; i++) { smooth += ((rng() * 2 - 1) - smooth) * 0.55; data[i] = smooth; }
    for (let i = period; i < length; i++) data[i] = 0.5 * (data[i - period] + data[i - period + 1]) * 0.9965;
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const scale = 0.9 / (peak || 1);
    for (let i = 0; i < length; i++) data[i] *= scale;
    this.plucks.set(key, buffer);
    return buffer;
  }
}

/** Stereo impulse: early taps plus an exponentially decaying, progressively darker noise tail. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.4, decay = 2.8): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    const rng = mulberry32(101 + channel * 17);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const alpha = 0.9 - 0.8 * Math.min(1, t * 1.15);
      low += ((rng() * 2 - 1) - low) * alpha;
      data[i] = low * (1 - t) ** decay;
    }
    for (const [ms, level] of [[11, 0.6], [23, 0.45], [37, 0.35], [53, 0.25]] as const) {
      const index = Math.floor(rate * (ms + channel * 3) / 1000);
      if (index < length) data[index] += level * (channel ? -1 : 1);
    }
  }
  return buffer;
}

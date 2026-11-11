import type { ThreadKind } from '../chapter/data';
import { Ambience } from './ambience';
import { AudioEngine, type EngineOptions, type Graph } from './engine';
import { MusicPlayer } from './music';
import type { SampleOptions } from './samples';
import { Sfx } from './sfx';
import { Synth } from './synth';
import type { SoundEvent, SoundFrame, UiSound, Voice } from './types';
import { Babble } from './voice';

export type { SoundFrame, UiSound, Voice, SoundEvent } from './types';
export { SOUND_EVENTS } from './types';
export type { SampleOptions } from './samples';
export type { EngineOptions } from './engine';

export interface GameSoundOptions extends EngineOptions {
  /** Test hook: rethrow errors instead of swallowing them (production never lets audio crash the game). */
  strict?: boolean;
}
export * from './theory';

/** Procedural audio for Unspool: no files, everything is synthesized with WebAudio.
 *
 * - master bus: gain -> gentle compressor -> destination, with a generated-impulse reverb send
 * - ambience: intermittent music-box phrases (denser with `frame.life`), sea waves near water, light wind
 * - music-box melody per thread kind, footsteps, pickup / reel / taut / connect / revive / finale
 * - UI clicks and per-voice dialogue babble
 *
 * The context is created only after a user gesture (`start()`, or a UI sound once the page has
 * been interacted with) and every method is a safe no-op when WebAudio is unavailable.
 * Real recordings can replace any synthesized event later via `registerSample`; nothing is
 * registered or loaded by default. */
export class GameSound {
  private readonly engine: AudioEngine;
  private readonly synth: Synth;
  private readonly music: MusicPlayer;
  private readonly sfx: Sfx;
  private readonly ambience: Ambience;
  private readonly babble: Babble;
  private stepClock = 0;
  private wasGrounded = true;
  private airborneVertical = 0;

  private readonly strict: boolean;

  constructor(options: GameSoundOptions = {}) {
    this.strict = !!options.strict;
    this.engine = new AudioEngine(options);
    this.synth = new Synth(this.engine);
    this.music = new MusicPlayer(this.engine, this.synth);
    this.sfx = new Sfx(this.engine, this.synth, this.music);
    this.ambience = new Ambience(this.engine, this.music);
    this.babble = new Babble(this.engine);
  }

  get enabled(): boolean { return this.engine.enabled; }
  get started(): boolean { return this.engine.started; }
  /** True once the context exists and sound can play right now. */
  get live(): boolean { return this.engine.live() !== null; }

  /** Call from a user gesture (the start button). Creates and resumes the audio context. */
  start(): void { this.guard(() => this.engine.start()); }
  setEnabled(enabled: boolean): void { this.guard(() => this.engine.setEnabled(enabled)); }
  setPaused(paused: boolean): void { this.guard(() => this.engine.setPaused(paused)); }
  dispose(): void { this.guard(() => { this.ambience.stop(this.engine.live()); this.babble.stop(); this.engine.dispose(); }); }

  /** Replace a synthesized event with a recording (decoded lazily on first use; synth until ready). */
  registerSample(event: SoundEvent, url: string, options?: SampleOptions): void { this.engine.samples.register(event, url, options); }
  unregisterSample(event: SoundEvent): void { this.engine.samples.unregister(event); }
  /** Fetch and decode every registered sample now (call after a gesture). */
  async preloadSamples(): Promise<void> {
    const g = this.engine.ensure();
    if (g) await this.engine.samples.preload(g.ctx);
  }

  ui(action: UiSound): void {
    this.play(`ui.${action}` as SoundEvent, 'sfx', g => this.sfx.ui(g, action));
  }

  /** Per-frame driver: ambience, footsteps, jump/land, dialogue babble. */
  update(frame: SoundFrame): void {
    this.guard(() => {
      const g = this.engine.live();
      if (!g) { this.stepClock = 0; return; }
      const active = frame.active ?? true;
      this.babble.update(frame.dt, g);
      this.ambience.update(frame, g);
      if (!active) { this.wasGrounded = frame.grounded; return; }

      // Jump and landing from ground-contact transitions.
      const vertical = frame.verticalSpeed ?? 0;
      if (this.wasGrounded && !frame.grounded && vertical > 1) this.play('jump', 'sfx', gg => this.sfx.jump(gg));
      if (!frame.grounded) this.airborneVertical = Math.min(this.airborneVertical, vertical);
      if (!this.wasGrounded && frame.grounded) {
        const intensity = clamp01(-this.airborneVertical / 6);
        if (this.airborneVertical < -0.8) this.play('land', 'sfx', gg => this.sfx.land(gg, intensity));
        this.airborneVertical = 0;
      }
      this.wasGrounded = frame.grounded;

      if (frame.grounded && frame.moving > 0.1) {
        this.stepClock += frame.dt * (frame.sprinting ? 2.6 : 2.1) * Math.min(1.3, frame.moving);
        if (this.stepClock >= 1) {
          this.stepClock -= 1;
          this.play('step', 'sfx', gg => this.sfx.footstep(gg, { water: !!frame.water, sprint: !!frame.sprinting }));
        }
      } else this.stepClock = Math.min(this.stepClock, 0.6);
    });
  }

  /** Start syllable babble in `voice` (safe to call every frame while text is revealing). */
  dialogue(voice: Voice): void { this.guard(() => this.babble.set(voice)); }
  stopDialogue(): void { this.babble.stop(); }

  /** Music-box note for step `index` of a thread of `kind` (a pentatonic tune as you walk). */
  threadStep(index: number, kind: ThreadKind): void {
    this.guard(() => { const g = this.engine.live(); if (g) this.music.threadStep(g, index, kind); });
  }
  threadPickup(): void { this.play('thread.pickup', 'sfx', g => this.sfx.pickup(g)); }
  threadReel(): void { this.play('thread.reel', 'sfx', g => this.sfx.reel(g)); }
  threadTaut(): void { this.play('thread.taut', 'sfx', g => this.sfx.taut(g)); }
  connect(kind?: ThreadKind): void { this.play('connect', 'sfx', g => this.sfx.connect(g, kind)); }
  revive(): void { this.play('revive', 'sfx', g => this.sfx.revive(g)); }
  chapterComplete(): void { this.play('chapterComplete', 'music', g => this.music.chapterComplete(g)); }

  // ---------------------------------------------------------------- internals
  /** Play a registered sample if one is ready, otherwise run the synth version. */
  private play(event: SoundEvent, bus: 'sfx' | 'music', synth: (g: Graph) => void): void {
    this.guard(() => {
      const g = this.engine.live();
      if (!g) return;
      if (this.engine.samples.has(event) && this.engine.samples.play(g.ctx, g[bus].input, event)) return;
      synth(g);
    });
  }

  /** Audio must never take the game down. */
  private guard(run: () => void): void {
    try { run(); } catch (error) {
      if (this.strict) throw error;
      if (typeof console !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) console.warn('audio', error);
    }
  }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0.2, value));

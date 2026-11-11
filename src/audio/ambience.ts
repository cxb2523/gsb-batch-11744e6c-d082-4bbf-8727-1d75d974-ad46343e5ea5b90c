import type { AudioEngine, Graph, NoiseColor } from './engine';
import type { MusicPlayer } from './music';
import {
  PAD_CHORDS, PAD_CHORD_SECONDS, clamp, mulberry32, nextChordIndex, phraseInterval, phraseNotes,
  pickSparkleMidi, sparkleInterval, sparkleVelocity,
} from './theory';
import type { SoundFrame } from './types';

/** The background beds: sea waves that swell near water, light wind, and intermittent music-box
 * phrases over the slow chord progression. Parameters are retargeted a dozen times a second with
 * smooth time constants; between phrases only the sea and wind remain. */

interface Beds {
  seaGain: GainNode; foamGain: GainNode; windGain: GainNode; windFilter: BiquadFilterNode;
  sources: AudioScheduledSourceNode[];
}

const CONTROL_INTERVAL = 0.08;
const PHRASE_TAIL = 1.2;
const PHRASE_GAP = 1.8;

export class Ambience {
  private beds: Beds | null = null;
  private chord = 0;
  private chordClock = 0;
  private sparkleClock = 4;
  private phraseClock = 8;
  private phraseBusy = 0;
  private controlClock = 1;
  private readonly rng = mulberry32(0xa11ce);
  private loop: AudioBufferSourceNode | null = null;

  constructor(private readonly engine: AudioEngine, private readonly music: MusicPlayer) {}

  update(frame: SoundFrame, g: Graph): void {
    const beds = this.beds ?? (this.beds = this.build(g));
    const dt = Math.min(frame.dt, 0.25);
    const life = clamp(frame.life ?? 0);
    const active = frame.active ?? true;
    this.chordClock += dt;
    this.controlClock += dt;
    this.sparkleClock -= dt;
    this.phraseClock -= dt;
    this.phraseBusy = Math.max(0, this.phraseBusy - dt);

    if (this.chordClock >= PAD_CHORD_SECONDS) {
      this.chordClock = 0;
      this.chord = nextChordIndex(this.chord);
    }

    // A registered recorded music bed replaces the synthesized phrases entirely.
    const hasLoop = this.engine.samples.has('music.loop');
    if (hasLoop && !this.loop) this.loop = this.engine.samples.play(g.ctx, g.music.input, 'music.loop');

    if (this.phraseClock <= 0) {
      this.phraseClock = phraseInterval(life, this.rng);
      if (active && !hasLoop) {
        const phrase = phraseNotes(this.chord, life, this.rng);
        if (this.music.phrase(g, phrase)) {
          const busy = phrase[phrase.length - 1].offset + PHRASE_TAIL;
          this.phraseBusy = Math.max(this.phraseBusy, busy);
          this.sparkleClock = Math.max(this.sparkleClock, busy + PHRASE_GAP);
        }
      }
    }

    if (this.sparkleClock <= 0) {
      this.sparkleClock = sparkleInterval(life, this.rng);
      if (active && this.phraseBusy <= 0 && this.phraseClock > PHRASE_GAP) {
        this.music.twinkle(g, pickSparkleMidi(life, this.rng), sparkleVelocity(life));
      }
    }

    if (this.controlClock < CONTROL_INTERVAL) return;
    this.controlClock = 0;
    const t = g.ctx.currentTime;

    g.ambient.input.gain.setTargetAtTime(active ? 1 : 0.4, t, 0.5);

    // Sea: silent away from the water, swelling to the same peak right beside it.
    const near = clamp(frame.waterNear ?? (frame.water ? 1 : 0));
    const sea = 0.33 * near;
    beds.seaGain.gain.setTargetAtTime(sea, t, 1.6);
    beds.foamGain.gain.setTargetAtTime(sea * 0.35, t, 1.6);
    const moving = clamp(frame.moving / 1.3);
    const wind = 0.02 + 0.035 * moving + (frame.grounded ? 0 : 0.07);
    beds.windGain.gain.setTargetAtTime(wind, t, 0.7);
    beds.windFilter.frequency.setTargetAtTime(420 + 260 * moving + (frame.grounded ? 0 : 300), t, 0.8);
  }

  private build(g: Graph): Beds {
    const { ctx } = g;
    const sources: AudioScheduledSourceNode[] = [];
    const out = g.ambient.input;
    const start = <T extends AudioScheduledSourceNode>(node: T): T => { node.start(); sources.push(node); return node; };

    // ---- sea: dark swell plus a hissing foam layer riding its own slowly drifting LFO
    const noiseSource = (color: NoiseColor): AudioBufferSourceNode => {
      const source = ctx.createBufferSource(); source.buffer = this.engine.noise(color); source.loop = true;
      source.start(0, Math.random() * 3); sources.push(source);
      return source;
    };
    const seaFilter = ctx.createBiquadFilter(); seaFilter.type = 'lowpass'; seaFilter.frequency.value = 650; seaFilter.Q.value = 0.5;
    const seaSwell = ctx.createGain(); seaSwell.gain.value = 0.62;
    const seaGain = ctx.createGain(); seaGain.gain.value = 0;
    noiseSource('brown').connect(seaFilter).connect(seaSwell).connect(seaGain).connect(out);
    const seaLfo = start(ctx.createOscillator()); seaLfo.frequency.value = 0.125;
    const seaDepth = ctx.createGain(); seaDepth.gain.value = 0.38; seaLfo.connect(seaDepth).connect(seaSwell.gain);
    const seaTone = ctx.createGain(); seaTone.gain.value = 350; seaLfo.connect(seaTone).connect(seaFilter.frequency);
    const foamHigh = ctx.createBiquadFilter(); foamHigh.type = 'highpass'; foamHigh.frequency.value = 1800;
    const foamLow = ctx.createBiquadFilter(); foamLow.type = 'lowpass'; foamLow.frequency.value = 5200;
    const foamSwell = ctx.createGain(); foamSwell.gain.value = 0.5;
    const foamGain = ctx.createGain(); foamGain.gain.value = 0;
    noiseSource('white').connect(foamHigh).connect(foamLow).connect(foamSwell).connect(foamGain).connect(out);
    const foamLfo = start(ctx.createOscillator()); foamLfo.frequency.value = 0.131;
    const foamDepth = ctx.createGain(); foamDepth.gain.value = 0.5; foamLfo.connect(foamDepth).connect(foamSwell.gain);

    // ---- wind
    const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 460; windFilter.Q.value = 0.6;
    const windSwell = ctx.createGain(); windSwell.gain.value = 0.6;
    const windGain = ctx.createGain(); windGain.gain.value = 0.02;
    noiseSource('pink').connect(windFilter).connect(windSwell).connect(windGain).connect(out);
    const windLfo = start(ctx.createOscillator()); windLfo.frequency.value = 0.063;
    const windDepth = ctx.createGain(); windDepth.gain.value = 0.4; windLfo.connect(windDepth).connect(windSwell.gain);
    const windSweep = ctx.createGain(); windSweep.gain.value = 180; windLfo.connect(windSweep).connect(windFilter.frequency);

    return { seaGain, foamGain, windGain, windFilter, sources };
  }

  /** Fade the beds out (used on dispose / when the game is torn down). */
  stop(g: Graph | null): void {
    if (!g || !this.beds) return;
    const t = g.ctx.currentTime;
    this.beds.seaGain.gain.setTargetAtTime(0, t, 0.2);
    this.beds.foamGain.gain.setTargetAtTime(0, t, 0.2);
    this.beds.windGain.gain.setTargetAtTime(0, t, 0.2);
  }
}

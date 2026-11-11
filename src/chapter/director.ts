import { Vector3 } from 'three';
import {
  CONNECTIONS, THREAD_COLORS, connectionById, NPC_PLACEMENTS,
  type ConnectionId, type NpcId, type SocketId,
} from './data';
import { PHONE_SPEAKERS, type StoryKey } from './script';
import { storyLines, storyText } from './text';
import type { ChapterProgress } from './progress';
import type { EnvironmentFx, Resident, ThreadSystem, World } from '../contracts';
import { revival } from '../art/revival';
import type { GameSound, Voice } from '../audio';

/** Chapter-one story logic: availability, objectives, dialogue choice,
 * reactions to finished connections and the finale. Presentation modules
 * (world, residents, fx, sound, ui) are driven only through their contracts. */

export interface DirectorUi {
  showNotice(text: () => string, seconds?: number): void;
  /** `speaker` lets the camera frame whoever is talking. */
  showSequence(beats: { name: () => string; lines: () => string[]; voice: Voice; speaker?: NpcId }[], onDone: () => void): void;
  showChapterEnd(): void;
  /** Cinematic lines over the finale camera move. */
  showCaption(text: () => string, seconds: number): void;
  /** Start the finale camera move (overview → far house). */
  playFinale(): void;
}

export interface DirectorSky { setDusk(amount: number): void }

export interface Objective { title: string; detail: string; target: Vector3 | null; targetName: string | null }

const VOICES: Record<NpcId, Voice> = {
  wick: 'low', marlo: 'mid', pim: 'child', bram: 'low', sprout: 'high', sol: 'high', otto: 'low', ike: 'mid', cat: 'cat',
};
const ROOTS: ConnectionId[] = ['fh', 'fw', 'fo'];

export class ChapterDirector {
  readonly completed = new Set<ConnectionId>();
  finaleProgress = 0;
  private finaleRunning = false;
  private pending: { at: number; run: () => void }[] = [];
  private clock = 0;
  /** Called after a connection's story reactions are applied. */
  onChange: () => void = () => {};

  constructor(
    private readonly world: World,
    private readonly residents: Resident[],
    private readonly thread: ThreadSystem,
    private readonly fx: EnvironmentFx,
    private readonly sky: DirectorSky,
    private readonly sound: GameSound,
    private readonly progress: ChapterProgress,
    private readonly ui: DirectorUi,
  ) {
    thread.onConnected = (id, end) => { this.connected(id, end); this.onChange(); };
    thread.onStep = (index, kind) => sound.threadStep(index, kind);
  }

  get life(): number { return this.completed.size / CONNECTIONS.length; }
  get finished(): boolean { return this.progress.has('finale'); }
  has(id: ConnectionId): boolean { return this.completed.has(id); }

  /** Apply saved progress without transitions. */
  restore(): void {
    this.completed.clear();
    this.pending = [];
    this.finaleRunning = false;
    revival.reset();
    for (const id of this.progress.completed) {
      this.completed.add(id);
      const connection = connectionById(id);
      revival.addWave(this.world.anchors.sockets[connection.to].position, connection.revive, { instant: true });
      if (connection.reviveFrom) revival.addWave(this.socketPosition(connection.from), connection.reviveFrom, { instant: true });
      this.world.activate(id, true);
    }
    for (const resident of this.residents) {
      const appearsAfter = NPC_PLACEMENTS.find(npc => npc.id === resident.id)!.appearsAfter;
      if (!appearsAfter || this.completed.has(appearsAfter)) resident.appear(true);
    }
    this.thread.restore(this.progress.threads);
    if (this.finished) this.applyFinale(1, true);
    this.refreshAvailability();
    revival.setGlobalLife(this.life);
  }

  refreshAvailability(): void {
    const available = new Set<ConnectionId>();
    for (const connection of CONNECTIONS) {
      if (!this.completed.has(connection.id) && connection.requires.every(id => this.completed.has(id))) available.add(connection.id);
    }
    this.thread.setAvailable(available);
  }

  private socketPosition(socket: SocketId): Vector3 { return this.world.anchors.sockets[socket].position; }

  objective(playerPosition: Vector3): Objective {
    // Keep showing the connection while its light pulse is still travelling.
    const carried = this.thread.carrying ?? this.thread.connecting ?? null;
    const make = (key: StoryKey, target: SocketId | null, values: Record<string, number> = {}): Objective => ({
      title: storyText(key, values),
      detail: storyText(`${key}.detail` as StoryKey),
      target: target ? this.socketPosition(target) : null,
      targetName: target ? storyText(`socket.${target}` as StoryKey) : null,
    });
    if (this.finished) return make('obj.done', null);
    if (carried) {
      const connection = connectionById(carried);
      const key = (connection.kind === 'root' ? 'obj.roots' : `obj.${carried}`) as StoryKey;
      return make(key, connection.to, { count: ROOTS.filter(id => this.completed.has(id)).length });
    }
    if (!this.has('h1')) return make('obj.h1', 'generator');
    if (!this.has('h2')) return make('obj.h2', 'lighthouse_box');
    const available = CONNECTIONS.filter(connection => !this.completed.has(connection.id) && connection.requires.every(id => this.completed.has(id)));
    if (!available.length) return make('obj.done', null);
    // Prefer the nearest startable thread so the hint follows the player's own route.
    available.sort((a, b) => this.socketPosition(a.from).distanceTo(playerPosition) - this.socketPosition(b.from).distanceTo(playerPosition));
    const next = available[0];
    if (!this.has('w1') && !this.has('o1') && next.district !== 'workshop' && next.district !== 'oldstreet') return make('obj.explore', null);
    const key = (next.kind === 'root' ? 'obj.roots' : `obj.${next.id}`) as StoryKey;
    return make(key, next.from, { count: ROOTS.filter(id => this.completed.has(id)).length });
  }

  private dialogueKey(id: NpcId): StoryKey {
    const final = this.finished;
    switch (id) {
      case 'wick':
        if (!this.progress.has('seen:wick.intro')) return 'wick.intro';
        if (final) return 'wick.final';
        if (!this.has('h1')) return 'wick.waiting';
        if (!this.has('h2')) return 'wick.after_h1';
        return 'wick.after_h2';
      case 'marlo': return final ? 'marlo.final' : this.has('h2') ? 'marlo.after_h2' : 'marlo.arrive';
      case 'pim': return final ? 'pim.final' : 'pim.idle';
      case 'bram': return final ? 'bram.final' : this.has('w1') ? 'bram.after_w1' : 'bram.before_w1';
      case 'sprout': return final ? 'sprout.final' : this.has('w2') ? 'sprout.after_w2' : 'sprout.before_w2';
      case 'sol':
        if (final) return 'sol.final';
        if (this.has('o2')) return 'sol.after_o2';
        return this.has('o1') ? 'sol.after_o1' : 'sol.before_o1';
      case 'otto': return this.has('o2') ? 'otto.after_o2' : 'otto.before_o2';
      case 'ike': return this.has('o2') ? 'ike.after_o2' : 'ike.before_o2';
      case 'cat': return final ? 'cat.final' : 'cat.idle';
    }
  }

  /** Text for talking to a resident; marks it seen. */
  dialogue(id: NpcId): { name: () => string; lines: () => string[]; voice: Voice; key: StoryKey } {
    const key = this.dialogueKey(id);
    return { key, name: () => storyText(`name.${id}` as StoryKey), lines: () => storyLines(key), voice: VOICES[id] };
  }
  markSeen(key: StoryKey): void { this.progress.flag(`seen:${key}`); }
  /** Residents with something new to say show a marker. */
  hasNews(id: NpcId): boolean { return id !== 'cat' && !this.progress.has(`seen:${this.dialogueKey(id)}`); }
  get introPending(): boolean { return !this.progress.has('seen:wick.intro'); }

  private connected(id: ConnectionId, end: Vector3): void {
    const connection = connectionById(id);
    this.completed.add(id);
    this.progress.complete(id, this.thread.serialize());
    revival.addWave(end, connection.revive);
    // the string lights come on along the whole street, from both ends
    if (connection.reviveFrom) this.after(.6, () => revival.addWave(this.socketPosition(connection.from), connection.reviveFrom!));
    revival.setGlobalLife(this.life);
    this.world.activate(id, false);
    this.fx.burst(end, end.clone().normalize(), THREAD_COLORS[connection.kind]);
    this.sound.connect(connection.kind);
    this.after(0.35, () => this.sound.revive());
    this.ui.showNotice(() => storyText('notice.connected', { name: storyText(`conn.${id}` as StoryKey) }), 4);
    for (const resident of this.residents) {
      const placement = NPC_PLACEMENTS.find(npc => npc.id === resident.id)!;
      if (placement.appearsAfter === id) this.after(1.2, () => resident.appear(false));
      else if (resident.present && placement.district === connection.district) this.after(0.6 + Math.random() * 0.5, () => resident.perform('cheer', 2.2));
    }
    this.refreshAvailability();
    if (id === 'o2' && !this.progress.has('phone')) this.after(2.2, () => this.playPhone());
    if (ROOTS.every(root => this.completed.has(root)) && !this.finished) this.after(2.5, () => this.startFinale());
  }

  private playPhone(): void {
    this.progress.flag('phone');
    const otto = this.residents.find(resident => resident.id === 'otto');
    const ike = this.residents.find(resident => resident.id === 'ike');
    otto?.perform('lean', 12); ike?.perform('lean', 12);
    this.ui.showSequence(PHONE_SPEAKERS.map((speaker, i) => ({
      name: () => storyText(`name.${speaker}` as StoryKey),
      lines: () => [storyText(`phone.${i + 1}` as StoryKey)],
      voice: VOICES[speaker],
      speaker,
    })), () => { otto?.perform('cheer', 2); ike?.perform('cheer', 2); });
  }

  private startFinale(): void {
    if (this.finaleRunning) return;
    this.finaleRunning = true;
    revival.addWave(this.world.anchors.greatTree.position, 70, { seconds: 7 });
    this.sound.chapterComplete();
    this.ui.playFinale();
    this.after(2.5, () => this.ui.showCaption(() => storyText('final.1'), 5));
    this.after(10.5, () => this.ui.showCaption(() => storyText('final.2'), 4.5));
    this.after(15.5, () => {
      this.progress.flag('finale');
      this.ui.showChapterEnd();
    });
  }

  private applyFinale(amount: number, _instant: boolean): void {
    this.finaleProgress = amount;
    this.world.setFinale(amount);
    this.fx.setDusk(amount * 0.65);
    this.sky.setDusk(amount * 0.65);
    if (amount >= 1) revival.addWave(this.world.anchors.greatTree.position, 70, { instant: true });
  }

  private after(seconds: number, run: () => void): void { this.pending.push({ at: this.clock + seconds, run }); }

  update(dt: number): void {
    this.clock += dt;
    if (this.finaleRunning && this.finaleProgress < 1) this.applyFinale(Math.min(1, this.finaleProgress + dt / 8), false);
    const due = this.pending.filter(item => item.at <= this.clock);
    if (due.length) {
      this.pending = this.pending.filter(item => item.at > this.clock);
      for (const item of due) item.run();
    }
  }

  restart(): void {
    this.progress.restart();
    this.thread.reset();
    this.finaleProgress = 0;
    this.applyFinale(0, true);
    this.restore();
  }
}

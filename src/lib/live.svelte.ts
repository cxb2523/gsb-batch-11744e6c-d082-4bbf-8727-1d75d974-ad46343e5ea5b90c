import { onMount } from 'svelte';
import { Fleet, type Tracked } from './fleet.js';
import { settings } from './settings/settings.svelte.js';
import type { Snapshot, TrainReading } from './types.js';

// a reading this old has fallen behind, rather than just catching up
const STALE_SECONDS = 90;

export type Feed = 'connecting' | 'unreachable' | 'behind' | 'catchingUp' | 'live';

/** Polls the shared reading and keeps the fleet moving between them */
export class Live {
  snapshot = $state.raw<Snapshot | null>(null);
  failing = $state(false);
  /** The time, ticking each second while a page is connected */
  now = $state(Date.now());
  readonly fleet = new Fleet();
  #every = 10_000;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #polling = false;
  #pages = 0;

  /** Milliseconds between polls */
  set every(ms: number) {
    this.#every = ms;
    if (this.#timer) this.#wait();
  }

  // the fleet keeps its trains to itself, so this looks again whenever a reading lands
  /** Trains on the map, rather than fading off it */
  running = $derived.by(() => {
    void this.snapshot;
    return [...this.fleet.trains.values()].filter((train) => !train.gone);
  });

  #byReading = $derived(new Map(this.running.map((train) => [train.reading, train])));

  /** Which train a board's reading is, while it's still on the map */
  trainOf = (reading: TrainReading): Tracked | undefined => this.#byReading.get(reading);

  /** Seconds since TfL was read */
  get age() {
    return this.snapshot ? (this.now - this.snapshot.at) / 1000 : Infinity;
  }

  get feed(): Feed {
    if (!this.snapshot) return this.failing ? 'unreachable' : 'connecting';
    if (this.age > STALE_SECONDS) return 'behind';
    return this.failing || this.snapshot.stale ? 'catchingUp' : 'live';
  }

  // clearing first, so a poll still out across a stop and start can't leave two loops
  #wait() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#poll();
    }, this.#every);
  }

  async #poll() {
    let snapshot: Snapshot | null = null;
    try {
      // no-cache, as the zone stretches max-age on edge hits and the poll would freeze
      const res = await fetch('/api/live', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Live feed answered ${res.status}`);
      snapshot = await res.json();
      this.failing = false;
    } catch {
      this.failing = true;
    }
    if (this.#polling) this.#wait();
    // outside the try, so a bug in here gets reported rather than passed off as the network
    if (snapshot && (!this.snapshot || snapshot.at > this.snapshot.at)) {
      this.fleet.update(snapshot);
      this.snapshot = snapshot;
    }
  }

  start() {
    if (this.#polling) return;
    this.#polling = true;
    this.#poll();
  }

  stop() {
    this.#polling = false;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** Keeps it coming while a page is open, resting while it's out of sight; returns the undo */
  connect() {
    this.#pages++;
    this.start();
    this.now = Date.now();
    const tick = setInterval(() => (this.now = Date.now()), 1000);
    const wake = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener('visibilitychange', wake);
    return () => {
      // the next page may have connected before this one's gone
      if (!--this.#pages) this.stop();
      clearInterval(tick);
      document.removeEventListener('visibilitychange', wake);
    };
  }
}

/** One for every page, so going between them carries on with the same trains */
export const live = new Live();

/** Keeps the trains coming, as often as the settings say, for as long as the page calling it is open */
export function connectLive() {
  $effect(() => {
    live.every = settings.refresh * 1000;
  });
  onMount(() => live.connect());
}

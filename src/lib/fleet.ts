import { layouts, type Layout } from './layout.js';
import { along, locate, measureRuns, route, schedule, type Leg, type Placement } from './motion.js';
import type { LineId } from './lines.js';
import { span } from './network.js';
import type { Snapshot, TrainReading } from './types.js';

export interface Tracked {
  key: string;
  reading: TrainReading;
  legs: Leg[];
  shown: Placement;
  opacity: number;
  gone: boolean;
}

interface Sighting {
  reading: TrainReading;
  legs: Leg[];
  target: Placement;
}

// a nameless train that's moved further than this between readings is someone else
const SAME_TRAIN_METRES = 1000;
const FADE_SECONDS = 0.8;
// how quickly a train closes the gap to where it should be, and picks up or sheds speed doing it
const CATCH_SECONDS = 2;
const PICK_UP_SECONDS = 0.5;
const TURN_SECONDS = 0.3;
// about 100mph, twice a tube train's top speed, so catching up looks like hurrying
const MAX_SPEED = 45;
// any further ahead or behind and it fades across, rather than race there or wait for ages
const RUN_METRES = 1500;
const HOLD_METRES = 1000;

const turn = (from: number, to: number, k: number) => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * k;
};

/** The way along the line to where a train should be, and whether that's back behind it */
function gap(line: LineId, shown: Placement, target: Placement) {
  const way = route(line, shown, target);
  return {
    way,
    metres: way ? way.end - way.start : Infinity,
    behind: Boolean(way?.back) && Math.cos(target.angle - shown.angle) > 0
  };
}

const tooFar = ({ metres, behind }: ReturnType<typeof gap>) =>
  metres > (behind ? HOLD_METRES : RUN_METRES);

/** Runs a train along its line to where it should be, faster the further behind it is */
function chase(line: LineId, shown: Placement, target: Placement, dt: number, layout: Layout) {
  const { way, metres, behind } = gap(line, shown, target);
  if (!way) return target;
  // a reading a little behind where it's drawn means wait for it to come by
  if (behind) return along(line, shown.between, shown.f * span(shown.between), layout);
  const want = Math.min(MAX_SPEED, metres / CATCH_SECONDS + target.speed);
  // turning round, it has to lose its old speed before setting off the other way
  const was = way.back ? -shown.speed : shown.speed;
  const speed = was + (want - was) * (1 - Math.exp(-dt / PICK_UP_SECONDS));
  const step = Math.min(metres, Math.max(0, speed) * dt);
  // caught up, so it rides exactly where it should be, facing however that is
  if (metres - step < 0.1) return target;
  return { ...along(line, way.path, way.start + step, layout), speed };
}

/** Where a train's come from when its reading doesn't say, going by the run it was on */
function recall({ from, stops }: TrainReading, before: Tracked): number | null {
  if (from !== null) return from;
  const came = before.legs.find((leg) => leg.to === stops[0][0])?.from ?? null;
  // unless it's turned round and is heading back there
  return came === stops[1]?.[0] ? null : came;
}

/** Whether a new sighting could be a train on the map, rather than one fading off it */
const alike = (train: Tracked, { reading, target }: Sighting) =>
  !train.gone &&
  train.reading.line === reading.line &&
  train.reading.id === reading.id &&
  // a nameless one only has where it's going and which way it's facing to go on
  (reading.id !== null ||
    (train.reading.to === reading.to && Math.cos(train.shown.angle - target.angle) > -0.2));

let serial = 0;

/** Keeps every train on screen between readings, each matched up with its next sighting */
export class Fleet {
  trains = new Map<string, Tracked>();
  #layout = layouts.geographic;

  update(snapshot: Snapshot, now = Date.now()) {
    const runs = measureRuns(snapshot.trains);
    const sight = (reading: TrainReading, from = reading.from): Sighting => {
      const legs = schedule({ ...reading, from }, snapshot.at, runs);
      const target = locate(reading.line, legs, reading.stops[0][0], now / 1000, this.#layout);
      return { reading, legs, target };
    };
    const sightings = snapshot.trains.map((reading) => sight(reading));
    // each goes to the nearest train that could be it, which also says where it's come from
    const pairs = sightings.flatMap((first) =>
      [...this.trains.values()].flatMap((train) => {
        if (!alike(train, first)) return [];
        const { reading } = first;
        const from = recall(reading, train);
        const sighting = from === reading.from ? first : sight(reading, from);
        const off = gap(reading.line, train.shown, sighting.target);
        const near = reading.id !== null || off.metres < SAME_TRAIN_METRES;
        return near ? [{ first, sighting, train, off }] : [];
      })
    );
    const next = new Map<string, Tracked>();
    const track = (key: string, { reading, legs, target }: Sighting, shown = target, opacity = 0) =>
      next.set(key, { key, reading, legs, shown, opacity, gone: false });
    const seen = new Set<Sighting>();
    pairs.sort((a, b) => a.off.metres - b.off.metres);
    for (const { first, sighting, train, off } of pairs) {
      if (seen.has(first) || next.has(train.key)) continue;
      seen.add(first);
      if (!tooFar(off)) {
        track(train.key, sighting, train.shown, Math.max(0, train.opacity));
        continue;
      }
      // it fades out where it was as it fades back in where it is
      const ghost = `${train.key}~${++serial}`;
      next.set(ghost, { ...train, key: ghost, gone: true });
      track(train.key, sighting);
    }
    for (const sighting of sightings) {
      if (!seen.has(sighting)) track(`${sighting.reading.id ?? 'anon'}#${++serial}`, sighting);
    }
    // anything already fading out has had its time, even if the map's been asleep
    for (const [key, train] of this.trains) {
      if (!next.has(key) && !train.gone) next.set(key, { ...train, gone: true });
    }
    this.trains = next;
  }

  /** Moves everything on by `dt` seconds, running each along its line to the latest reading */
  step(now: number, dt: number, layout = layouts.geographic) {
    // a map that's changing under the trains turns them with it
    const k = layout === this.#layout ? 1 - Math.exp(-dt / TURN_SECONDS) : 1;
    this.#layout = layout;
    for (const [key, train] of this.trains) {
      if (train.gone) {
        train.opacity -= dt / FADE_SECONDS;
        if (train.opacity <= 0) this.trains.delete(key);
        continue;
      }
      const { line, stops } = train.reading;
      const target = locate(line, train.legs, stops[0][0], now / 1000, layout);
      const { shown } = train;
      const next = chase(line, shown, target, dt, layout);
      train.shown = {
        ...next,
        angle: turn(shown.angle, next.angle, k),
        ox: shown.ox + (next.ox - shown.ox) * k,
        oy: shown.oy + (next.oy - shown.oy) * k
      };
      train.opacity = Math.min(1, train.opacity + dt / FADE_SECONDS);
    }
  }
}

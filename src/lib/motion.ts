import { layouts, pointAlong, type Layout } from './layout.js';
import type { LineId } from './lines.js';
import { lane, lineGraph, pathBetween, runTime, span, stations, type Point } from './network.js';
import type { TrainReading } from './types.js';

/** One hop between calls, in epoch seconds */
export interface Leg {
  from: number;
  to: number;
  depart: number;
  arrive: number;
}

export interface Placement extends Point {
  /** Sideways nudge onto the line's own strand, in strand widths, applied in screen space */
  ox: number;
  oy: number;
  angle: number;
  /** Set while the train is stood at a station */
  at: number | null;
  /** The stations either side of it, facing the second, and how far along it is between them */
  between: [number, number];
  f: number;
  /** Metres a second the way it faces */
  speed: number;
}

/** Live run times keyed `line:from>to`, measured off every train's own ETAs */
export type Runs = Map<string, number>;

const dwellFor = (gap: number) => Math.min(30, gap * 0.3);
const MIN_RUN = 5;

export function measureRuns(trains: TrainReading[]): Runs {
  const gaps = new Map<string, number[]>();
  for (const train of trains) {
    for (let i = 1; i < train.stops.length; i++) {
      const key = `${train.line}:${train.stops[i - 1][0]}>${train.stops[i][0]}`;
      const gap = train.stops[i][1] - train.stops[i - 1][1];
      if (gap > 20) gaps.set(key, [...(gaps.get(key) ?? []), gap]);
    }
  }
  return new Map(
    [...gaps].map(([key, values]) => [key, values.sort((a, b) => a - b)[values.length >> 1]])
  );
}

/** The neighbour a train must be coming from, given where it's off to next */
function approachTo(line: LineId, first: number, ahead: number | undefined): number | null {
  const around = [...(lineGraph.get(line)?.get(first) ?? [])];
  const next = ahead === undefined ? undefined : pathBetween(line, first, ahead)?.[1];
  // at the end of the line, a train heading back out is starting from here
  if (around.length < 2) return around[0] === next ? null : (around[0] ?? null);
  if (next === undefined) return null;
  const here = stations[first];
  const out = { x: stations[next].x - here.x, y: stations[next].y - here.y };
  const straightness = (n: number) => {
    const back = { x: here.x - stations[n].x, y: here.y - stations[n].y };
    return (
      (back.x * out.x + back.y * out.y) / (Math.hypot(back.x, back.y) * Math.hypot(out.x, out.y))
    );
  };
  return (
    around.filter((n) => n !== next).sort((a, b) => straightness(b) - straightness(a))[0] ?? null
  );
}

/** When the train leaves and reaches each call, from TfL's arrival estimates */
export function schedule(train: TrainReading, at: number, runs: Runs = new Map()): Leg[] {
  const start = at / 1000;
  const [first, firstEta] = train.stops[0];
  const legs: Leg[] = [];
  const standing = /^At /i.test(train.where);
  const known = train.from !== null && pathBetween(train.line, train.from, first) !== null;
  const before =
    train.from === first
      ? null
      : known
        ? train.from
        : approachTo(train.line, first, train.stops[1]?.[0] ?? train.dest ?? undefined);
  if (before !== null) {
    const live = runs.get(`${train.line}:${before}>${first}`);
    const run = live ? live - dwellFor(live) : runTime(train.line, before, first);
    const arrive = start + firstEta;
    // TfL saying it's still at the platform beats an ETA that says it's long gone
    const depart =
      standing && before === train.from
        ? Math.min(Math.max(arrive - run, start), arrive - MIN_RUN)
        : arrive - run;
    legs.push({ from: before, to: first, depart, arrive });
  }
  for (let i = 1; i < train.stops.length; i++) {
    const [from, leaves] = train.stops[i - 1];
    const [to, arrives] = train.stops[i];
    legs.push({
      from,
      to,
      depart: start + leaves + dwellFor(arrives - leaves),
      arrive: start + arrives
    });
  }
  return legs;
}

/** How far along a run it is, out of 1, pulling away slowly and slowing in to the next */
export const ease = (f: number) => 0.5 - 0.5 * Math.cos(Math.PI * f);
// how fast `ease` is going at f, over a run of one second
const slope = (f: number) => (Math.PI / 2) * Math.sin(Math.PI * f);

// placed by real distance, so a train keeps the same pace on either map
export function along(line: LineId, path: number[], metres: number, layout: Layout): Placement {
  let left = metres;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const length = span([a, b]);
    if (left > length && i < path.length - 1) {
      left -= length;
      continue;
    }
    const f = length ? Math.min(1, left / length) : 0;
    const { x, y, angle, side } = pointAlong(layout.shape(a, b), f);
    const shift = lane(a, b, line);
    const [ox, oy] = [side.x * shift, side.y * shift];
    return { x, y, ox, oy, angle, at: null, between: [a, b], f, speed: 0 };
  }
  return standing(line, path[0], path[0], layout);
}

function standing(line: LineId, station: number, towards: number, layout: Layout): Placement {
  const next = pathBetween(line, station, towards)?.[1];
  if (next === undefined) {
    const { x, y } = layout.at[station];
    const between: [number, number] = [station, station];
    return { x, y, ox: 0, oy: 0, angle: 0, at: station, between, f: 0, speed: 0 };
  }
  return { ...along(line, [station, next], 0, layout), at: station };
}

/** The leg a train's on at `t` (epoch seconds), and how far through it, 0 while it's still stood */
export function legAt(legs: Leg[], t: number) {
  const leg = legs.find((l) => t < l.arrive) ?? legs.at(-1);
  if (!leg) return null;
  const run = Math.max(leg.arrive - leg.depart, MIN_RUN);
  return { leg, run, progress: Math.min(1, Math.max(0, (t - leg.depart) / run)) };
}

/** Where a train is at time `t` (epoch seconds), assuming it keeps to TfL's estimates */
export function locate(
  line: LineId,
  legs: Leg[],
  fallback: number,
  t: number,
  layout = layouts.geographic
): Placement {
  const on = legAt(legs, t);
  if (!on) return standing(line, fallback, fallback, layout);
  const { leg, run, progress } = on;
  if (t < leg.depart) return standing(line, leg.from, leg.to, layout);
  const path = pathBetween(line, leg.from, leg.to) ?? [leg.from, leg.to];
  const metres = span(path);
  const placed = along(line, path, ease(progress) * metres, layout);
  return { ...placed, at: progress === 1 ? leg.to : null, speed: (slope(progress) * metres) / run };
}

/** A way along a line between two placements, `start` and `end` being metres along `path` */
export interface Route {
  path: number[];
  start: number;
  end: number;
  /** Sets off backwards, against the way the first placement faces */
  back: boolean;
}

/** The shortest way along the line from one placement to another, never across country */
export function route(line: LineId, from: Placement, to: Placement): Route | null {
  const [a, b] = from.between;
  const [c, d] = to.between;
  const [ab, cd] = [span([a, b]), span([c, d])];
  if ((a === c && b === d) || (a === d && b === c)) {
    const [start, end] = [from.f * ab, (a === c ? to.f : 1 - to.f) * ab];
    return end < start
      ? { path: [b, a], start: ab - start, end: ab - end, back: true }
      : { path: [a, b], start, end, back: false };
  }
  let best: Route | null = null;
  // out the front first, so a tie keeps it heading the way it faces
  for (const back of [false, true]) {
    const [rear, out] = back ? [b, a] : [a, b];
    const start = (back ? 1 - from.f : from.f) * ab;
    for (const into of [c, d]) {
      const middle = pathBetween(line, out, into);
      if (!middle) continue;
      const end = ab + span(middle) + (into === c ? to.f : 1 - to.f) * cd;
      if (!best || end - start < best.end - best.start)
        best = { path: [rear, ...middle, into === c ? d : c], start, end, back };
    }
  }
  return best;
}

import type { Tracked } from '#lib/fleet.js';
import type { LineId } from '#lib/lines.js';
import { ease, legAt } from '#lib/motion.js';
import {
  lineRoutes,
  pathBetween,
  placeOf,
  routeGraph,
  stations,
  type Station
} from '#lib/network.js';

export interface Stop {
  station: Station;
  /** Strands that split off here, in the order they're drawn, ones that loop back drawn last */
  branches: Branch[];
}

export interface Branch {
  stops: Stop[];
  /** Where it meets the line again, or null where it runs out to an end */
  rejoins: Station | null;
  /** The stop it bends back into, where that's further down the strand it split off */
  into: Stop | null;
  /** That strand's stops it runs on down beside to get there */
  beside: Stop[];
}

/** Where a station sits down a branch, with its junction at -1 and where it rejoins at the end */
interface Spot {
  branch: Branch;
  i: number;
}

export interface Diagram {
  line: LineId;
  spine: Branch;
  /** Every place each station sits, its other platforms' included, for finding trains along it */
  spots: Map<number, Spot[]>;
}

/** A train between two stops as drawn */
export interface Marker {
  train: Tracked;
  /** The stop it's just gone past heading down */
  stop: Stop;
  /** How far on it is from there to the next stop down, below 0 still coming round the bend into it */
  f: number;
  down: boolean;
  /** How far over it is onto a loop running down beside the stop's own line, from 0 to 1 */
  beside: number;
}

type Graph = Map<number, Set<number>>;

// TfL lists the odd station twice for different trains, like Clapham Junction each way round
function aliases(graph: Graph) {
  const alias = new Map<number, number>();
  for (const [a, around] of graph) {
    for (const [b, others] of graph) {
      if (a === b || alias.has(a) || alias.has(b) || placeOf(a) !== placeOf(b)) continue;
      if ([...around].every((n) => others.has(n))) alias.set(a, b);
    }
  }
  return alias;
}

/** A route's calls, with any it makes twice put back, as TfL lists each only once */
function restored(line: LineId, route: number[]) {
  const calls = new Set(route);
  return route.flatMap((stop, i) => {
    if (i === 0) return [stop];
    const between = (pathBetween(line, route[i - 1], stop) ?? []).slice(1, -1);
    // only where the track runs through a stop it calls at elsewhere, like the Circle's Edgware Road
    return between.length && between.every((s) => calls.has(s)) ? [...between, stop] : [stop];
  });
}

/** From its north or west end, whichever way the line mostly runs, so it reads like a map */
function downward(path: number[]) {
  const [a, b] = [stations[path[0]], stations[path.at(-1)!]];
  const flip = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? b.x < a.x : b.y < a.y;
  return flip ? path.toReversed() : path;
}

/** A line as its longest route, with every other way it goes branching off, each station drawn once */
export function diagram(line: LineId): Diagram {
  const calls = routeGraph.get(line)!;
  const alias = aliases(calls);
  const same = (index: number) => alias.get(index) ?? index;
  const graph: Graph = new Map();
  for (const [a, around] of calls) {
    for (const b of around) {
      if (same(a) !== same(b)) graph.set(same(a), (graph.get(same(a)) ?? new Set()).add(same(b)));
    }
  }
  const drawn = new Set<number>();

  // the longest way on through stations not drawn yet, ending where it meets a drawn one again;
  // every way gets tried, which is quick as even the DLR is very nearly a tree
  function furthest(path: number[]): number[] {
    let best = path;
    for (const next of graph.get(path.at(-1)!) ?? []) {
      if (path.includes(next)) continue;
      const way = !drawn.has(next)
        ? furthest([...path, next])
        : path.length > 1
          ? [...path, next]
          : path;
      if (way.length > best.length) best = way;
    }
    return best;
  }

  function strand(path: number[]): Branch {
    const last = path.at(-1)!;
    const rejoins = drawn.has(last) ? stations[last] : null;
    const own = rejoins ? path.slice(0, -1) : path;
    // all of it first, so a branch further up can't run off down this one
    for (const index of own) drawn.add(index);
    const stops = own.map((index) => {
      const branches: Branch[] = [];
      for (let way = furthest([index]); way.length > 1; way = furthest([index]))
        branches.push(strand(way.slice(1)));
      return { station: stations[index], branches };
    });
    // a loop back into this strand runs on down beside it, so nothing can be drawn after it
    stops.forEach((stop, j) => {
      for (const branch of stop.branches) {
        const r = stops.findIndex((other, k) => k > j && other.station === branch.rejoins);
        if (r > j) [branch.into, branch.beside] = [stops[r], stops.slice(j + 1, r)];
      }
      stop.branches.sort((a, b) => Number(a.into !== null) - Number(b.into !== null));
    });
    return { stops, rejoins, into: null, beside: [] };
  }

  const longest = lineRoutes.get(line)!.reduce((a, b) => (b.length > a.length ? b : a));
  const path = restored(line, longest)
    .map(same)
    .filter((stop, i, all) => stop !== all[i - 1]);
  const spine = strand(downward(path));
  return { line, spine, spots: spotsOf(spine, alias) };
}

function spotsOf(spine: Branch, alias: Map<number, number>) {
  const spots = new Map<number, Spot[]>();
  const note = (station: Station, spot: Spot) =>
    spots.set(station.index, [...(spots.get(station.index) ?? []), spot]);
  function walk(branch: Branch, junction: Station | null) {
    if (junction) note(junction, { branch, i: -1 });
    if (branch.rejoins) note(branch.rejoins, { branch, i: branch.stops.length });
    branch.stops.forEach((stop, i) => {
      note(stop.station, { branch, i });
      for (const sub of stop.branches) walk(sub, stop.station);
    });
  }
  walk(spine, null);
  for (const [other, same] of alias) spots.set(other, spots.get(same)!);
  return spots;
}

/** The stop a station's drawn as, rather than a junction or rejoin it's also at */
function stopOf({ spots }: Diagram, station: number) {
  const spot = spots.get(station)?.find(({ branch, i }) => branch.stops[i]);
  return spot && spot.branch.stops[spot.i];
}

/** Every stop, top to bottom as drawn, each branch straight after where it splits off */
export function* stopsOf(branch: Branch): Generator<Stop> {
  for (const stop of branch.stops) {
    yield stop;
    for (const sub of stop.branches) yield* stopsOf(sub);
  }
}

/** Where trains start and finish, top to bottom */
export function ends(diagram: Diagram): string[] {
  const routes = lineRoutes.get(diagram.line)!;
  const ends = new Set(
    routes.flatMap((route) => [route[0], route.at(-1)!].map((s) => stopOf(diagram, s)))
  );
  const names = [...stopsOf(diagram.spine)].filter((stop) => ends.has(stop));
  return [...new Set(names.map((stop) => stop.station.name))];
}

// the branch both ends of a leg are closest together on, as a station can be on two
function nearest({ spots }: Diagram, from: number, to: number) {
  let best: { branch: Branch; from: number; to: number } | null = null;
  for (const a of spots.get(from) ?? []) {
    for (const b of spots.get(to) ?? []) {
      if (a.branch === b.branch && (!best || Math.abs(b.i - a.i) < Math.abs(best.to - best.from)))
        best = { branch: a.branch, from: a.i, to: b.i };
    }
  }
  return best;
}

/** Where `x` stops down a branch is drawn, which past a loop's last stop is on down beside the line */
function along(branch: Branch, x: number) {
  const last = branch.stops.length - 1;
  if (x <= last) {
    const i = Math.max(Math.floor(x), 0);
    return { stop: branch.stops[i], f: x - i, beside: 0 };
  }
  // from its last stop down past each it runs beside, then across the bend into the one it rejoins
  const way = [branch.stops[last], ...branch.beside];
  const u = (x - last) * (way.length + 1);
  const k = Math.floor(u);
  if (k >= way.length) return { stop: branch.into!, f: 0, beside: 1 - (u - k) };
  return { stop: way[k], f: u - k, beside: k > 0 ? 1 : 0 };
}

/** Where every train is down the diagram, `t` in epoch seconds */
export function markers(diagram: Diagram, trains: Tracked[], t: number): Marker[] {
  let order: Stop[] | undefined;
  return trains.flatMap((train) => {
    const on = legAt(train.legs, t);
    const start = on && stopOf(diagram, on.leg.from);
    const end = on && stopOf(diagram, on.leg.to);
    if (!on || !start || !end) return [];
    const best = nearest(diagram, on.leg.from, on.leg.to);
    // with no line drawn between them, like the DLR's triangle at Poplar, it waits at one end or the other
    const rejoining = best && Math.max(best.from, best.to) === best.branch.stops.length;
    if (!best || (rejoining && !best.branch.into)) {
      order ??= [...stopsOf(diagram.spine)];
      const down = order.indexOf(end) > order.indexOf(start);
      return [{ train, stop: on.progress < 0.5 ? start : end, f: 0, down, beside: 0 }];
    }
    const { branch, from, to } = best;
    const x = from + ease(on.progress) * (to - from);
    // stood at a junction or where a branch rejoins, it's at that station's own stop
    const placed =
      Number.isInteger(x) && !branch.stops[x]
        ? { stop: x === from ? start : end, f: 0, beside: 0 }
        : along(branch, x);
    return [{ train, ...placed, down: to > from }];
  });
}

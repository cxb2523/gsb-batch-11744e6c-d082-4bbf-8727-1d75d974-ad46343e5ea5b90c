import data from './data/network.json' with { type: 'json' };
import { LINE_IDS, type LineId } from './lines.js';

export interface Point {
  x: number;
  y: number;
}

export interface Station extends Point {
  index: number;
  id: string;
  name: string;
  lat: number;
  lon: number;
  hub: string | null;
  lines: LineId[];
}

// Metres east and south of Charing Cross, near enough flat for one city
const ORIGIN = { lat: 51.5074, lon: -0.1278 };
const KX = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const KY = 110_574;

export const project = (lon: number, lat: number): Point => ({
  x: (lon - ORIGIN.lon) * KX,
  y: (ORIGIN.lat - lat) * KY
});

export const unproject = ({ x, y }: Point) => ({
  lon: x / KX + ORIGIN.lon,
  lat: ORIGIN.lat - y / KY
});

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Metres along a run of stations, straight from each to the next */
export function span(path: number[]) {
  let metres = 0;
  for (let i = 1; i < path.length; i++)
    metres += distance(stations[path[i - 1]], stations[path[i]]);
  return metres;
}

export const middle = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length
});

/** One key for the track between two stations, whichever way round */
export const pair = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export const stations: Station[] = data.stations.map((s, index) => ({
  index,
  id: s.id,
  name: s.name,
  lat: s.lat,
  lon: s.lon,
  hub: 'hub' in s ? (s.hub as string) : null,
  lines: [],
  ...project(s.lon, s.lat)
}));

export const stationById = new Map(stations.map((s) => [s.id, s]));

interface LineData {
  id: LineId;
  routes: number[][];
  runs: Record<string, number>;
}

const lineData = data.lines as unknown as LineData[];

/** Each line's routes as TfL lists them, every call in order */
export const lineRoutes = new Map(lineData.map((line) => [line.id, line.routes]));

const link = (graph: Map<number, Set<number>>, a: number, b: number) => {
  graph.set(a, (graph.get(a) ?? new Set()).add(b));
  graph.set(b, (graph.get(b) ?? new Set()).add(a));
};

/** Each line's calls as TfL runs them, for working out which train is which */
export const routeGraph = new Map<LineId, Map<number, Set<number>>>();

for (const line of lineData) {
  const graph = new Map<number, Set<number>>();
  for (const route of line.routes) {
    for (let i = 1; i < route.length; i++) {
      link(graph, route[i - 1], route[i]);
    }
    for (const stop of route) {
      if (!stations[stop].lines.includes(line.id)) stations[stop].lines.push(line.id);
    }
  }
  routeGraph.set(line.id, graph);
}

export interface Track {
  a: number;
  b: number;
  lines: LineId[];
}

/** Track between neighbouring stations, with fast runs already laid along the stops they skip */
export const tracks: Track[] = (data.tracks as unknown as Track[]).map(({ a, b, lines }) => ({
  a,
  b,
  lines
}));
const trackByPair = new Map(tracks.map((track) => [pair(track.a, track.b), track]));

/** Each line's drawn graph */
export const lineGraph = new Map<LineId, Map<number, Set<number>>>();
for (const { a, b, lines } of tracks) {
  for (const line of lines) {
    if (!lineGraph.has(line)) lineGraph.set(line, new Map());
    link(lineGraph.get(line)!, a, b);
  }
}

/** A line's drawn graph as unbroken runs between its ends and junctions */
function runsOf(graph: Map<number, Set<number>>): number[][] {
  const walked = new Set<string>();
  const runs: number[][] = [];
  // ends and junctions first, so only a loop with neither starts mid-way round
  const starts = [...graph.keys()].sort(
    (a, b) => Number(graph.get(a)!.size === 2) - Number(graph.get(b)!.size === 2)
  );
  for (const start of starts) {
    for (const first of graph.get(start)!) {
      if (walked.has(pair(start, first))) continue;
      const run = [start];
      let [previous, here] = [start, first];
      while (!walked.has(pair(previous, here))) {
        walked.add(pair(previous, here));
        run.push(here);
        const onward = graph.get(here)!;
        if (onward.size !== 2) break;
        [previous, here] = [here, [...onward].find((next) => next !== previous)!];
      }
      runs.push(run);
    }
  }
  return runs;
}

export const lineRuns = new Map([...lineGraph].map(([line, graph]) => [line, runsOf(graph)]));

/** How many strands a line sits to one side of a shared track's middle, heading from a to b */
export function lane(a: number, b: number, line: LineId): number {
  const lines = trackByPair.get(pair(a, b))?.lines ?? [line];
  const slot = lines.indexOf(line) - (lines.length - 1) / 2;
  return a < b ? slot : -slot;
}

/** The side a lane leans to, square to a heading */
export const sideways = (from: Point, to: Point): Point => {
  const length = distance(from, to) || 1;
  return { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
};

type Cache<T> = Map<LineId, Map<number, T>>;

// per line, keyed `from * 1024 + to`, as these get asked for thousands of times a snapshot
function cached<T>(cache: Cache<T>, line: LineId, from: number, to: number, work: () => T): T {
  if (!cache.has(line)) cache.set(line, new Map());
  const mine = cache.get(line)!;
  const key = from * 1024 + to;
  if (!mine.has(key)) mine.set(key, work());
  return mine.get(key)!;
}

function shortest(graph: Map<number, Set<number>> | undefined, from: number, to: number) {
  const via = new Map<number, number>([[from, from]]);
  const queue = [from];
  while (queue.length && !via.has(to)) {
    const here = queue.shift()!;
    for (const next of graph?.get(here) ?? []) {
      if (via.has(next)) continue;
      via.set(next, here);
      queue.push(next);
    }
  }
  if (!via.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(via.get(path[0])!);
  return path;
}

const drawnPaths: Cache<number[] | null> = new Map();
const routePaths: Cache<number[] | null> = new Map();
const times: Cache<number> = new Map();

/** Stations a train on this line passes between two calls, ends included, as drawn */
export const pathBetween = (line: LineId, from: number, to: number) =>
  cached(drawnPaths, line, from, to, () => shortest(lineGraph.get(line), from, to));

/** How many calls apart two stations are on a line, or Infinity if it never links them */
export const callsApart = (line: LineId, from: number, to: number) => {
  const path = cached(routePaths, line, from, to, () => shortest(routeGraph.get(line), from, to));
  return path ? path.length - 1 : Infinity;
};

const runs = new Map(lineData.map((line) => [line.id, line.runs]));

/** Timetabled seconds between two neighbouring calls, else a guess off the distance */
export function runTime(line: LineId, from: number, to: number): number {
  const timetabled = runs.get(line)?.[`${from}>${to}`];
  return timetabled || 30 + span(pathBetween(line, from, to) ?? [from, to]) / 14;
}

/** Timetabled seconds between any two stations on a line, call by call */
export const travelTime = (line: LineId, from: number, to: number) =>
  cached(times, line, from, to, () => {
    const path = shortest(routeGraph.get(line), from, to) ?? [from, to];
    let seconds = 0;
    for (let i = 1; i < path.length; i++) seconds += runTime(line, path[i - 1], path[i]);
    return seconds;
  });

export interface Place {
  slug: string;
  name: string;
  /** More than one where a hub has stations side by side under the one name */
  members: Station[];
  lines: LineId[];
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// a hub's stations that share a name are one place to anyone using them
const grouped = new Map<string, Station[]>();
for (const station of stations) {
  const key = `${station.hub ?? station.id}|${station.name}`;
  grouped.set(key, [...(grouped.get(key) ?? []), station]);
}
const taken = new Map<string, number>();
for (const [first] of grouped.values()) {
  const slug = slugify(first.name);
  taken.set(slug, (taken.get(slug) ?? 0) + 1);
}

/** Every station under its own name, which is what each gets a page for */
export const places: Place[] = [...grouped.values()].map((members) => {
  const lines = LINE_IDS.filter((line) => members.some((s) => s.lines.includes(line)));
  const slug = slugify(members[0].name);
  // the odd name two separate stations share takes the first line to tell them apart
  return {
    slug: taken.get(slug)! > 1 ? `${slug}-${lines[0]}` : slug,
    name: members[0].name,
    members,
    lines
  };
});

const placeByStation = new Map(places.flatMap((place) => place.members.map((s) => [s, place])));

export const placeOf = (index: number) => placeByStation.get(stations[index])!;

export const placeBySlug = new Map(places.map((place) => [place.slug, place]));

export const placesOn = (line: LineId) => places.filter((place) => place.lines.includes(line));

/** Where trains call next either way along each of a place's lines, fast ones included */
export function neighbours(place: Place) {
  return place.lines.map((line) => {
    const next = new Map<Place, number>();
    for (const from of place.members) {
      for (const to of routeGraph.get(line)?.get(from.index) ?? []) {
        const there = placeOf(to);
        if (there !== place && !next.has(there)) next.set(there, runTime(line, from.index, to));
      }
    }
    const stops = [...next].map(([place, seconds]) => ({ place, seconds }));
    return { line, next: stops.sort((a, b) => a.seconds - b.seconds) };
  });
}

const apart = (a: Place, b: Place) =>
  Math.min(...a.members.flatMap((m) => b.members.map((n) => distance(m, n))));

/** Other places within so many metres as the crow flies, nearest first */
export const nearby = (place: Place, metres: number) =>
  places
    .filter((other) => other !== place)
    .map((other) => ({ place: other, metres: apart(place, other) }))
    .filter((near) => near.metres <= metres)
    .sort((a, b) => a.metres - b.metres);

export const generated = data.generated;

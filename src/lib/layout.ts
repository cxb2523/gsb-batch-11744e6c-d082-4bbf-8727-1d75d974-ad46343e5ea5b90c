import data from './data/network.json' with { type: 'json' };
import { distance, project, sideways, stations, type Point } from './network.js';

export type Style = 'geographic' | 'schematic';

/** Where one way of drawing the network puts everything */
export interface Layout {
  at: Point[];
  /** The track from a station to its neighbour, both ends included */
  shape: (a: number, b: number) => Point[];
  river: Point[][];
  /** Where somewhere real, like you, lands on this map */
  place: (p: Point) => Point;
}

interface TrackShapes {
  a: number;
  b: number;
  geo: [number, number][];
  tube: [number, number][];
}

const shapes = data.tracks as unknown as TrackShapes[];

function layout(
  at: Point[],
  bends: (track: TrackShapes) => Point[],
  river: Point[][],
  place: Layout['place']
): Layout {
  const lines = new Map<string, Point[]>();
  for (const track of shapes) {
    const line = [at[track.a], ...bends(track), at[track.b]];
    lines.set(`${track.a}>${track.b}`, line);
    lines.set(`${track.b}>${track.a}`, line.toReversed());
  }
  return { at, shape: (a, b) => lines.get(`${a}>${b}`) ?? [at[a], at[b]], river, place };
}

const geographic = layout(
  stations,
  (track) => track.geo.map(([lon, lat]) => project(lon, lat)),
  data.thames.geo.map((way) => way.map(([lon, lat]) => project(lon, lat))),
  (p) => p
);

const tubeAt = (data.stations as unknown as { tube: [number, number] }[]).map(
  ({ tube: [x, y] }) => ({ x, y })
);

/** Moves a real point the way its nearest stations moved, so it lands among them on the tube map */
function warp(p: Point): Point {
  const near = stations
    .map((station) => ({ station, d: distance(station, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  if (near[0].d < 1) return tubeAt[near[0].station.index];
  let [x, y, total] = [0, 0, 0];
  for (const { station, d } of near) {
    const weight = 1 / d ** 2;
    x += weight * (tubeAt[station.index].x - station.x);
    y += weight * (tubeAt[station.index].y - station.y);
    total += weight;
  }
  return { x: p.x + x / total, y: p.y + y / total };
}

const schematic = layout(
  tubeAt,
  (track) => track.tube.map(([x, y]) => ({ x, y })),
  data.thames.tube.map((way) => way.map(([x, y]) => ({ x, y }))),
  warp
);

export const layouts: Record<Style, Layout> = { geographic, schematic };

/** The point a fraction of the way along a shape, which way it's heading and its side there */
export function pointAlong(shape: Point[], f: number) {
  let left = f * shape.slice(1).reduce((sum, p, i) => sum + distance(shape[i], p), 0);
  for (let i = 1; i < shape.length; i++) {
    const [a, b] = [shape[i - 1], shape[i]];
    const length = distance(a, b);
    if (left > length && i < shape.length - 1) {
      left -= length;
      continue;
    }
    const k = length ? Math.min(1, left / length) : 0;
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      side: sideways(a, b)
    };
  }
  return { ...shape[0], angle: 0, side: { x: 0, y: 0 } };
}

// enough points along each track and the river that one map's shapes fold smoothly into the other's
const SAMPLES = 24;
const RIVER_SAMPLES = 240;
const sampled = new WeakMap<Layout, Map<string, Point[]>>();

function samples(layout: Layout, key: string, line: () => Point[], count: number): Point[] {
  if (!sampled.has(layout)) sampled.set(layout, new Map());
  const cache = sampled.get(layout)!;
  if (!cache.has(key)) {
    const points = line();
    cache.set(
      key,
      Array.from({ length: count }, (_, i) => pointAlong(points, i / (count - 1)))
    );
  }
  return cache.get(key)!;
}

/** A layout part way (t from 0 to 1) from one to another, for animating the switch */
export function between(from: Layout, to: Layout, t: number): Layout {
  const mix = (p: Point, q: Point) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const blend = (key: string, line: (layout: Layout) => Point[], count: number) => {
    const ends = samples(to, key, () => line(to), count);
    return samples(from, key, () => line(from), count).map((p, i) => mix(p, ends[i]));
  };
  return {
    at: from.at.map((p, i) => mix(p, to.at[i])),
    shape: (a, b) => blend(`${a}>${b}`, (layout) => layout.shape(a, b), SAMPLES),
    river: from.river.map((_, i) =>
      blend(`river ${i}`, (layout) => layout.river[i], RIVER_SAMPLES)
    ),
    place: (p) => mix(from.place(p), to.place(p))
  };
}

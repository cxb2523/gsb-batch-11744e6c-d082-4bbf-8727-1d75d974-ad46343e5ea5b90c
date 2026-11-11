#!/usr/bin/env node
// Rebuilds src/lib/data/network.json from TfL, plus track shapes and the Thames from OpenStreetMap.
// With --tube-map it only lays the tube map out again, over the network already there
import { readFile, writeFile } from 'node:fs/promises';
import { distance, project, round } from './geo.mjs';
import { thames, trackShapes, UA } from './osm.mjs';
import { schematic } from './schematic.mjs';

const LINES = [
  'bakerloo',
  'central',
  'circle',
  'district',
  'hammersmith-city',
  'jubilee',
  'metropolitan',
  'northern',
  'piccadilly',
  'victoria',
  'waterloo-city',
  'elizabeth',
  'liberty',
  'lioness',
  'mildmay',
  'suffragette',
  'weaver',
  'windrush',
  'dlr',
  'tram'
];
const DIRECTIONS = ['inbound', 'outbound'];
const OUT = new URL('../src/lib/data/network.json', import.meta.url);
const TFL = 'https://api.tfl.gov.uk';

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

export async function tfl(path, params = {}) {
  const url = new URL(TFL + path);
  for (const [key, value] of Object.entries({ ...params, app_key: process.env.TFL_APP_KEY })) {
    if (value) url.searchParams.set(key, value);
  }
  for (let attempt = 1; ; attempt++) {
    await wait(300);
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt === 5)
      throw Object.assign(new Error(`TfL ${res.status} on ${path}`), { status: res.status });
    await wait(15_000 * attempt);
  }
}

export const cleanName = (name) =>
  name
    .replace(/(\s+(?:Underground|Rail|DLR) Station|\s+Tram Stop|-Underground)$/i, '')
    .replace(/\s*\((?:London|for [^)]*)\)|\s+ELL$/i, '')
    .replace(/\s*\((?:[^)]*(?:line|bakerloo|central|dist|h&c|circle))[^)]*\)/i, '')
    .trim();

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

/** Seconds between consecutive stops, from each pattern origin's own timetable */
async function runTimes(lineId, direction, origins, into) {
  for (const origin of origins) {
    const { timetable } = await tfl(`/Line/${lineId}/Timetable/${origin}`, { direction }).catch(
      () => ({})
    );
    for (const route of timetable?.routes ?? []) {
      for (const { intervals } of route.stationIntervals ?? []) {
        let from = origin;
        let at = 0;
        for (const { stopId, timeToArrival } of intervals) {
          const gap = (timeToArrival - at) * 60;
          if (gap > 0 && gap < 900)
            into.set(`${from}>${stopId}`, [...(into.get(`${from}>${stopId}`) ?? []), gap]);
          from = stopId;
          at = timeToArrival;
        }
      }
    }
  }
}

const link = (graph, a, b) => {
  graph.set(a, (graph.get(a) ?? new Set()).add(b));
  graph.set(b, (graph.get(b) ?? new Set()).add(a));
};

/** Shortest way round a link through other stations, if it's nearly as straight as the link */
function stoppingPath(links, at, a, b) {
  const chord = distance(at[a], at[b]);
  const best = new Map([[a, 0]]);
  const via = new Map();
  const queue = [a];
  while (queue.length) {
    queue.sort((p, q) => best.get(p) - best.get(q));
    const here = queue.shift();
    if (here === b) break;
    for (const next of links.get(here) ?? []) {
      if (here === a && next === b) continue;
      const cost = best.get(here) + distance(at[here], at[next]);
      if (cost > chord * 1.2 || cost >= (best.get(next) ?? Infinity)) continue;
      best.set(next, cost);
      via.set(next, here);
      queue.push(next);
    }
  }
  if (!via.has(b)) return [a, b];
  const path = [b];
  while (path[0] !== a) path.unshift(via.get(path[0]));
  return path;
}

/** Track between neighbouring stations and the lines on it, with fast runs laid along the stops they skip */
function drawnTracks(stations, lines) {
  const at = stations.map((s) => project([s.lon, s.lat]));
  const links = new Map();
  for (const stops of lines.flatMap((line) => line.routes)) {
    for (let i = 1; i < stops.length; i++) link(links, stops[i - 1], stops[i]);
  }
  const tracks = new Map();
  for (const line of lines) {
    for (const stops of line.routes) {
      for (let i = 1; i < stops.length; i++) {
        const path = stoppingPath(links, at, stops[i - 1], stops[i]);
        for (let j = 1; j < path.length; j++) {
          const [a, b] = [Math.min(path[j - 1], path[j]), Math.max(path[j - 1], path[j])];
          const track = tracks.get(`${a}-${b}`) ?? { a, b, lines: [] };
          if (!track.lines.includes(line.id)) track.lines.push(line.id);
          tracks.set(`${a}-${b}`, track);
        }
      }
    }
  }
  return [...tracks.values()];
}

async function main() {
  const stations = new Map();
  const lines = [];

  for (const lineId of LINES) {
    const routes = [];
    const observed = new Map();
    for (const direction of DIRECTIONS) {
      const sequence = await tfl(`/Line/${lineId}/Route/Sequence/${direction}`, {
        serviceTypes: 'Regular',
        excludeCrowding: 'true'
      });
      for (const stop of (sequence.stopPointSequences ?? []).flatMap((s) => s.stopPoint ?? [])) {
        if (stations.has(stop.id)) continue;
        stations.set(stop.id, {
          id: stop.id,
          name: cleanName(stop.name),
          lat: round(stop.lat),
          lon: round(stop.lon),
          ...(stop.topMostParentId?.startsWith('HUB') && { hub: stop.topMostParentId })
        });
      }
      const ordered = (sequence.orderedLineRoutes ?? [])
        .map((route) => route.naptanIds.filter((id, i, all) => all.indexOf(id) === i))
        .filter((stops) => stops.length > 1);
      routes.push(...ordered);
      await runTimes(lineId, direction, [...new Set(ordered.map((stops) => stops[0]))], observed);
    }
    const runs = Object.fromEntries([...observed].map(([key, gaps]) => [key, median(gaps)]));
    lines.push({ id: lineId, routes, runs });
    console.log(`${lineId}: ${routes.length} routes, ${Object.keys(runs).length} timed segments`);
  }

  // the mainline's "London Euston" and "Queens Park" go by the tube's names, so labels merge
  const plain = (name) => name.replace(/^London |'/g, '');
  const tube = [...stations.values()].filter((s) => s.hub && s.id.startsWith('940GZZLU'));
  for (const station of stations.values()) {
    const twin = tube.find((s) => s.hub === station.hub && plain(s.name) === plain(station.name));
    if (twin) station.name = twin.name;
  }

  const ids = [...stations.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const missing = lines.flatMap((line) => line.routes.flat()).filter((id) => !index.has(id));
  if (missing.length) throw new Error(`Routes name unknown stations: ${[...new Set(missing)]}`);

  const indexed = lines.map((line) => ({
    id: line.id,
    routes: line.routes.map((stops) => stops.map((id) => index.get(id))),
    runs: Object.fromEntries(
      Object.entries(line.runs)
        .filter(([key]) => key.split('>').every((id) => index.has(id)))
        .map(([key, seconds]) => [
          key
            .split('>')
            .map((id) => index.get(id))
            .join('>'),
          seconds
        ])
    )
  }));
  const everyStation = [...stations.values()];
  const tracks = drawnTracks(everyStation, indexed);
  const shapes = await trackShapes(everyStation, tracks);
  const river = await thames();
  const tubeMap = schematic(everyStation, tracks);
  const network = {
    generated: new Date().toISOString(),
    stations: everyStation.map((station, i) => ({ ...station, tube: tubeMap.at[i] })),
    lines: indexed,
    tracks: tracks.map((track, i) => ({ ...track, geo: shapes[i], tube: tubeMap.bends[i] })),
    thames: { geo: river, tube: tubeMap.river }
  };
  await writeFile(OUT, JSON.stringify(network));
  const points = river.reduce((sum, way) => sum + way.length, 0);
  console.log(
    `\n${ids.length} stations, ${tracks.length} tracks, ${river.length} river ways (${points} points)`
  );
}

/** The saved network with its tube map laid out afresh, for when only tube-map.mjs has changed */
async function relayout() {
  const network = JSON.parse(await readFile(OUT, 'utf8'));
  const { at, bends, river } = schematic(network.stations, network.tracks);
  network.stations.forEach((station, i) => (station.tube = at[i]));
  network.tracks.forEach((track, i) => (track.tube = bends[i]));
  network.thames.tube = river;
  await writeFile(OUT, JSON.stringify(network));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (process.argv.includes('--tube-map') ? relayout() : main()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

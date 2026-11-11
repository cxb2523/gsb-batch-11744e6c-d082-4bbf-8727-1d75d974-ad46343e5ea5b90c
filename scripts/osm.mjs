// OpenStreetMap: the Thames, and the real track each line runs along
import { distance, project, round, simplify } from './geo.mjs';

export const UA = 'tubespotting/1.0 (+https://github.com/NotAFlightRisk/tubespotting)';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const THAMES =
  '[out:json][timeout:60];way["waterway"="river"]["name"="River Thames"]' +
  '(51.36,-0.62,51.56,0.35);out geom;';

// how each line's route relations are named, ahead of the colon
const ROUTES = {
  bakerloo: 'Bakerloo line',
  central: 'Central line',
  circle: 'Circle line',
  district: 'District line',
  'hammersmith-city': 'Hammersmith & City line',
  jubilee: 'Jubilee line',
  metropolitan: 'Metropolitan line',
  northern: 'Northern line',
  piccadilly: 'Piccadilly line',
  victoria: 'Victoria line',
  'waterloo-city': 'Waterloo & City line',
  elizabeth: 'Elizabeth line',
  liberty: 'Liberty line',
  lioness: 'Lioness line',
  mildmay: 'Mildmay line',
  suffragette: 'Suffragette line',
  weaver: 'Weaver line',
  windrush: 'Windrush line',
  dlr: 'DLR',
  tram: 'London Trams'
};
const TRACKS =
  '[out:json][timeout:240];' +
  `rel["type"="route"]["route"~"^(subway|train|light_rail|tram)$"]["name"~"^(${Object.values(ROUTES).join('|')}):",i]` +
  '(51.2,-1.1,51.8,0.4);out body;way(r)["railway"];out geom;';
// a station's own position can be a little way off its platforms
const SNAP_METRES = 400;
const TOLERANCE_METRES = 8;

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Overpass is often too busy to answer, so it gets a few goes */
async function overpass(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'user-agent': UA, accept: 'application/json' },
      body: new URLSearchParams({ data: query })
    });
    if (res.ok && res.headers.get('content-type')?.includes('json')) return res.json();
    if (attempt === 6) throw new Error(`Overpass ${res.status}`);
    await wait(10_000 * attempt);
  }
}

const located = ({ lon, lat }) => ({ ...project([lon, lat]), ll: [round(lon), round(lat)] });

/** The Thames as one line from west to east, along its main channel rather than round islands */
export async function thames() {
  const { elements } = await overpass(THAMES);
  const at = new Map();
  const links = new Map();
  for (const way of elements) {
    const points = way.geometry.map(located);
    const length = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
    const [first, last] = [way.nodes[0], way.nodes.at(-1)];
    at.set(first, points[0]);
    at.set(last, points.at(-1));
    for (const [from, to, line] of [
      [first, last, points],
      [last, first, points.toReversed()]
    ]) {
      links.set(from, [...(links.get(from) ?? []), { to, length, line }]);
    }
  }
  const ends = [...at.keys()].sort((a, b) => at.get(a).x - at.get(b).x);
  const [west, east] = [ends[0], ends.at(-1)];
  const cost = new Map([[west, 0]]);
  const via = new Map();
  const open = new Set([west]);
  while (open.size) {
    const here = [...open].reduce((a, b) => (cost.get(a) <= cost.get(b) ? a : b));
    open.delete(here);
    if (here === east) break;
    for (const link of links.get(here) ?? []) {
      const c = cost.get(here) + link.length;
      if (c >= (cost.get(link.to) ?? Infinity)) continue;
      cost.set(link.to, c);
      via.set(link.to, { from: here, line: link.line });
      open.add(link.to);
    }
  }
  if (!via.has(east)) throw new Error("The Thames doesn't join up from end to end");
  const pieces = [];
  for (let here = east; via.has(here); here = via.get(here).from) {
    pieces.unshift(via.get(here).line);
  }
  const river = pieces.flatMap((line, i) => (i ? line.slice(1) : line));
  return [simplify(river, 20).map((p) => p.ll)];
}

/** Each line's running tracks as a graph of OSM nodes */
function trackGraphs(elements) {
  const ways = new Map(elements.filter((e) => e.type === 'way').map((way) => [way.id, way]));
  const relations = elements.filter((e) => e.type === 'relation');
  const graphs = new Map();
  for (const [line, name] of Object.entries(ROUTES)) {
    const nodes = new Map();
    const members = relations
      .filter((r) => r.tags.name.toLowerCase().startsWith(`${name.toLowerCase()}:`))
      .flatMap((r) => r.members.filter((m) => m.type === 'way' && m.role === ''));
    for (const { ref } of members) {
      const way = ways.get(ref);
      way?.nodes.forEach((id, i) => {
        if (!nodes.has(id)) nodes.set(id, { id, ...located(way.geometry[i]), next: new Set() });
        if (!i) return;
        nodes.get(id).next.add(way.nodes[i - 1]);
        nodes.get(way.nodes[i - 1]).next.add(id);
      });
    }
    graphs.set(line, nodes);
  }
  return graphs;
}

/** Track nodes by a station, and how far off each is */
function near(nodes, at) {
  const close = [...nodes.values()]
    .map((node) => [node, distance(node, at)])
    .filter(([, d]) => d < SNAP_METRES);
  const best = Math.min(...close.map(([, d]) => d));
  // a tunnel's two running lines are separate ways, so any that pass by will do
  return close.filter(([, d]) => d < best + 120);
}

/** Shortest way along the tracks between two stations, or null if they don't join up */
function follow(nodes, from, to) {
  const ends = new Map(near(nodes, to).map(([node, d]) => [node.id, d]));
  const cost = new Map(near(nodes, from).map(([node, d]) => [node.id, d]));
  const open = new Set(cost.keys());
  const via = new Map();
  let [found, total] = [null, Infinity];
  while (open.size) {
    const here = [...open].reduce((a, b) => (cost.get(a) <= cost.get(b) ? a : b));
    open.delete(here);
    if (cost.get(here) >= total) break;
    if (ends.has(here) && cost.get(here) + ends.get(here) < total) {
      [found, total] = [here, cost.get(here) + ends.get(here)];
    }
    const node = nodes.get(here);
    for (const next of node.next) {
      const c = cost.get(here) + distance(node, nodes.get(next));
      if (c >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, c);
      via.set(next, here);
      open.add(next);
    }
  }
  // a long way round means it's found some other line's track
  if (found === null || total > distance(from, to) * 2.5 + 300) return null;
  const path = [found];
  while (via.has(path[0])) path.unshift(via.get(path[0]));
  return path.map((id) => nodes.get(id));
}

/** The points each track bends through on its way between two stations, as [lon, lat] */
export async function trackShapes(stations, tracks) {
  const graphs = trackGraphs((await overpass(TRACKS)).elements);
  return tracks.map(({ a, b, lines }) => {
    const [from, to] = [stations[a], stations[b]].map((s) => project([s.lon, s.lat]));
    for (const line of lines) {
      const path = follow(graphs.get(line), from, to);
      if (path)
        return simplify([from, ...path, to], TOLERANCE_METRES)
          .slice(1, -1)
          .map((p) => p.ll);
    }
    console.warn(`No OSM track from ${stations[a].name} to ${stations[b].name}, so it's straight`);
    return [];
  });
}

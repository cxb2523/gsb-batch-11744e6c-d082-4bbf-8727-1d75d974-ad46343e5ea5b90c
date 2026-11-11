// A tube map of the network, laid out like TfL's own. Stations sit where tube-map.mjs puts them, on
// a grid of 45° steps, and each run of track between them is routed across that grid in turn. Once a
// grid edge is used no other line can take it, so lines never overlap.
import { distance, project } from './geo.mjs';
import { PLACES, THAMES, VIA } from './tube-map.mjs';

// metres of the drawn map per grid step
const ROOM = 230;
// the grid point that lands on Charing Cross, so the tube map sits over the real one
const CENTRE = { x: 84, y: 68 };

// what a route pays, per 45° turned, mid-track and while carrying a line through a station
const BEND = [0, 3, 7, Infinity, Infinity];
const THROUGH = [0, 3, 6, 9, 40];
const CROSSING = 2;
// for brushing past another line's station
const CROWDING = 1.5;
// for running over another route, which only happens when there's no other way
const CLASH = 40;
// grid steps a route may stray beyond the outermost stations
const MARGIN = 3;
// how much further a line can go by way of a stop and still be drawn through it
const DETOUR = 1.2;

const DIRECTIONS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1]
];
const START = DIRECTIONS.length;
const turn = (a, b) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);
const reverse = (d) => (d + 4) % 8;
const directionOf = (dx, dy) => DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
const stepLength = (d) => (d % 2 ? Math.SQRT2 : 1);
/** How far along a route each of its grid nodes is */
const distancesAlong = (ways) => ways.reduce((sum, d) => [...sum, sum.at(-1) + stepLength(d)], [0]);
const pair = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** What tube-map.mjs calls a station: its id where it's drawn apart from others of its name */
const nameOf = (station) => (station.id in PLACES ? station.id : station.name);
const pinOf = (station) => PLACES[nameOf(station)];

/** Stations pinned to the same spot become one place, as do those sharing a hub and a name */
function merge(stations, tracks) {
  const firsts = new Map();
  const place = stations.map((station, i) => {
    const key = pinOf(station)?.join() ?? `${station.hub ?? station.id}|${station.name}`;
    if (!firsts.has(key)) firsts.set(key, i);
    return firsts.get(key);
  });
  const links = new Map();
  for (const { a, b, lines } of tracks) {
    const [p, q] = [place[a], place[b]];
    if (p === q) continue;
    const link = links.get(pair(p, q)) ?? { a: p, b: q, lines: new Set() };
    for (const line of lines) link.lines.add(line);
    links.set(pair(p, q), link);
  }
  return { place, links: [...links.values()] };
}

/**
 * Links whose lines also run between their ends by way of one stop, nearly as directly, which the
 * tube map draws through that stop as one line
 */
function bypassed(stations, links) {
  const at = stations.map((s) => project([s.lon, s.lat]));
  const lines = new Map(links.map((link) => [pair(link.a, link.b), link.lines]));
  const carries = (a, b, carried) => [...carried].every((line) => lines.get(pair(a, b))?.has(line));
  return new Map(
    links.flatMap(({ a, b, lines: carried }) => {
      const by = links
        .flatMap((link) => (link.a === a ? [link.b] : link.b === a ? [link.a] : []))
        .find(
          (m) =>
            m !== b &&
            carries(a, m, carried) &&
            carries(m, b, carried) &&
            distance(at[a], at[m]) + distance(at[m], at[b]) < distance(at[a], at[b]) * DETOUR
        );
      return by === undefined ? [] : [[pair(a, b), { a, b, by }]];
    })
  );
}

/** Unbroken runs of stops between junctions, ends and pinned stations */
function chainsOf(links, pinned) {
  const around = new Map();
  const lines = new Map();
  for (const { a, b, lines: carried } of links) {
    around.set(a, (around.get(a) ?? new Set()).add(b));
    around.set(b, (around.get(b) ?? new Set()).add(a));
    lines.set(pair(a, b), carried);
  }
  const end = (s) => around.get(s).size !== 2 || pinned.has(s);
  const walked = new Set();
  const chains = [];
  for (const start of [...around.keys()].filter(end)) {
    for (const first of around.get(start)) {
      if (walked.has(pair(start, first))) continue;
      const stops = [start];
      let [previous, here] = [start, first];
      while (!walked.has(pair(previous, here))) {
        walked.add(pair(previous, here));
        stops.push(here);
        if (end(here)) break;
        [previous, here] = [here, [...around.get(here)].find((n) => n !== previous)];
      }
      if (stops[0] === stops.at(-1)) throw new Error(`Pin another station on the loop at ${start}`);
      const carried = stops.slice(1).flatMap((s, i) => [...lines.get(pair(stops[i], s))]);
      chains.push({ stops, lines: new Set(carried) });
    }
  }
  return chains;
}

class Heap {
  #items = [];

  get size() {
    return this.#items.length;
  }

  push(cost, value) {
    const items = this.#items;
    let i = items.push([cost, value]) - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (items[up][0] <= cost) return;
      [items[up], items[i]] = [items[i], items[up]];
      i = up;
    }
  }

  pop() {
    const items = this.#items;
    const top = items[0];
    const last = items.pop();
    if (!items.length) return top;
    items[0] = last;
    for (let i = 0; ;) {
      const [l, r] = [2 * i + 1, 2 * i + 2];
      let low = i;
      if (l < items.length && items[l][0] < items[low][0]) low = l;
      if (r < items.length && items[r][0] < items[low][0]) low = r;
      if (low === i) return top;
      [items[low], items[i]] = [items[i], items[low]];
      i = low;
    }
  }
}

class Grid {
  /** Grid nodes holding a station, and the station */
  stops = new Map();
  /** Which ways out of a station are taken, and by which lines */
  ports = new Map();
  /** Directions routes pass through a grid node in */
  passing = new Map();
  taken = new Set();

  constructor(pins) {
    const xs = [...pins.values()].map((p) => p.x);
    const ys = [...pins.values()].map((p) => p.y);
    this.x0 = Math.min(...xs) - MARGIN;
    this.y0 = Math.min(...ys) - MARGIN;
    this.width = Math.max(...xs) - this.x0 + MARGIN + 1;
    this.height = Math.max(...ys) - this.y0 + MARGIN + 1;
    this.at = new Map([...pins].map(([station, { x, y }]) => [station, this.node(x, y)]));
    for (const [station, n] of this.at) this.stops.set(n, station);
  }

  node(x, y) {
    const [gx, gy] = [x - this.x0, y - this.y0];
    return gx < 0 || gy < 0 || gx >= this.width || gy >= this.height ? -1 : gy * this.width + gx;
  }

  point(n) {
    return { x: (n % this.width) + this.x0, y: Math.floor(n / this.width) + this.y0 };
  }

  step(n, d) {
    const { x, y } = this.point(n);
    return this.node(x + DIRECTIONS[d][0], y + DIRECTIONS[d][1]);
  }

  edge(n, d) {
    return d < 4 ? n * 8 + d : this.step(n, d) * 8 + reverse(d);
  }

  /** Takes a grid edge, and the diagonal crossing it if there is one */
  take(n, d) {
    this.taken.add(this.edge(n, d));
    const [dx, dy] = DIRECTIONS[d];
    if (!dx || !dy) return;
    const { x, y } = this.point(n);
    this.taken.add(this.edge(this.node(x + dx, y), directionOf(-dx, dy)));
  }

  /** What leaving a station this way costs its lines, Infinity if the way's taken */
  portCost(station, d, lines) {
    let cost = 0;
    for (const port of this.ports.get(station) ?? []) {
      if (port.d === d) return Infinity;
      const shared = [...lines].filter((line) => port.lines.has(line)).length;
      cost += THROUGH[turn(reverse(port.d), d)] * Math.min(shared, 2);
    }
    return cost;
  }

  /** Whether a grid node is right by some other line's station */
  crowds(n, ends) {
    return DIRECTIONS.some((_, d) => {
      const station = this.stops.get(this.step(n, d));
      return station !== undefined && !ends.includes(station);
    });
  }

  /** Cheapest octilinear route for a chain, as [grid node, direction in] pairs, or null */
  route({ stops, lines }, relaxed = false) {
    const [from, to] = [stops[0], stops.at(-1)];
    const target = this.at.get(to);
    const blocked = relaxed ? CLASH : Infinity;
    const best = new Map([[this.at.get(from) * 9 + START, 0]]);
    const via = new Map();
    const heap = new Heap();
    heap.push(0, this.at.get(from) * 9 + START);
    while (heap.size) {
      const [cost, state] = heap.pop();
      if (cost > best.get(state)) continue;
      const [n, din] = [Math.floor(state / 9), state % 9];
      if (n === target) {
        const path = [state];
        while (via.has(path[0])) path.unshift(via.get(path[0]));
        return path.map((s) => [Math.floor(s / 9), s % 9]);
      }
      for (let d = 0; d < 8; d++) {
        const m = this.step(n, d);
        if (m < 0) continue;
        let c = cost + stepLength(d);
        if (din === START) c += this.portCost(from, d, lines);
        else if (this.passing.has(n) && d !== din) c += blocked;
        else c += BEND[turn(din, d)];
        if (this.taken.has(this.edge(n, d))) c += blocked;
        if (m === target) c += this.portCost(to, reverse(d), lines);
        else if (this.stops.has(m)) continue;
        else {
          const through = this.passing.get(m);
          // only straight across another route, never along it
          if (through) c += through.length > 1 || through[0] % 4 === d % 4 ? blocked : CROSSING;
          if (this.crowds(m, [from, to])) c += CROWDING;
        }
        const next = m * 9 + d;
        if (c < (best.get(next) ?? Infinity)) {
          best.set(next, c);
          via.set(next, state);
          heap.push(c, next);
        }
      }
    }
    return null;
  }

  /** A chain's route straight through the corners the tube map gives it, in the same form */
  walk({ stops }, corners) {
    const end = this.at.get(stops.at(-1));
    const path = [[this.at.get(stops[0]), START]];
    for (const to of [...corners.map(([x, y]) => ({ x, y })), this.point(end)]) {
      const from = this.point(path.at(-1)[0]);
      const [dx, dy] = [to.x - from.x, to.y - from.y];
      if (dx && dy && Math.abs(dx) !== Math.abs(dy)) {
        throw new Error(`No 45° way from ${JSON.stringify(from)} to ${JSON.stringify(to)}`);
      }
      const d = directionOf(Math.sign(dx), Math.sign(dy));
      for (let k = Math.max(Math.abs(dx), Math.abs(dy)); k > 0; k--) {
        const [n] = path.at(-1);
        const next = this.step(n, d);
        if (next < 0 || this.taken.has(this.edge(n, d)) || (next !== end && this.stops.has(next))) {
          throw new Error(
            `The way from ${JSON.stringify(from)} runs into another track or station`
          );
        }
        path.push([next, d]);
      }
    }
    return path;
  }

  /** Claims every grid edge a chain's route uses, and the ways out of the stations at its ends */
  commit({ stops, lines }, path) {
    const nodes = path.map(([n]) => n);
    const ways = path.slice(1).map(([, d]) => d);
    for (const [station, d] of [
      [stops[0], ways[0]],
      [stops.at(-1), reverse(ways.at(-1))]
    ]) {
      this.ports.set(station, [...(this.ports.get(station) ?? []), { d, lines }]);
    }
    ways.forEach((d, i) => this.take(nodes[i], d));
    for (let i = 1; i < nodes.length - 1; i++) {
      const through = [ways[i - 1], ...(ways[i] === ways[i - 1] ? [] : [ways[i]])];
      this.passing.set(nodes[i], [...(this.passing.get(nodes[i]) ?? []), ...through]);
    }
    return { points: nodes.map((n) => this.point(n)), ways };
  }
}

/** A chain's stops spread evenly along its route, off corners and crossings where there's room */
function spread(count, along, busy) {
  const total = along.at(-1);
  const goals = Array.from({ length: count }, (_, k) => (total * (k + 1)) / (count + 1));
  const straights = along.map((_, i) => i).filter((i) => i && i < along.length - 1 && !busy.has(i));
  if (straights.length < count) return [0, ...goals, total];
  let from = 0;
  const picks = goals.map((goal, k) => {
    const options = straights.slice(from, straights.length - (count - k - 1));
    const pick = options.reduce((a, b) =>
      Math.abs(along[b] - goal) < Math.abs(along[a] - goal) ? b : a
    );
    from = straights.indexOf(pick) + 1;
    return along[pick];
  });
  return [0, ...picks, total];
}

/** The point a given distance along a route */
function pointAt(points, along, distance) {
  let i = 1;
  while (i < along.length - 1 && along[i] < distance) i++;
  const f = Math.min(1, (distance - along[i - 1]) / (along[i] - along[i - 1]));
  const [a, b] = [points[i - 1], points[i]];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** A line cut into steps no longer than one grid step, so rounding it only touches the corners */
const finely = (line) =>
  line.flatMap((q, i) => {
    if (!i) return [q];
    const p = line[i - 1];
    const steps = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y));
    return Array.from({ length: steps }, (_, k) => {
      const f = (k + 1) / steps;
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    });
  });

/** Rounds off a line's corners, keeping its ends */
const chaikin = (line) =>
  line.length < 3
    ? line
    : [
        line[0],
        ...line.slice(1).flatMap((q, i) => {
          const p = line[i];
          const cut = (f) => ({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f });
          return [cut(0.25), cut(0.75)];
        }),
        line.at(-1)
      ];

/** Every station's place on the tube map, the corners each track turns, and the river */
export function schematic(stations, tracks) {
  const { place, links } = merge(stations, tracks);
  const pins = new Map();
  stations.forEach((station, i) => {
    const pin = pinOf(station);
    if (pin) pins.set(place[i], { x: pin[0], y: pin[1] });
  });
  const bypasses = bypassed(stations, links);
  const chains = chainsOf(
    links.filter(({ a, b }) => !bypasses.has(pair(a, b))),
    pins
  );
  const loose = new Set(chains.flatMap(({ stops }) => [stops[0], stops.at(-1)]));
  for (const s of pins.keys()) loose.delete(s);
  if (loose.size) {
    throw new Error(`Put these on the tube map: ${[...loose].map((s) => stations[s].name)}`);
  }

  /** The corners the tube map gives a track between two pinned stations, if any */
  const viaOf = ({ stops }) => {
    if (stops.length > 2) return undefined;
    const [a, b] = stops.map((s) => nameOf(stations[s]));
    return VIA[`${a}>${b}`] ?? VIA[`${b}>${a}`]?.toReversed();
  };
  const stray = Object.keys(VIA).length - chains.filter(viaOf).length;
  if (stray) throw new Error(`${stray} of the corners aren't for a track between pinned stations`);
  // runs the tube map shapes itself first, then the middle while there's still room there
  const order = (chain) =>
    viaOf(chain)
      ? -1
      : Math.hypot(
          pins.get(chain.stops[0]).x + pins.get(chain.stops.at(-1)).x - 2 * CENTRE.x,
          pins.get(chain.stops[0]).y + pins.get(chain.stops.at(-1)).y - 2 * CENTRE.y
        );
  const grid = new Grid(pins);
  const at = new Map();
  const corners = new Map();
  for (const chain of chains.sort((p, q) => order(p) - order(q))) {
    const via = viaOf(chain);
    const path = via ? grid.walk(chain, via) : (grid.route(chain) ?? grid.route(chain, true));
    if (!path) {
      throw new Error(`No room on the grid for ${chain.stops.map((s) => stations[s].name)}`);
    }
    const crossings = path.flatMap(([n], i) => (grid.passing.has(n) ? [i] : []));
    const { points, ways } = grid.commit(chain, path);
    const { stops } = chain;
    const along = distancesAlong(ways);
    const turns = ways.slice(1).flatMap((d, i) => (d === ways[i] ? [] : [i + 1]));
    const stopsAt = spread(stops.length - 2, along, new Set([...turns, ...crossings]));
    stops.forEach((s, i) => {
      const p = pointAt(points, along, stopsAt[i]);
      at.set(s, p);
      // so later routes go round it rather than through
      if (Number.isInteger(p.x) && Number.isInteger(p.y)) grid.stops.set(grid.node(p.x, p.y), s);
    });
    for (let i = 1; i < stops.length; i++) {
      const between = turns
        .filter((t) => along[t] > stopsAt[i - 1] + 1e-6 && along[t] < stopsAt[i] - 1e-6)
        .map((t) => points[t]);
      corners.set(`${stops[i - 1]}>${stops[i]}`, between);
      corners.set(`${stops[i]}>${stops[i - 1]}`, [...between].reverse());
    }
  }
  for (const { a, b, by } of bypasses.values()) {
    const through = [...corners.get(`${a}>${by}`), at.get(by), ...corners.get(`${by}>${b}`)];
    corners.set(`${a}>${b}`, through);
    corners.set(`${b}>${a}`, through.toReversed());
  }

  const world = ({ x, y }) => [
    Math.round((x - CENTRE.x) * ROOM),
    Math.round((y - CENTRE.y) * ROOM)
  ];
  return {
    at: stations.map((_, i) => world(at.get(place[i]))),
    bends: tracks.map(({ a, b }) => (corners.get(`${place[a]}>${place[b]}`) ?? []).map(world)),
    river: [chaikin(chaikin(finely(THAMES.map(([x, y]) => ({ x, y }))))).map(world)]
  };
}

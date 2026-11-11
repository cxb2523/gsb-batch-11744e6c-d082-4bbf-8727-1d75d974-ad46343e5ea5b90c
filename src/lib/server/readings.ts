import { isLineId, type LineId } from '#lib/lines.js';
import {
  callsApart,
  lineGraph,
  pair,
  pathBetween,
  stationById,
  stations,
  travelTime
} from '#lib/network.js';
import type { Closure, LineStatus, Stop, TrainReading } from '#lib/types.js';

export interface Prediction {
  vehicleId?: string;
  naptanId: string;
  lineId: string;
  platformName?: string;
  destinationNaptanId?: string;
  destinationName?: string;
  towards?: string;
  expectedArrival: string;
  currentLocation?: string;
}

interface Call {
  station: number;
  eta: number;
  platform: string;
  prediction: Prediction;
}

const ANONYMOUS = /^0*$/;
const HORIZON = 45 * 60;
// TfL repeats a call once per platform it might use, a few seconds apart
const SAME_CALL = 90;
const SAME_TRAIN = 45;
// fast trains skip a few stops between calls, but not half a line
const MAX_HOPS = 4;
// nothing on the tube is a quarter of an hour from its next stop unless it's parked
const FIRST_CALL = 15 * 60;

export const cleanName = (name: string) =>
  name
    .replace(/(\s+(?:Underground|Rail|DLR) Station|\s+Tram Stop|-Underground)$/i, '')
    .replace(/\s*\((?:London|for [^)]*)\)|\s+ELL$/i, '')
    .replace(/\s*\((?:[^)]*(?:line|bakerloo|central|dist|h&c|circle))[^)]*\)/i, '')
    .trim();

const simplify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const byName = new Map<string, number[]>();
for (const station of stations) {
  const key = simplify(station.name);
  byName.set(key, [...(byName.get(key) ?? []), station.index]);
}

const named = new Map<string, number | null>();

/** Which station TfL's free-text location names, preferring ones on the train's own line */
export function stationNamed(name: string, line: LineId): number | null {
  const key = `${line}|${name}`;
  if (!named.has(key)) named.set(key, lookUp(name, line));
  return named.get(key)!;
}

function lookUp(name: string, line: LineId): number | null {
  const wanted = simplify(name.replace(/\s+Platform\s+\S+$/i, ''));
  const exact = byName.get(wanted) ?? byName.get(wanted.replace(/^london /, ''));
  const loose =
    exact ??
    [...byName]
      .filter(([key]) => key.startsWith(wanted) || wanted.startsWith(key))
      .flatMap(([, ids]) => ids);
  const onLine = loose.filter((index) => stations[index].lines.includes(line));
  return onLine[0] ?? null;
}

/** "Between Foo and Bar", "Left Foo" and "At Foo" all say where the train has just been */
export function lastStation(location: string, line: LineId): number | null {
  const match =
    /^Between (.+?) and /i.exec(location) ??
    /^(?:Left|Departed|Departing|Leaving|At) (.+)$/i.exec(location);
  return match ? stationNamed(match[1], line) : null;
}

const destinationOf = (p: Prediction) =>
  cleanName(p.destinationName ?? '') || p.towards?.replace(/^Check Front of Train$/i, '') || '';

function toCalls(line: LineId, predictions: Prediction[], at: number): Call[] {
  return predictions
    .flatMap((prediction) => {
      const station = stationById.get(prediction.naptanId);
      const eta = Math.round((Date.parse(prediction.expectedArrival) - at) / 1000);
      // TfL sometimes files a call under a line that doesn't stop there
      if (!station?.lines.includes(line) || !Number.isFinite(eta) || eta < -30 || eta > HORIZON) {
        return [];
      }
      return [
        {
          station: station.index,
          eta: Math.max(0, eta),
          platform: prediction.platformName ?? '',
          prediction
        }
      ];
    })
    .sort((a, b) => a.eta - b.eta);
}

interface Chain {
  calls: Call[];
  dest: number | null;
}

// the Circle runs round its loop to get where it's going, so "closer" means nothing there
const LOOPS = new Set<LineId>(['circle']);

/** How far off a call is from where this train could be by then, or null if it can't be */
function misfit(line: LineId, chain: Chain, call: Call): number | null {
  const [before, last] = [chain.calls.at(-2), chain.calls.at(-1)!];
  if (chain.calls.some((c) => c.station === call.station)) return null;
  const step = callsApart(line, last.station, call.station);
  if (step > MAX_HOPS) return null;
  // on through the last call rather than back the way it came, or towards its destination
  const onwards = before
    ? callsApart(line, before.station, last.station) + step ===
      callsApart(line, before.station, call.station)
    : chain.dest === null ||
      LOOPS.has(line) ||
      callsApart(line, call.station, chain.dest) < callsApart(line, last.station, chain.dest);
  if (!onwards) return null;
  const expected = travelTime(line, last.station, call.station);
  const taken = call.eta - last.eta;
  if (taken < expected * 0.4 - 30 || taken > expected * 2.5 + 90) return null;
  return Math.abs(taken - expected);
}

const destinationIn = (line: LineId, call: Call) => {
  const to = destinationOf(call.prediction);
  return to ? stationNamed(to, line) : null;
};

const twins = (a: Call, b: Call) => {
  const hub = stations[a.station].hub;
  return (
    a.station !== b.station &&
    hub !== null &&
    hub === stations[b.station].hub &&
    Math.abs(a.eta - b.eta) < SAME_CALL
  );
};

/** Calls chain into trains stop by stop, each joining the train that could get there in time */
function chains(line: LineId, calls: Call[], named: boolean): Call[][] {
  const trains: Chain[] = [];
  for (const call of calls) {
    // TfL repeats a call per platform, but a nameless one's location text gives it away
    const repeat = trains.some((train) =>
      train.calls.some(
        (c) =>
          c.station === call.station &&
          Math.abs(call.eta - c.eta) < SAME_CALL &&
          (named || c.prediction.currentLocation === call.prediction.currentLocation)
      )
    );
    if (repeat) continue;
    let home: Chain | undefined;
    let best = Infinity;
    for (const train of trains) {
      const off = misfit(line, train, call);
      if (off !== null && off < best) [home, best] = [train, off];
    }
    if (home) home.calls.push(call);
    else trains.push({ calls: [call], dest: destinationIn(line, call) });
  }
  // TfL lists a call at each of a hub's stations, leaving a ghost; the through one wins a tie
  const sides = (run: Call[]) => lineGraph.get(line)?.get(run[0].station)?.size ?? 0;
  const beats = (a: Call[], b: Call[]) =>
    (a.length - b.length || sides(a) - sides(b) || b[0].station - a[0].station) > 0;
  const runs = trains.map((train) => train.calls);
  return runs.filter((run) =>
    run.some(
      (call) => !runs.some((other) => beats(other, run) && other.some((c) => twins(c, call)))
    )
  );
}

function toReading(
  line: LineId,
  id: string | null,
  calls: Call[],
  platforms: Platforms
): TrainReading {
  const where = calls[0].prediction.currentLocation?.trim() ?? '';
  const to = calls.map((c) => destinationOf(c.prediction)).find(Boolean) ?? '';
  // nearly at a station it has no call for, which beats guessing from a far-off one
  const nearing = /^Approaching (.+)$/i.exec(where);
  const ahead = nearing ? stationNamed(nearing[1], line) : null;
  return {
    id,
    line,
    to,
    dest: to ? stationNamed(to, line) : null,
    where,
    from: lastStation(where, line) ?? (ahead === calls[0].station ? null : ahead),
    stops: calls.map((c): Stop => [c.station, c.eta, platforms.index(c.platform)])
  };
}

/** A train TfL lists both with an id and without only counts once */
function dedupe(trains: TrainReading[]): TrainReading[] {
  const named = trains.filter((train) => train.id !== null);
  const kept = [...named];
  const nameless = trains
    .filter((train) => train.id === null)
    .sort((a, b) => b.stops.length - a.stops.length);
  for (const train of nameless) {
    const [first, eta] = train.stops[0];
    const twin = kept.some(
      (other) =>
        other.line === train.line &&
        other.dest === train.dest &&
        other.stops.some(([station, at]) => station === first && Math.abs(at - eta) <= SAME_TRAIN)
    );
    if (!twin) kept.push(train);
  }
  return kept;
}

export class Platforms {
  readonly names: string[] = [];
  #index = new Map<string, number>();

  index(name: string): number {
    if (!this.#index.has(name)) this.#index.set(name, this.names.push(name) - 1);
    return this.#index.get(name)!;
  }
}

export function readTrains(
  predictions: Prediction[],
  at: number,
  platforms: Platforms
): TrainReading[] {
  const groups = new Map<string, { line: LineId; id: string | null; predictions: Prediction[] }>();
  for (const prediction of predictions) {
    if (!isLineId(prediction.lineId) || !prediction.naptanId) continue;
    const vehicle = prediction.vehicleId?.trim() ?? '';
    const anonymous = ANONYMOUS.test(vehicle);
    // nameless trains are told apart by timing alone, as TfL's location text varies per call
    const key = anonymous
      ? `${prediction.lineId}|?|${destinationOf(prediction)}`
      : `${prediction.lineId}|${vehicle}`;
    const group = groups.get(key) ?? {
      line: prediction.lineId,
      id: anonymous ? null : `${prediction.lineId}:${vehicle}`,
      predictions: []
    };
    group.predictions.push(prediction);
    groups.set(key, group);
  }

  const trains: TrainReading[] = [];
  for (const { line, id, predictions: group } of groups.values()) {
    // TfL can give two trains the same id, so the client tells them apart by where they are
    for (const train of chains(line, toCalls(line, group, at), id !== null)) {
      if (train[0].eta <= FIRST_CALL) trains.push(toReading(line, id, train, platforms));
    }
  }
  return withoutTurnbacks(dedupe(withoutReturnTrips(trains)));
}

// TfL's id, or failing that where it says the train is, which is the same for all its calls
const vehicleOf = (train: TrainReading) => train.id ?? `${train.line}|${train.where}`;

/** A train's next trip back shows up too, starting where this one ends */
function withoutReturnTrips(trains: TrainReading[]): TrainReading[] {
  const byVehicle = new Map<string, TrainReading[]>();
  for (const train of trains) {
    if (train.id === null && !train.where) continue;
    const vehicle = vehicleOf(train);
    byVehicle.set(vehicle, [...(byVehicle.get(vehicle) ?? []), train]);
  }
  const returning = new Set<TrainReading>();
  for (const trips of byVehicle.values()) {
    for (const train of trips) {
      const [start, leaves] = train.stops[0];
      const follows = trips.some(
        (other) =>
          other !== train &&
          other.stops.at(-1)![1] <= leaves &&
          callsApart(train.line, other.stops.at(-1)![0], start) <= 2
      );
      if (follows) returning.add(train);
    }
  }
  return trains.filter((train) => !returning.has(train));
}

const leavesAnEnd = (train: TrainReading) => {
  const start = train.stops[0][0];
  return train.dest !== start && lineGraph.get(train.line)?.get(start)?.size === 1;
};

/** With no id or location, one leaving the end of the line is whichever train got there first */
function withoutTurnbacks(trains: TrainReading[]): TrainReading[] {
  const arriving = trains.toSorted((a, b) => a.stops.at(-1)![1] - b.stops.at(-1)![1]);
  const leaving = trains
    .filter((train) => train.id === null && !train.where && leavesAnEnd(train))
    .sort((a, b) => a.stops[0][1] - b.stops[0][1]);
  const turned = new Set<TrainReading>();
  for (const train of leaving) {
    const [start, leaves] = train.stops[0];
    const index = arriving.findIndex((other) => {
      const [last, arrives] = other.stops.at(-1)!;
      return (
        other.line === train.line &&
        other.dest === start &&
        arrives + travelTime(train.line, last, start) <= leaves
      );
    });
    if (index < 0) continue;
    arriving.splice(index, 1);
    turned.add(train);
  }
  return trains.filter((train) => !turned.has(train));
}

interface RawLineStatus {
  statusSeverity: number;
  statusSeverityDescription: string;
  reason?: string;
  validityPeriods?: { isNow: boolean }[];
  disruption?: {
    category?: string;
    affectedRoutes?: { routeSectionNaptanEntrySequence?: { stopPoint: { id: string } }[] }[];
    affectedStops?: { naptanId: string }[];
  };
}

export interface RawStatus {
  id: string;
  lineStatuses?: RawLineStatus[];
}

// shut, suspended or not running, but not the nightly close
const SHUT = new Set([1, 2, 3, 4, 5, 11, 16]);

/** The tracks a closure takes trains off, stop by stop along each route TfL names */
function closedOn(line: LineId, statuses: RawLineStatus[]) {
  const closed = new Set<string>();
  for (const { statusSeverity, disruption } of statuses) {
    if (!SHUT.has(statusSeverity)) continue;
    for (const route of disruption?.affectedRoutes ?? []) {
      const stops = (route.routeSectionNaptanEntrySequence ?? []).flatMap(
        ({ stopPoint }) => stationById.get(stopPoint.id)?.index ?? []
      );
      for (let i = 1; i < stops.length; i++) {
        const path = pathBetween(line, stops[i - 1], stops[i]) ?? [];
        if (path.length - 1 > MAX_HOPS) continue;
        for (let j = 1; j < path.length; j++) closed.add(pair(path[j - 1], path[j]));
      }
    }
  }
  return [...closed];
}

export const readStatus = (raw: RawStatus[]): LineStatus[] =>
  raw.flatMap((line) => {
    if (!isLineId(line.id)) return [];
    const worst = [...(line.lineStatuses ?? [])].sort(
      (a, b) => a.statusSeverity - b.statusSeverity
    )[0];
    const closed = closedOn(line.id, line.lineStatuses ?? []);
    return [
      {
        id: line.id,
        severity: worst?.statusSeverity ?? 10,
        status: worst?.statusSeverityDescription ?? 'Unknown',
        reason: worst?.reason?.replace(/\s+/g, ' ').trim() || null,
        closed: closed.length ? closed : undefined
      }
    ];
  });

export interface RawNotice {
  atcoCode: string;
  description: string;
}

/** TfL's words without the heading most of them lead with, in capitals or naming the line */
const unheaded = (text: string) =>
  text
    .replace(/^(?:[A-Z0-9 &'.,()/-]+|(?:[\w&'-]+ ){1,3}[Ll]ine):\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** TfL's notices for each of our stations */
export function readNotices(raw: RawNotice[]): Record<string, string[]> {
  const notices: Record<string, string[]> = {};
  for (const { atcoCode, description } of raw) {
    if (!stationById.has(atcoCode)) continue;
    const text = unheaded(description);
    const said = (notices[atcoCode] ??= []);
    if (text && !said.includes(text)) said.push(text);
  }
  return notices;
}

// the when and where, leaving the rest to TfL's own site
const firstSentence = (text: string) => text.match(/^.+?(?<!\bSt)\.(?=\s|$)/)?.[0] ?? text;

/** Closures TfL has planned, but not ones on now, which the line's status already says */
export function readClosures(raw: RawStatus[]): Closure[] {
  const closures: Closure[] = [];
  for (const { id, lineStatuses = [] } of raw) {
    if (!isLineId(id)) continue;
    for (const { statusSeverity, reason, validityPeriods = [], disruption } of lineStatuses) {
      if (!SHUT.has(statusSeverity) || !reason || disruption?.category === 'RealTime') continue;
      if (validityPeriods.some((period) => period.isNow)) continue;
      const said = firstSentence(unheaded(reason));
      const text = said.charAt(0).toUpperCase() + said.slice(1);
      if (!text) continue;
      const stops = (disruption?.affectedStops ?? []).map((stop) => stop.naptanId);
      // TfL can file one closure more than once, each time with some of its stops
      const same = closures.find((closure) => closure.line === id && closure.text === text);
      if (same) same.stops = [...new Set([...same.stops, ...stops])];
      else closures.push({ line: id, text, stops });
    }
  }
  return closures;
}

import { lineById, type Line, type LineId } from './lines.js';
import { finishesAt } from './status.js';
import type { Snapshot, TrainReading } from './types.js';

export interface Departure {
  train: TrainReading;
  /** TfL's name for it, or empty when it doesn't say */
  platform: string;
  /** Seconds from now */
  due: number;
}

export interface Board {
  line: Line;
  platform: string;
  rows: Departure[];
}

// a train that's only just gone still shows for a moment, as the boards do
const GONE = -30;

const departure = (snapshot: Snapshot, train: TrainReading, stop: number, now: number) => {
  const [, eta, platform] = train.stops[stop];
  return {
    train,
    platform: snapshot.platforms[platform].replace(/\s+-\s+/, ' · '),
    due: (snapshot.at + eta * 1000 - now) / 1000
  };
};

const soonest = (rows: Departure[]) =>
  rows.filter((row) => row.due > GONE).sort((a, b) => a.due - b.due);

/** Trains still to call at any of these stations, a board per line and platform */
export function departures(
  snapshot: Snapshot,
  here: Set<number>,
  lines: Set<LineId>,
  now: number
): Board[] {
  const rows = snapshot.trains
    .filter((train) => lines.has(train.line) && !finishesAt(train, here))
    .flatMap((train) => {
      const stop = train.stops.findIndex(([station]) => here.has(station));
      return stop < 0 ? [] : [departure(snapshot, train, stop, now)];
    });
  const boards = new Map<string, Board>();
  for (const row of soonest(rows)) {
    const key = `${row.train.line}|${row.platform}`;
    if (!boards.has(key))
      boards.set(key, { line: lineById(row.train.line)!, platform: row.platform, rows: [] });
    boards.get(key)!.rows.push(row);
  }
  return [...boards.values()].sort(
    (a, b) => a.line.name.localeCompare(b.line.name) || a.platform.localeCompare(b.platform)
  );
}

/** Trains coming in to finish at one of these stations */
export const arrivals = (
  snapshot: Snapshot,
  here: Set<number>,
  lines: Set<LineId>,
  now: number
): Departure[] =>
  soonest(
    snapshot.trains
      .filter((train) => lines.has(train.line) && finishesAt(train, here))
      .map((train) => departure(snapshot, train, train.stops.length - 1, now))
  );

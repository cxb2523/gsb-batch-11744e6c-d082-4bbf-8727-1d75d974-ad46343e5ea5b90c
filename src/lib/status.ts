import { stations } from './network.js';
import type { Tracked } from './fleet.js';
import { count, list, t } from './i18n/i18n.svelte.js';
import { LINES, type Line } from './lines.js';
import { locate } from './motion.js';
import type { LineStatus, TrainReading } from './types.js';

export type Tone = 'good' | 'warn' | 'bad' | 'closed';

/** TfL's severity codes, by what each means for a journey, worst first */
const KINDS = [
  { name: 'none', tone: 'bad', codes: [1, 2, 4, 16] },
  { name: 'part', tone: 'bad', codes: [3, 5, 11] },
  { name: 'severe', tone: 'bad', codes: [6] },
  { name: 'reduced', tone: 'warn', codes: [7] },
  { name: 'minor', tone: 'warn', codes: [9] },
  { name: 'disruption', tone: 'warn', codes: [0, 8, 12, 13, 14, 15, 17] },
  { name: 'closed', tone: 'closed', codes: [20] },
  { name: 'good', tone: 'good', codes: [10, 18, 19] }
] as const;

type Kind = (typeof KINDS)[number];

const byCode = new Map<number, Kind>(
  KINDS.flatMap((kind) => kind.codes.map((code) => [code, kind] as const))
);
// and whatever else TfL comes up with is some other disruption
const kindOf = (severity: number) =>
  byCode.get(severity) ?? KINDS.find((kind) => kind.name === 'disruption')!;

/** How worried you should be */
export const tone = (severity: number): Tone => kindOf(severity).tone;

/** The DLR and trams go by their names alone, not as a line */
const alone = (line: Line): line is Line & { mode: 'dlr' | 'tram' } =>
  line.mode === 'dlr' || line.mode === 'tram';

/** A line by the name on its signs */
export const lineName = (line: Line) => (alone(line) ? line.name : t.search.line(line.name));

/** Past this many, a sentence counts the lines rather than naming them */
const NAMED = 4;

/** Some lines as a sentence names them, as one, so it reads "the Central and District lines" */
function named(lines: Line[]) {
  const s = t.summary;
  if (lines.length > NAMED) return count(s.count, lines.length);
  const called = lines.filter((line) => !alone(line)).map((line) => line.name);
  return list([
    ...(called.length ? [count(s.lines, called.length, list(called))] : []),
    ...lines.filter(alone).map((line) => s[line.mode])
  ]);
}

/** How every line's running in a sentence for each sort of news, worst first, as TfL puts it */
export function summary(status: LineStatus[]): { tone: Tone; text: string }[] {
  const kinds = new Map(status.map(({ id, severity }) => [id, kindOf(severity)]));
  const groups = KINDS.map((kind) => ({
    kind,
    lines: LINES.filter((line) => kinds.get(line.id) === kind)
  })).filter(({ lines }) => lines.length);
  const s = t.summary;
  // only speaks for the whole network once TfL has said how every line's running
  const whole = kinds.size === LINES.length;
  const say = ({ name }: Kind, lines: Line[]) => {
    if (whole && groups.length === 1 && name === 'good') return s.every;
    if (whole && groups.length === 1 && name === 'closed') return s.idle;
    if (whole && name === 'good' && lines.length > NAMED) return s.rest;
    return s[name](named(lines));
  };
  return groups.map(({ kind, lines }) => ({ tone: kind.tone, text: say(kind, lines) }));
}

export const minutes = (seconds: number) =>
  seconds < 30 ? t.due : t.minutes(Math.max(1, Math.round(seconds / 60)));

/** Where the map has the train right now, in words, so the sheet and the map agree */
export function whereIs({ legs, reading }: Tracked, now: number): string {
  const name = (index: number) => stations[index].name;
  const placed = locate(reading.line, legs, reading.stops[0][0], now / 1000);
  const [from, to] = placed.between;
  if (placed.at !== null || from === to) return t.where.at(name(placed.at ?? from));
  return placed.f > 0.8 ? t.where.approaching(name(to)) : t.where.between(name(from), name(to));
}

/** Coming in to finish at one of these stations, so not a train you can catch there */
export const finishesAt = ({ dest, stops }: TrainReading, here: Set<number>) =>
  dest !== null && dest === stops.at(-1)![0] && here.has(dest);

/** The call a train's heading for, and how many seconds off it is */
export function nextCall({ legs, reading }: Tracked, now: number) {
  const t = now / 1000;
  const leg = legs.find((l) => t < l.arrive);
  return leg
    ? { station: leg.to, seconds: leg.arrive - t }
    : { station: reading.stops.at(-1)![0], seconds: 0 };
}

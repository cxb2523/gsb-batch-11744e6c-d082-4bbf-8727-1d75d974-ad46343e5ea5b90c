// The first and last trains from every station to each end of its lines, from TfL's timetables
import { cleanName, tfl } from './network.mjs';

const DIRECTIONS = ['inbound', 'outbound'];
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// an end with under this share of the busiest one's trains is a stray, like the odd one to a depot
const REGULAR = 0.1;
const AT_ONCE = 4;

/** The days a timetable's for, Monday first, from names like "Monday - Thursday" */
function daysOf(name) {
  const plain = name.toLowerCase().replace(/\(.*?\)/g, '');
  const days = [...plain.matchAll(new RegExp(WEEK.join('|'), 'g'))].map(([day]) =>
    WEEK.indexOf(day)
  );
  if (days.length !== 2 || !/\s(-|to)\s/.test(plain)) return days;
  return Array.from({ length: days[1] - days[0] + 1 }, (_, i) => days[0] + i);
}

// TfL runs one timetable Monday to Thursday, so a line that lists only some of them stands for all
const weekdays = (days) =>
  days.map((day, i) => day ?? (i < 4 ? days.slice(0, 4).find(Boolean) : null) ?? null);

/** The first and last trains of a day, taking in some more */
const widen = (span, [first, last]) =>
  span ? [Math.min(span[0], first), Math.max(span[1], last)] : [first, last];

/** Adds ends to a place's list, folding in any it has from another of its stations */
function merge(list, found) {
  for (const end of found) {
    const same = list.find((e) => e.to === end.to && e.via === end.via);
    if (same) same.days = same.days.map((day, i) => (end.days[i] ? widen(day, end.days[i]) : day));
    else list.push(end);
  }
}

/** Runs to one end, grouped by the way they go, like the Northern line's two through town */
function branches(runs) {
  const groups = [];
  for (const run of runs.toSorted((a, b) => b.stops.length - a.stops.length)) {
    const group = groups.find((g) => run.stops.every((stop) => g.stops.has(stop)));
    if (group) group.runs.add(run);
    else groups.push({ longest: run.stops, stops: new Set(run.stops), runs: new Set([run]) });
  }
  return groups;
}

/** Each end of a line one way from a station, with its first and last trains there each day */
async function endsOf(id, line, direction, nameOf) {
  // TfL has no timetable for a line it doesn't publish them for, or a way it doesn't run from here
  const { timetable, stops: named = [] } = await tfl(`/Line/${line}/Timetable/${id}`, {
    direction
  }).catch((err) => {
    if (err.status === 404) return {};
    throw err;
  });
  const runs = new Map();
  const journeys = [];
  (timetable?.routes ?? []).forEach(({ stationIntervals = [], schedules = [] }, route) => {
    for (const { id: interval, intervals } of stationIntervals)
      runs.set(`${route}:${interval}`, { stops: intervals.map((stop) => stop.stopId) });
    for (const { name, knownJourneys = [] } of schedules)
      for (const { hour, minute, intervalId } of knownJourneys) {
        const run = runs.get(`${route}:${intervalId}`);
        const at = Number(hour) * 60 + Number(minute);
        if (run?.stops.length) journeys.push({ run, days: daysOf(name), at });
      }
  });

  const end = (run) => run.stops.at(-1);
  const counts = Map.groupBy(journeys, ({ run }) => end(run));
  const busiest = Math.max(0, ...[...counts.values()].map((some) => some.length));
  const kept = [...runs.values()].filter(
    (run) => counts.get(end(run))?.length >= busiest * REGULAR
  );
  const passed = new Set(kept.flatMap((run) => run.stops.slice(0, -1)));
  const ends = new Set(kept.map(end).filter((stop) => !passed.has(stop)));

  return [...ends].flatMap((stop) => {
    const groups = branches(kept.filter((run) => end(run) === stop));
    return groups.map((group) => {
      const others = new Set(groups.flatMap((g) => (g === group ? [] : [...g.stops])));
      const via = groups.length > 1 && group.longest.find((s) => !others.has(s));
      const days = Array(7).fill(null);
      for (const { run, days: on, at } of journeys) {
        if (!group.runs.has(run)) continue;
        for (const day of on) days[day] = widen(days[day], [at, at]);
      }
      return {
        to: nameOf(stop, named),
        ...(via && { via: nameOf(via, named) }),
        days: weekdays(days)
      };
    });
  });
}

/** Works through items a few at a time */
async function inTurn(items, work) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (queue.length) await work(queue.shift());
    })
  );
}

/** Every place's first and last trains, line by line, under the place's key */
export async function trainTimes(stations, lines) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const nameOf = (id, named) =>
    byId.get(id)?.name ?? cleanName(named.find((stop) => stop.id === id)?.name ?? id);
  const times = {};
  for (const line of lines) {
    const everyEnd = async (id) =>
      (
        await Promise.all(DIRECTIONS.map((direction) => endsOf(id, line.id, direction, nameOf)))
      ).flat();
    // TfL has no timetables for some lines, which a station in the middle of one shows
    const [route] = line.routes;
    if (!(await everyEnd(stations[route[route.length >> 1]].id)).length) continue;

    await inTurn(new Set(line.routes.flat()), async (index) => {
      const { id, hub } = stations[index];
      const found = await everyEnd(id);
      if (found.length) merge(((times[hub ?? id] ??= {})[line.id] ??= []), found);
    });
    console.log(`train times: ${line.id}`);
  }
  return times;
}

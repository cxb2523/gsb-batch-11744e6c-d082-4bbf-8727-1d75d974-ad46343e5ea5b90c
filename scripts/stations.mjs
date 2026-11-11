#!/usr/bin/env node
// Rebuilds src/lib/server/stations.json from TfL: what each station has, how busy it usually gets
// through the week and its first and last trains, for the station pages.
// Run it after `npm run network`
import { readFile, writeFile } from 'node:fs/promises';
import { tfl } from './network.mjs';
import { trainTimes } from './timetables.mjs';

const NETWORK = new URL('../src/lib/data/network.json', import.meta.url);
const OUT = new URL('../src/lib/server/stations.json', import.meta.url);
// TfL takes a handful of stops a call
const BATCH = 20;
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const said = (value) => (/^yes\b/i.test(value) ? true : /^no\b/i.test(value) ? false : undefined);
const counted = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
};
const tidy = (text) => text.replace(/\s+/g, ' ').trim();
// TfL cuts notes off at 255 characters, so a long one ends at its last whole sentence
const whole = (text) =>
  text.length < 255
    ? text
    : text.slice(0, text.lastIndexOf('.') + 1) || `${text.replace(/\s+\S*$/, '')}…`;

/** The street, town and postcode, without the station's own name or who runs it */
function street(address) {
  let parts = address
    .split(/,|\r?\n/)
    .map(tidy)
    .filter(Boolean);
  const runner = parts.findIndex((part) => /^London (Underground|Overground) Ltd\.?$/i.test(part));
  if (runner >= 0) parts = parts.slice(runner + 1);
  else parts[0] = parts[0].replace(/^.*?\bstations?\b(\s+BR\b)?\s*/i, '');
  return parts.filter((part) => part && !/^Greater London$/i.test(part)).join(', ');
}

/** What a stop point lists, keeping only what's there */
function factsOf(properties) {
  const value = (key) => properties.find((p) => p.key === key)?.value;
  const facts = {
    zone: value('Zone')?.replace(/\+/g, '/'),
    liftAccess: said(value('AccessViaLift') ?? ''),
    access: value('AddtionalInformation') && tidy(whole(value('AddtionalInformation'))),
    lifts: counted(value('Lifts')),
    escalators: counted(value('Escalators')),
    toilets: said(value('Toilets') ?? ''),
    wifi: said(value('WiFi') ?? ''),
    night: value('Night') === 'yes' || undefined,
    address: value('Address') && street(value('Address'))
  };
  return Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined && v !== ''));
}

/** A week of quarter hours averaged into hours, out of 100 for the busiest, and what that was */
function hourly(days) {
  const week = DAYS.map((name) => {
    const bands = days.find((day) => day.dayOfWeek === name)?.timeBands ?? [];
    return Array.from({ length: 24 }, (_, hour) => {
      const quarters = bands.slice(hour * 4, hour * 4 + 4).map((b) => b.percentageOfBaseLine);
      return quarters.reduce((sum, q) => sum + q, 0) / (quarters.length || 1);
    });
  });
  const peak = Math.max(...week.flat());
  const out = (level) => Math.round((level / peak) * 100);
  return peak > 0
    ? { peak: Math.round(peak * 1e4) / 1e4, week: week.map((hours) => hours.map(out)) }
    : null;
}

async function main() {
  const { stations, lines } = JSON.parse(await readFile(NETWORK, 'utf8'));
  // a hub's stations share a name, and a page, so TfL's facts for the hub cover them
  const places = Map.groupBy(stations, (s) => s.hub ?? s.id);
  const ids = [...places.keys()];

  const facts = {};
  for (let i = 0; i < ids.length; i += BATCH) {
    const points = await tfl(`/StopPoint/${ids.slice(i, i + BATCH).join(',')}`);
    for (const point of [points].flat()) {
      const found = factsOf(point.additionalProperties ?? []);
      if (Object.keys(found).length) facts[point.id] = found;
    }
    console.log(`facts: ${Math.min(i + BATCH, ids.length)} of ${ids.length}`);
  }

  // crowding comes by station, so a place takes the first of its stations TfL counts, and keeps
  // which and its busiest hour, to put that station's live count on the same scale
  const busy = {};
  const crowding = {};
  for (const [id, members] of places) {
    for (const member of members) {
      const { daysOfWeek } = await tfl(`/crowding/${member.id}`).catch(() => ({}));
      const counted = daysOfWeek?.length ? hourly(daysOfWeek) : null;
      if (!counted) continue;
      busy[id] = counted.week;
      crowding[id] = { id: member.id, peak: counted.peak };
      break;
    }
  }
  const trains = await trainTimes(stations, lines);
  console.log(
    `${Object.keys(facts).length} with facts, ${Object.keys(busy).length} with busy times, ` +
      `${Object.keys(trains).length} with train times`
  );

  await writeFile(
    OUT,
    JSON.stringify({ generated: new Date().toISOString(), facts, busy, crowding, trains })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import type { Line } from '#lib/lines.js';
import { breadcrumbs, name, site } from '#lib/meta.js';
import { placesOn } from '#lib/network.js';
import type { Diagram } from './diagram.js';

/** Several things as one in English, which is what search engines read */
export const listed = (items: string[]) => new Intl.ListFormat('en-GB').format(items);

/** A line by the name people search for it by */
export const spoken = (line: Line) =>
  line.mode === 'dlr' ? 'DLR' : line.mode === 'tram' ? 'London Trams' : `${line.name} line`;

export const lineTitle = (line: Line) => `${spoken(line)} status and live trains | ${name}`;

// by its far ends alone, as a result only shows so much of a line with branches
export function lineDescription(line: Line, { spine }: Diagram) {
  const [first, last] = [spine.stops[0], spine.stops.at(-1)!].map((stop) => stop.station.name);
  const branches = spine.stops.some((stop) => stop.branches.length) ? ' and its branches' : '';
  return (
    `Live ${spoken(line)} status and every train on it, with all ${placesOn(line.id).length} ` +
    `stations from ${first} to ${last}${branches}, their interchanges and zones.`
  );
}

export const lineImage = (line: Line) => ({
  image: `/og/lines/${line.id}.png`,
  alt: `The ${spoken(line)} in its colour, with how many stations it has and how far it runs`
});

export const lineData = (line: Line) => [
  breadcrumbs([
    [name, site],
    ['Lines', `${site}/lines`],
    [spoken(line), `${site}/lines/${line.id}`]
  ])
];

export const linesTitle = `Live TfL line status and trains | ${name}`;

export const linesDescription =
  'The live status of every London Underground, Elizabeth line, Overground, DLR and tram line, ' +
  'with any disruption as TfL reports it and the trains running on each.';

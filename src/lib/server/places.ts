import type { LineId } from '#lib/lines.js';
import { placesOn, type Place } from '#lib/network.js';
import type { Busy, Facts, TrainTimes } from '#lib/types.js';
import stations from './stations.json' with { type: 'json' };

const facts: Record<string, Facts> = stations.facts;
const busy: Record<string, Busy> = stations.busy;
const trains: Record<string, TrainTimes> = stations.trains;
const crowding: Record<string, Crowding> = stations.crowding;

/** The one of a place's stations TfL counts people at, and how many at its busiest */
export interface Crowding {
  id: string;
  peak: number;
}

// TfL files a hub's facts under the hub, and the rest under the station
const keyOf = ({ members: [{ hub, id }] }: Place) => hub ?? id;

export const factsOf = (place: Place) => facts[keyOf(place)] ?? null;
export const busyOf = (place: Place) => busy[keyOf(place)] ?? null;
export const trainsOf = (place: Place) => trains[keyOf(place)] ?? null;
export const crowdingOf = (place: Place) => crowding[keyOf(place)] ?? null;

/** The zone of each station on a line, by its slug, where TfL gives one */
export function zonesOn(line: LineId) {
  const zones = placesOn(line).flatMap((place) => {
    const zone = factsOf(place)?.zone;
    return zone ? [[place.slug, zone] as const] : [];
  });
  return Object.fromEntries(zones);
}

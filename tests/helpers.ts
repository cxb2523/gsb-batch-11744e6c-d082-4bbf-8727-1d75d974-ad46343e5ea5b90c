import { stationById } from '#lib/network.js';
import type { Prediction } from '#lib/server/readings.js';

export const AT = Date.parse('2026-10-08T17:00:00Z');

export const index = (naptan: string) => stationById.get(naptan)!.index;

/** One TfL prediction, `eta` seconds after AT */
export const call = (
  naptanId: string,
  eta: number,
  extra: Partial<Prediction> = {}
): Prediction => ({
  lineId: 'victoria',
  vehicleId: '201',
  naptanId,
  platformName: 'Northbound - Platform 1',
  destinationName: 'Walthamstow Central Underground Station',
  expectedArrival: new Date(AT + eta * 1000).toISOString(),
  currentLocation: 'Between Brixton and Stockwell',
  ...extra
});

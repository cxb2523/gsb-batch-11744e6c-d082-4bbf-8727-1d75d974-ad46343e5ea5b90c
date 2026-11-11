import { TFL_APP_KEY } from '$app/env/private';
import { waitUntil } from 'cloudflare:workers';
import { LINE_IDS, MODES } from '#lib/lines.js';
import type { LineStatus, Snapshot } from '#lib/types.js';
import {
  Platforms,
  readClosures,
  readNotices,
  readStatus,
  readTrains,
  type Prediction,
  type RawNotice,
  type RawStatus
} from './readings.js';
import type { Crowding } from './places.js';
import { report } from './report.js';

const BASE = 'https://api.tfl.gov.uk';
const STATUS = `/Line/Mode/${MODES.map((m) => m.id).join(',')}/Status?detail=true`;
const FRESH = 10_000;
const TIMEOUT = 15_000;
// a page only waits so long for TfL before going without
const PAGE_TIMEOUT = 2_000;
// a status that's a few minutes old is still news
const STATUS_EVERY = 60_000;
const RETRY = 20_000;
// TfL drops out now and then, so it's only worth a report once it's been gone this long
const OUTAGE = 10 * 60_000;
// station notices change by the day, not the minute
const NOTICES_EVERY = 5 * 60_000;
const CLOSURES_EVERY = 60 * 60_000;
const DAY = 86_400_000;
// far enough to take in the next weekend, when most closures are
const CLOSURES_AHEAD = 7;
// TfL counts again every few minutes
const CROWDING_EVERY = 2 * 60_000;

async function get<T>(path: string, timeout = TIMEOUT): Promise<T> {
  const url = new URL(BASE + path);
  if (TFL_APP_KEY) url.searchParams.set('app_key', TFL_APP_KEY);
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeout)
  });
  if (!res.ok) throw new Error(`TfL ${res.status} on ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
}

let current: { snapshot: Snapshot; body: string } | null = null;
let statusAt = 0;
let refreshing: Promise<void> | null = null;
let retryAt = 0;
let failingSince: number | null = null;

async function refresh() {
  const wantStatus = !current || Date.now() - statusAt > STATUS_EVERY;
  const [arrivals, status] = await Promise.allSettled([
    get<Prediction[]>(`/Line/${LINE_IDS.join(',')}/Arrivals`),
    wantStatus ? get<RawStatus[]>(STATUS) : null
  ]);
  let lines = current?.snapshot.status ?? [];
  if (status.status === 'fulfilled' && Array.isArray(status.value)) {
    statusAt = Date.now();
    // TfL answered, so a throw here is our bug, and the trains carry on without it
    try {
      lines = readStatus(status.value);
    } catch (err) {
      await report(err);
    }
  }

  try {
    if (arrivals.status === 'rejected') throw arrivals.reason;
    if (!Array.isArray(arrivals.value)) throw new Error('TfL arrivals came back as something else');
    const at = Date.now();
    const platforms = new Platforms();
    const trains = readTrains(arrivals.value, at, platforms);
    current = wrap({ at, stale: false, trains, platforms: platforms.names, status: lines });
    failingSince = null;
  } catch (err) {
    // and give TfL a breather rather than asking again on every request
    retryAt = Date.now() + RETRY;
    failingSince ??= Date.now();
    // arrivals we can't read are our bug, but TfL's blips only matter once they drag on
    if (arrivals.status === 'fulfilled' && Array.isArray(arrivals.value)) await report(err);
    else if (Date.now() - failingSince > OUTAGE) {
      await report(new Error(`No trains from TfL for ${OUTAGE / 60_000} minutes`, { cause: err }));
    }
    if (!current) throw err;
    // the last good reading beats an error page, so keep it and say it's stale
    console.error('Refresh failed, serving the last reading', err);
    current = wrap({ ...current.snapshot, stale: true, status: lines });
  }
}

const wrap = (snapshot: Snapshot) => ({ snapshot, body: JSON.stringify(snapshot) });

/** One reading shared by every visitor, refreshed behind their backs once it's a bit old */
export async function live(): Promise<string> {
  const age = current ? Date.now() - current.snapshot.at : Infinity;
  if (age > FRESH && !refreshing && Date.now() >= retryAt) {
    refreshing = refresh().finally(() => (refreshing = null));
    waitUntil(refreshing.catch(() => {}));
  }
  // a reading this old is worth waiting for a new one rather than serving
  if (!current || age > FRESH * 6)
    await refreshing?.catch((err) => (current ? null : Promise.reject(err)));
  if (!current) throw new Error('No reading from TfL yet');
  return current.body;
}

/** Reads something for everyone at most once every so often, sharing one read while it's out */
function shared<T>(every: number, read: () => Promise<T>) {
  let kept: { until: number; value: Promise<T> } | null = null;
  return () => {
    if (!kept || Date.now() > kept.until) {
      const value = read();
      kept = { until: Date.now() + every, value };
      // a failure's only kept long enough to give TfL a breather
      value.catch(() => {
        if (kept?.value === value) kept.until = Date.now() + RETRY;
      });
    }
    return kept.value;
  };
}

// for pages to borrow while there's no fresh reading
const quickStatus = shared(STATUS_EVERY, () =>
  get<RawStatus[]>(STATUS, PAGE_TIMEOUT).then(readStatus)
);

/** How every line's running, for a page to show without waiting long on TfL */
export async function lineStatus(): Promise<LineStatus[] | null> {
  const status =
    current && Date.now() - statusAt < STATUS_EVERY * 2
      ? current.snapshot.status
      : await quickStatus().catch(() => null);
  // which tracks are shut is only for the map, which has its own reading
  return status?.map(({ closed: _, ...line }) => line) ?? null;
}

/** Every station's notices */
export const stationNotices = shared(NOTICES_EVERY, () =>
  get<RawNotice[]>(`/StopPoint/Mode/${MODES.map((m) => m.id).join(',')}/Disruption`).then((raw) =>
    JSON.stringify(readNotices(raw))
  )
);

/** Closures planned on every line over the coming week */
export const plannedClosures = shared(CLOSURES_EVERY, () => {
  const day = (ahead: number) => new Date(Date.now() + ahead * DAY).toISOString().slice(0, 10);
  return get<RawStatus[]>(
    `/Line/${LINE_IDS.join(',')}/Status/${day(0)}/to/${day(CLOSURES_AHEAD)}?detail=true`
  ).then((raw) => JSON.stringify(readClosures(raw)));
});

interface RawCrowding {
  dataAvailable: boolean;
  percentageOfBaseline: number;
}

const crowds = new Map<string, () => Promise<string>>();

/** How busy a station is right now, out of 100 for its usual busiest hour, or null if TfL can't say */
export function crowdingNow({ id, peak }: Crowding) {
  if (!crowds.has(id)) {
    const level = (now: RawCrowding) =>
      now.dataAvailable ? Math.round((now.percentageOfBaseline / peak) * 100) : null;
    const read = () => get<RawCrowding>(`/crowding/${id}/Live`).then(level).then(JSON.stringify);
    crowds.set(id, shared(CROWDING_EVERY, read));
  }
  return crowds.get(id)!();
}

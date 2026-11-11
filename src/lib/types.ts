import type { LineId } from './lines.js';

/** One upcoming call: station index, seconds after the snapshot, platform index */
export type Stop = [station: number, eta: number, platform: number];

export interface TrainReading {
  /** TfL's vehicle id, which two trains can share, or null without one; the client keeps track */
  id: string | null;
  line: LineId;
  to: string;
  /** The destination's station, when it's one of ours */
  dest: number | null;
  where: string;
  /** Station the train last left or is sitting at, when TfL says */
  from: number | null;
  stops: Stop[];
}

export interface LineStatus {
  id: LineId;
  severity: number;
  status: string;
  reason: string | null;
  /** Tracks with no trains on, as the network's pair keys, when some or all of the line is shut */
  closed?: string[];
}

export interface Snapshot {
  /** When TfL was read, epoch ms */
  at: number;
  stale: boolean;
  trains: TrainReading[];
  platforms: string[];
  status: LineStatus[];
}

/** A closure TfL has planned, in its words, at the stations it shuts or all the line's if none */
export interface Closure {
  line: LineId;
  text: string;
  stops: string[];
}

/** What TfL lists a station as having, where it says */
export interface Facts {
  zone?: string;
  lifts?: number;
  escalators?: number;
  toilets?: boolean;
  wifi?: boolean;
  night?: boolean;
  /** Whether a lift is the way in, which says nothing when it isn't, as there may be no steps */
  liftAccess?: boolean;
  /** TfL's note on getting in and out without steps, where there's a catch */
  access?: string;
  address?: string;
}

/** How busy a station usually gets, Monday first, hour by hour, out of 100 for its busiest */
export type Busy = number[][];

/** The bits of a station's page the live map asks for when it's picked */
export interface StationInfo {
  facts: Facts | null;
  busy: Busy | null;
}

/** The trains to one end of a line */
export interface Service {
  to: string;
  /** Which way, where trains take more than one to that end */
  via?: string;
  /** Each day from Monday, its first and last train in minutes after midnight, or null for none */
  days: (number[] | null)[];
}

export type TrainTimes = Partial<Record<LineId, Service[]>>;

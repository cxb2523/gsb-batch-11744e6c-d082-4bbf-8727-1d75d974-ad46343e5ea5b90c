import type { ConnectionId, NpcId } from '../chapter/data';
import type { Gesture, Stance } from '../contracts';

/** Per-resident personality: how they idle before and after their corner of
 * the planet comes back to life. Tune numbers here, not in the brain. */

export interface IdleInput {
  /** 0..1 eased "their world is alive": story-driven when the director passes
   * `completed`, otherwise the revival wave at their feet. */
  joy: number;
  /** Player is within greeting range. */
  near: boolean;
  talking: boolean;
  /** Per-resident clock (seconds). */
  t: number;
  /** Random on/off pattern: returns true during "on" spans (e.g. working). */
  cycle(key: string, on: readonly [number, number], off: readonly [number, number]): boolean;
}

export interface IdleOutput { gesture: Gesture; stance: Stance; mood: number }

export interface Profile {
  talkDistance: number;
  /** Head follows the player inside this radius. */
  lookRadius: number;
  /** Body turns toward the player inside `turnRadius`, by at most this angle (rad) from its resting facing. */
  turnMax: number;
  turnRadius: number;
  /** Wave when the player walks up (needs joy unless `always`). */
  greets?: 'always' | 'happy';
  /** Wave when a conversation ends. */
  farewell?: boolean;
  /** Story step that makes this resident happy; falls back to revival when `completed` is not provided. */
  joyAfter?: ConnectionId;
  /** Head turns away from the player while joyless (sulking). */
  sulks?: boolean;
  idle(i: IdleInput): IdleOutput;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const WORK_ON = [6, 11] as const, WORK_OFF = [2, 4] as const;

export const PROFILES: Record<NpcId, Profile> = {
  wick: {
    talkDistance: 1.6, lookRadius: 3.4, turnMax: 1.2, turnRadius: 3.2, greets: 'always', farewell: true, joyAfter: 'h1',
    idle: ({ joy }) => ({ gesture: 'none', stance: 'clasp', mood: lerp(0.05, 0.6, joy) }),
  },
  marlo: {
    talkDistance: 1.6, lookRadius: 3.4, turnMax: 1.2, turnRadius: 3.0, greets: 'always', farewell: true, joyAfter: 'h2',
    idle: ({ joy, near, cycle }) => ({
      gesture: joy > 0.5 && !near && cycle('haul', [7, 12], [2.5, 4.5]) ? 'work' : 'none',
      stance: 'hips', mood: lerp(0.15, 0.7, joy),
    }),
  },
  pim: {
    talkDistance: 1.5, lookRadius: 3.6, turnMax: 1.4, turnRadius: 3.2, greets: 'always', farewell: true,
    idle: () => ({ gesture: 'none', stance: 'default', mood: 0.85 }),
  },
  bram: {
    talkDistance: 1.7, lookRadius: 3.2, turnMax: 1.0, turnRadius: 2.8, greets: 'happy', farewell: true, joyAfter: 'w1', sulks: true,
    idle: ({ joy, near, cycle }) => joy < 0.5
      ? { gesture: 'none', stance: 'fold', mood: -0.7 }
      : { gesture: !near && cycle('hammer', WORK_ON, [1.5, 3]) ? 'work' : 'none', stance: 'hips', mood: lerp(0.2, 0.7, joy) },
  },
  sprout: {
    talkDistance: 1.5, lookRadius: 3.2, turnMax: 1.2, turnRadius: 2.8, greets: 'happy', farewell: true, joyAfter: 'w2',
    idle: ({ joy, near, cycle }) => joy < 0.5
      ? { gesture: 'sit', stance: 'default', mood: -0.85 }
      : { gesture: !near && cycle('water', [7, 12], [2, 4]) ? 'work' : 'none', stance: 'default', mood: lerp(0.3, 0.85, joy) },
  },
  sol: {
    talkDistance: 1.7, lookRadius: 3.2, turnMax: 1.1, turnRadius: 3.0, greets: 'always', farewell: true, joyAfter: 'o1',
    idle: ({ joy, near, cycle }) => joy < 0.5
      ? { gesture: cycle('sigh', [1.8, 2.4], [9, 16]) ? 'shrug' : 'none', stance: 'default', mood: -0.35 }
      : { gesture: !near && cycle('stir', WORK_ON, WORK_OFF) ? 'work' : 'none', stance: 'hips', mood: lerp(0.2, 0.75, joy) },
  },
  otto: {
    talkDistance: 2.2, lookRadius: 3.4, turnMax: 0.5, turnRadius: 3.0, farewell: false, joyAfter: 'o2',
    idle: ({ joy, cycle }) => ({
      gesture: joy > 0.5 && cycle('wave', [1.8, 2.4], [8, 14]) ? 'wave' : 'none',
      stance: 'sill', mood: lerp(-0.55, 0.7, joy),
    }),
  },
  ike: {
    talkDistance: 2.2, lookRadius: 3.4, turnMax: 0.5, turnRadius: 3.0, farewell: false, joyAfter: 'o2',
    idle: ({ joy, cycle }) => ({
      gesture: joy > 0.5 && cycle('wave', [1.8, 2.4], [9, 15]) ? 'wave' : 'none',
      stance: 'sill', mood: lerp(-0.5, 0.7, joy),
    }),
  },
  cat: {
    talkDistance: 1.4, lookRadius: 3.0, turnMax: 1.6, turnRadius: 3.0,
    idle: () => ({ gesture: 'none', stance: 'default', mood: 0.4 }),
  },
};

/** Who is expected to be standing where (tuning knobs for the walkers). */
export const WALKERS = {
  /** Wick strolls over to the lighthouse after h1 unless the player is close. */
  wickStroll: true,
  wickSpeed: 0.95,
  wickStopDistance: 2.3,
  wickMaxDistance: 9,
  catSpeed: 0.55,
  catWanderRadius: 2.2,
};

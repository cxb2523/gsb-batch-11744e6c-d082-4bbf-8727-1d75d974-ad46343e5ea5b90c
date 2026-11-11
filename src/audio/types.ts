/** Public audio types. Kept free of runtime code so every module can import them. */

export interface SoundFrame {
  dt: number;
  moving: number;
  grounded: boolean;
  sprinting?: boolean;
  /** Player is in/over water (sea waves swell). */
  water?: boolean;
  /** Optional 0..1 proximity to water; wins over the boolean when provided. */
  waterNear?: number;
  verticalSpeed?: number;
  /** False while a menu/dialogue/transition blocks play: ambience ducks. Undefined counts as true. */
  active?: boolean;
  /** 0..1 chapter revival, drives ambience brightness. */
  life?: number;
}

export type UiSound = 'click' | 'open' | 'close' | 'paper' | 'start' | 'hover' | 'toggle' | 'shutter' | 'stamp';
export type Voice = 'low' | 'mid' | 'high' | 'child' | 'cat';

/** Names that real recorded samples may replace (see samples.ts). */
export const SOUND_EVENTS = [
  'ui.click', 'ui.open', 'ui.close', 'ui.paper', 'ui.start', 'ui.hover', 'ui.toggle', 'ui.shutter', 'ui.stamp',
  'step', 'jump', 'land',
  'thread.pickup', 'thread.reel', 'thread.taut', 'connect', 'revive', 'chapterComplete',
  /** Looping background music bed; when registered it replaces the synthesized phrases. */
  'music.loop',
] as const;
export type SoundEvent = typeof SOUND_EVENTS[number];

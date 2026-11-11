import { isLocale, type Locale } from '#lib/i18n/locales.js';
import type { Style } from '#lib/layout.js';
import { isModeId, type ModeId } from '#lib/lines.js';

// static/settings.js reads these too, before first paint
const KEY = 'tubespotting:settings';
export const LOOKS = {
  dark: 'prefers-color-scheme: dark',
  calm: 'prefers-reduced-motion: reduce',
  contrast: 'prefers-contrast: more'
};
export type Look = keyof typeof LOOKS;

/** Seconds between live updates */
export const REFRESH = [10, 30, 60];

/** null follows the system */
type Picked = boolean | null;

export const defaults = () => ({
  dark: null as Picked,
  calm: null as Picked,
  contrast: null as Picked,
  language: null as Locale | null,
  style: 'schematic' as Style,
  modes: ['tube', 'elizabeth-line', 'dlr'] as ModeId[],
  refresh: 10,
  shortcuts: true,
  analytics: true,
  errors: true
});

export type Settings = ReturnType<typeof defaults>;

const flag = (value: unknown) => typeof value === 'boolean';
const pick = (value: unknown) => value === null || flag(value);
const VALID: Record<keyof Settings, (value: unknown) => boolean> = {
  dark: pick,
  calm: pick,
  contrast: pick,
  language: (value) => value === null || isLocale(value),
  style: (value) => value === 'schematic' || value === 'geographic',
  modes: (value) => Array.isArray(value) && value.every(isModeId),
  refresh: (value) => REFRESH.includes(value as number),
  shortcuts: flag,
  analytics: flag,
  errors: flag
};

export function read(): Settings {
  const settings = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)!) ?? {};
    for (const key of Object.keys(VALID) as (keyof Settings)[])
      if (VALID[key](saved[key])) Object.assign(settings, { [key]: saved[key] });
  } catch {
    // nothing saved, or nothing we can read
  }
  return settings;
}

/** Keeps only what's been changed, so new defaults still reach everyone else */
export function write(settings: Settings) {
  const fresh = defaults();
  const changed = Object.entries(settings).filter(
    ([key, value]) => JSON.stringify(value) !== JSON.stringify(fresh[key as keyof Settings])
  );
  try {
    if (changed.length) localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(changed)));
    else localStorage.removeItem(KEY);
  } catch {
    // private browsing, so it's just forgotten next visit
  }
}

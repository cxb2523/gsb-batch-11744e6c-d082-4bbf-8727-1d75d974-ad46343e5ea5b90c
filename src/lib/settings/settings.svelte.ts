import { MediaQuery } from 'svelte/reactivity';
import { setLocale } from '#lib/i18n/i18n.svelte.js';
import { detect, type Locale } from '#lib/i18n/locales.js';
import { defaults, LOOKS, read, write, type Look } from './saved.js';

export const settings = $state(defaults());

const names = Object.keys(LOOKS) as Look[];

/** Each look as picked, or as the system has it until then */
export const looks = Object.defineProperties(
  {} as Record<Look, boolean>,
  Object.fromEntries(
    names.map((name) => {
      const system = new MediaQuery(LOOKS[name]);
      const get = () => settings[name] ?? system.current;
      return [name, { get, set: (on: boolean) => (settings[name] = on) }];
    })
  )
);

let spoken: Locale = 'en';

/** The language as picked, or the browser's until then */
export const language = {
  get current() {
    return settings.language ?? spoken;
  },
  set current(code: Locale) {
    settings.language = code;
  }
};

let loaded = false;

/** Once the page has hydrated, so its first render still matches the prerendered one */
export function load() {
  if (loaded) return;
  loaded = true;
  Object.assign(settings, read());
  spoken = detect(navigator.languages);
  $effect.root(() => {
    $effect(() => {
      for (const name of names) document.documentElement.dataset[name] = String(looks[name]);
    });
    $effect(() => void setLocale(language.current));
    $effect(() => write($state.snapshot(settings)));
  });
}

export function clear() {
  try {
    localStorage.clear();
  } catch {
    // there was nothing we could have kept
  }
  Object.assign(settings, defaults());
}

/** Each language under its own name, with the tag the browser and Intl know it by */
export const LOCALES = {
  en: { name: 'English', tag: 'en-GB' },
  fr: { name: 'Français', tag: 'fr' },
  es: { name: 'Español', tag: 'es' },
  de: { name: 'Deutsch', tag: 'de' },
  it: { name: 'Italiano', tag: 'it' },
  pt: { name: 'Português', tag: 'pt-BR' },
  pl: { name: 'Polski', tag: 'pl' },
  zh: { name: '中文', tag: 'zh-Hans' }
};

export type Locale = keyof typeof LOCALES;

/** A count in every form its language needs, with # for the number */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const isLocale = (code: unknown): code is Locale => Object.hasOwn(LOCALES, String(code));

/** The first of the browser's languages there's a translation for, whatever its region */
export const detect = (wanted: readonly string[]): Locale =>
  wanted.map((tag) => tag.split('-')[0].toLowerCase()).find(isLocale) ?? 'en';

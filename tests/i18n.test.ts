import { describe, expect, it, vi } from 'vitest';
import { count, setLocale, t } from '#lib/i18n/i18n.svelte.js';
import { detect, LOCALES, type Locale, type Plural } from '#lib/i18n/locales.js';
import en, { type Messages } from '#lib/i18n/messages/en.js';

vi.stubGlobal('document', { documentElement: { lang: 'en-GB' } });

const translations = Object.fromEntries(
  Object.entries(
    import.meta.glob<Messages>('/src/lib/i18n/messages/*.ts', { eager: true, import: 'default' })
  ).map(([path, messages]) => [path.match(/(\w+)\.ts$/)![1], messages])
);

const isPlural = (value: unknown): value is Plural =>
  typeof value === 'object' && value !== null && 'other' in value;

/** Holds a translation to the shape of the English, and every form and placeholder in it */
function matches(english: unknown, translated: unknown, tag: string, path: string) {
  if (isPlural(english)) {
    const rules = new Intl.PluralRules(tag);
    const needed = new Set(Array.from({ length: 1000 }, (_, n) => rules.select(n)));
    for (const form of needed)
      expect((translated as Plural)[form] ?? '', `${path}.${form}`).toContain('#');
  } else if (typeof english === 'function') {
    const say = translated as (...args: string[]) => string;
    expect(say.length, path).toBe(english.length);
    const args = Array.from({ length: english.length }, (_, i) => `{${i}}`);
    for (const arg of args) expect(say(...args), path).toContain(arg);
  } else if (typeof english === 'object' && english !== null) {
    const group = translated as Record<string, unknown>;
    expect(Object.keys(group).sort(), path).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(english))
      matches(value, group[key], tag, `${path}.${key}`);
  } else {
    expect(translated, path).toBeTypeOf('string');
    expect(translated, path).not.toBe('');
  }
}

describe('detect', () => {
  it("takes the first of the browser's languages there's a translation for", () => {
    expect(detect(['ja', 'fr-CA', 'de'])).toBe('fr');
    expect(detect(['PT-br'])).toBe('pt');
    expect(detect(['zh-TW'])).toBe('zh');
  });

  it('falls back to English', () => {
    expect(detect([])).toBe('en');
    expect(detect(['ja', 'ko'])).toBe('en');
  });
});

describe('translations', () => {
  it('covers every language on offer', () => {
    expect(Object.keys(translations).sort()).toEqual(Object.keys(LOCALES).sort());
  });

  for (const [code, messages] of Object.entries(translations))
    it(`says everything in ${code} that English does`, () =>
      matches(en, messages, LOCALES[code as Locale].tag, code));
});

describe('setLocale', () => {
  it('swaps the words, plural rules and page language together', async () => {
    expect(count(t.trains, 1)).toBe('1 train');
    await setLocale('pl');
    expect(count(t.trains, 2)).toBe('2 pociągi');
    expect(count(t.trains, 5)).toBe('5 pociągów');
    expect(document.documentElement.lang).toBe('pl');
    await setLocale('en');
    expect(count(t.trains, 5)).toBe('5 trains');
  });

  it('keeps the last language asked for when an earlier one loads late', async () => {
    // English is already in hand, so it lands before French however quick the import
    await setLocale('de');
    const slow = setLocale('fr');
    await setLocale('en');
    await slow;
    expect(t.title).toBe(en.title);
  });
});

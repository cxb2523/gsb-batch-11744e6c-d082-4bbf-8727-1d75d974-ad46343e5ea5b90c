import { getLanguage, type Language } from '../i18n';
import { STORY_EN, STORY_ZH, type StoryKey, type StoryTable } from './script';
import { STORY_LOCALES } from './script-locales';

const TABLES: Record<Language, Partial<StoryTable>> = {
  zh: STORY_ZH, en: STORY_EN, ...STORY_LOCALES,
};

/** Story copy in the current language; falls back to English per key. */
export function storyText(key: StoryKey, values: Record<string, string | number> = {}, language: Language = getLanguage()): string {
  const template = TABLES[language][key] ?? STORY_EN[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}

/** Dialogue entries store lines separated by `|`. */
export function storyLines(key: StoryKey, language: Language = getLanguage()): string[] {
  return storyText(key, {}, language).split('|');
}

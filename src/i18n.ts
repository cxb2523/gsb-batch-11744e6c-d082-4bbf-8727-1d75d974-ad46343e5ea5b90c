export const LANGUAGES = ['zh', 'zh-Hant', 'en', 'ja', 'ko'] as const;
export type Language = typeof LANGUAGES[number];
export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: Language; tag: string; label: string }> = [
  { code: 'zh', tag: 'zh-CN', label: '简体中文' }, { code: 'zh-Hant', tag: 'zh-Hant', label: '繁體中文' },
  { code: 'en', tag: 'en', label: 'English' }, { code: 'ja', tag: 'ja', label: '日本語' }, { code: 'ko', tag: 'ko', label: '한국어' },
];
export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(language => language === value);
export const languageTag = (language: Language): string => LANGUAGE_OPTIONS.find(option => option.code === language)!.tag;
export type LocalizedText = string | (() => string);
export const LANGUAGE_SAVE_KEY = 'unspool:language:v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function initialLanguage(saved: string | null, browserLanguage?: string): Language {
  if (isLanguage(saved)) return saved;
  if (!browserLanguage) return 'zh';
  const tag = browserLanguage.toLowerCase();
  if (/^ja(?:-|$)/.test(tag)) return 'ja';
  if (/^ko(?:-|$)/.test(tag)) return 'ko';
  if (/^zh(?:-|$)/.test(tag)) {
    if (tag.includes('-hans')) return 'zh';
    return tag.includes('-hant') || /-(tw|hk|mo)(?:-|$)/.test(tag) ? 'zh-Hant' : 'zh';
  }
  return 'en';
}

/** Language is a separate preference, never part of a journey or chapter save. */
export class LanguagePreference {
  private language: Language;
  private readonly listeners = new Set<(language: Language) => void>();
  constructor(private readonly storage: PreferenceStorage | null, browserLanguage?: string) {
    let saved: string | null = null;
    try { saved = storage?.getItem(LANGUAGE_SAVE_KEY) ?? null; } catch { /* session preference still works */ }
    this.language = initialLanguage(saved, browserLanguage);
  }
  get current(): Language { return this.language; }
  set(language: Language): void {
    if (!isLanguage(language)) return;
    // Clicking the already selected browser default is still an explicit choice.
    try { this.storage?.setItem(LANGUAGE_SAVE_KEY, language); } catch { /* retain the session selection */ }
    if (this.language === language) return;
    this.language = language;
    for (const listener of this.listeners) listener(language);
  }
  subscribe(listener: (language: Language) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

function preferenceStorage(): PreferenceStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
const preference = new LanguagePreference(preferenceStorage(), typeof window === 'undefined' ? undefined : navigator.language);
export const getLanguage = (): Language => preference.current;
export const setLanguage = (language: Language): void => preference.set(language);
export const subscribeLanguage = (listener: (language: Language) => void): (() => void) => preference.subscribe(listener);
export const resolveText = (text: LocalizedText): string => typeof text === 'function' ? text() : text;

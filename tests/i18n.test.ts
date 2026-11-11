import assert from 'node:assert/strict';
import test from 'node:test';
import { initialLanguage, LanguagePreference, LANGUAGE_SAVE_KEY } from '../src/i18n';

test('a saved selection wins over the browser language, invalid values use the browser', () => {
  assert.equal(initialLanguage('zh', 'en-US'), 'zh');
  assert.equal(initialLanguage('en', 'zh-TW'), 'en');
  assert.equal(initialLanguage('fr', 'zh-HK'), 'zh-Hant');
  assert.equal(initialLanguage(null, 'zh-TW'), 'zh-Hant');
  assert.equal(initialLanguage(null, 'zh-MO'), 'zh-Hant');
  assert.equal(initialLanguage(null, 'zh-Hant-TW'), 'zh-Hant');
  assert.equal(initialLanguage(null, 'zh-Hans-HK'), 'zh');
  assert.equal(initialLanguage(null, 'zh-CN'), 'zh');
  assert.equal(initialLanguage(null, 'ja-JP'), 'ja');
  assert.equal(initialLanguage(null, 'ko-KR'), 'ko');
  assert.equal(initialLanguage('ja', 'zh-CN'), 'ja');
  assert.equal(initialLanguage(null, 'en-GB'), 'en');
  assert.equal(initialLanguage(null, 'fr-FR'), 'en');
  assert.equal(initialLanguage(null), 'zh');
});
test('language switches persist only a preference and notify once without altering journey saves', () => {
  const values = new Map([['unspool:chapter1:v1', '{"confirmed":true}']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const preference = new LanguagePreference(storage, 'zh-CN');
  const calls: string[] = [], unsubscribe = preference.subscribe(language => calls.push(language));
  preference.set('zh');
  assert.equal(values.get(LANGUAGE_SAVE_KEY), 'zh', 'an explicit default choice was not remembered');
  assert.deepEqual(calls, []);
  preference.set('en'); preference.set('en');
  assert.deepEqual(calls, ['en']);
  assert.equal(values.get(LANGUAGE_SAVE_KEY), 'en');
  assert.equal(values.get('unspool:chapter1:v1'), '{"confirmed":true}');
  assert.equal(new LanguagePreference(storage, 'zh-CN').current, 'en');
  unsubscribe(); preference.set('zh'); assert.deepEqual(calls, ['en']);
});
test('blocked preference storage retains a working session language', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const preference = new LanguagePreference(blocked, 'zh-CN');
  preference.set('en'); assert.equal(preference.current, 'en');
  assert.equal(new LanguagePreference(null, 'en-US').current, 'en');
});

test('all five explicit choices survive reload while old language preference keys remain compatible', () => {
  const values = new Map([[LANGUAGE_SAVE_KEY, 'en']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const preference = new LanguagePreference(storage, 'ja-JP');
  assert.equal(preference.current, 'en');
  for (const language of ['zh', 'zh-Hant', 'en', 'ja', 'ko'] as const) {
    preference.set(language);
    assert.equal(new LanguagePreference(storage, 'en-US').current, language);
  }
});

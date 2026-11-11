import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME_COPY } from '../src/game-copy.ts';
import { ADDITIONAL_LOCALES } from '../src/locales/index.ts';
import { STORY_ZH } from '../src/chapter/script.ts';
import { UI_COPY } from '../src/ui-copy.ts';
import { interfaceMarkup } from '../src/ui/template.ts';

const LOCALES = ['zh-Hant', 'ja', 'ko'] as const;
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

type Tables = Record<'zh' | 'en' | 'zh-Hant' | 'ja' | 'ko', Record<string, string>>;
const ui: Tables = {
  zh: Object.fromEntries(Object.entries(UI_COPY).map(([key, value]) => [key, value.zh])),
  en: Object.fromEntries(Object.entries(UI_COPY).map(([key, value]) => [key, value.en])),
  'zh-Hant': ADDITIONAL_LOCALES['zh-Hant'].ui, ja: ADDITIONAL_LOCALES.ja.ui, ko: ADDITIONAL_LOCALES.ko.ui,
};
const game: Tables = {
  zh: GAME_COPY.zh, en: GAME_COPY.en,
  'zh-Hant': ADDITIONAL_LOCALES['zh-Hant'].game, ja: ADDITIONAL_LOCALES.ja.game, ko: ADDITIONAL_LOCALES.ko.game,
};

test('every language covers every UI and game key, nothing extra', () => {
  for (const [name, tables] of [['ui', ui], ['game', game]] as const) {
    const expected = Object.keys(tables.zh).sort();
    for (const language of ['en', ...LOCALES] as const) assert.deepEqual(Object.keys(tables[language]).sort(), expected, `${name} keys differ in ${language}`);
  }
});

test('UI and game strings are non-empty, trimmed and keep every {placeholder}', () => {
  for (const [name, tables] of [['ui', ui], ['game', game]] as const) {
    for (const [key, zh] of Object.entries(tables.zh)) {
      for (const language of ['zh', 'en', ...LOCALES] as const) {
        const text = tables[language][key];
        assert.ok(typeof text === 'string' && text.length > 0, `${name}.${key} is empty in ${language}`);
        assert.equal(text, text.trim(), `${name}.${key} has stray whitespace in ${language}`);
        assert.deepEqual(placeholders(text), placeholders(zh), `${name}.${key} placeholders differ in ${language}`);
      }
    }
  }
});

test('the old replica wording is gone and Messenger appears only in the inspired-by credit', () => {
  const banned = /replica|study|delivery|deliver|letter|parcel|quest|复刻|復刻|学习|學習|送信|信使|送达|送達|任务|任務|レプリカ|配達|手紙|クエスト|복제|배달|편지|퀘스트/i;
  for (const tables of [ui, game]) {
    for (const language of ['zh', 'en', ...LOCALES] as const) {
      for (const [key, text] of Object.entries(tables[language])) {
        assert.ok(!banned.test(text), `${key} (${language}) mentions retired wording: ${text}`);
        if (/messenger|abeto/i.test(text)) assert.equal(key, 'creditsInspired', `${key} (${language}) references the inspiration outside the credit`);
      }
    }
  }
  for (const language of ['zh', 'en', ...LOCALES] as const) {
    const credit = ui[language].creditsInspired;
    assert.ok(credit.includes('Messenger') && credit.includes('abeto'), `credit line in ${language} must name Messenger by abeto (the UI links the word)`);
  }
  assert.match(ui.en.creditsMadeBy, /Maker Jackie/);
});

test('every copy key referenced by the interface markup exists', () => {
  const markup = interfaceMarkup();
  const used = (attribute: string) => [...markup.matchAll(new RegExp(`${attribute}="([\\w.]+)"`, 'g'))].map(match => match[1]);
  for (const attribute of ['data-copy', 'data-copy-aria', 'data-copy-title', 'data-copy-inspired']) {
    const keys = used(attribute);
    assert.ok(keys.length > 0, `${attribute} not used`);
    for (const key of keys) assert.ok(key in ui.zh, `${attribute}="${key}" is not a UI copy key`);
  }
  for (const key of used('data-story')) assert.ok(key in STORY_ZH, `data-story="${key}" is not a story key`);
});

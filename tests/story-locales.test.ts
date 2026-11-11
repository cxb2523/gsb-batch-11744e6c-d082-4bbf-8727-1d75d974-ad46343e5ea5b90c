import assert from 'node:assert/strict';
import test from 'node:test';
import { NPC_PLACEMENTS } from '../src/chapter/data.ts';
import { STORY_EN, STORY_ZH, type StoryTable } from '../src/chapter/script.ts';
import { STORY_LOCALES } from '../src/chapter/script-locales.ts';

const canonicalKeys = Object.keys(STORY_ZH).sort();
const tables: Record<string, StoryTable> = { zh: STORY_ZH, en: STORY_EN, ...STORY_LOCALES };
const localized = Object.entries(STORY_LOCALES) as [string, StoryTable][];
const segments = (text: string) => text.split('|');
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

test('every language covers exactly the keys of the canonical script', () => {
  for (const [language, table] of Object.entries(tables)) {
    assert.deepEqual(Object.keys(table).sort(), canonicalKeys, `${language} key set differs from STORY_ZH`);
  }
});

test('every string is non-empty, trimmed and has no empty `|` segments', () => {
  for (const [language, table] of Object.entries(tables)) {
    for (const key of canonicalKeys) {
      const text = table[key as keyof StoryTable];
      assert.equal(typeof text, 'string', `${language}/${key}`);
      assert.ok(text.length > 0, `${language}/${key} is empty`);
      assert.equal(text, text.trim(), `${language}/${key} has stray whitespace`);
      for (const part of segments(text)) assert.ok(part.trim().length > 0, `${language}/${key} has an empty segment`);
    }
  }
});

test('`|` line counts match the canonical script in every language', () => {
  for (const key of canonicalKeys) {
    const expected = segments(STORY_ZH[key as keyof StoryTable]).length;
    for (const [language, table] of Object.entries(tables)) {
      assert.equal(segments(table[key as keyof StoryTable]).length, expected, `${language}/${key} line count`);
    }
  }
});

test('`{placeholder}` tokens survive translation unchanged', () => {
  for (const key of canonicalKeys) {
    const expected = placeholders(STORY_ZH[key as keyof StoryTable]);
    for (const [language, table] of Object.entries(tables)) {
      assert.deepEqual(placeholders(table[key as keyof StoryTable]), expected, `${language}/${key} placeholders`);
    }
  }
  // Sanity: the script really does use placeholders, so the check above is not vacuous.
  assert.deepEqual(placeholders(STORY_ZH['obj.roots']), ['{count}']);
  assert.deepEqual(placeholders(STORY_ZH['notice.connected']), ['{name}']);
});

test('names, sockets and connections exist in every language', () => {
  for (const [language, table] of Object.entries(tables)) {
    for (const npc of NPC_PLACEMENTS) assert.ok(table[`name.${npc.id}` as keyof StoryTable], `${language} name.${npc.id}`);
    for (const key of canonicalKeys.filter(k => /^(socket|conn|district)\./.test(k))) assert.ok(table[key as keyof StoryTable], `${language}/${key}`);
  }
});

test('each language reads as its own script (no copy-pasted English or wrong script)', () => {
  const kana = /[぀-ヿ]/, hangul = /[가-힯]/;
  // Simplified-only forms that must not leak into the Traditional table.
  const simplified = /[这们个灯线吗电给还没让对说话为开关门边头动麦风车鱼汤飞谁听见]/;
  const spoken = canonicalKeys.filter(k => !/^(name|prompt)\./.test(k) && k !== 'cat.idle');
  for (const key of spoken) {
    const hant = STORY_LOCALES['zh-Hant'][key as keyof StoryTable];
    assert.ok(!simplified.test(hant), `zh-Hant/${key} contains simplified characters: ${hant}`);
    const ja = STORY_LOCALES.ja[key as keyof StoryTable];
    assert.ok(!hangul.test(ja), `ja/${key} contains Hangul`);
    const ko = STORY_LOCALES.ko[key as keyof StoryTable];
    assert.ok(!kana.test(ko), `ko/${key} contains kana`);
  }
  for (const [language, table] of localized) {
    assert.notEqual(table['chapter.title'], STORY_EN['chapter.title'], `${language} chapter title left in English`);
    assert.notEqual(table['postcard.save'], STORY_EN['postcard.save'], `${language} postcard.save left in English`);
  }
  assert.ok(kana.test(STORY_LOCALES.ja['wick.intro']));
  assert.ok(hangul.test(STORY_LOCALES.ko['wick.intro']));
});

test('chapter title and end line use the agreed wording', () => {
  assert.equal(STORY_LOCALES['zh-Hant']['chapter.title'], '第一章 · 重新亮起來');
  assert.equal(STORY_LOCALES['zh-Hant']['chapter.end'], '未完待續');
  assert.equal(STORY_LOCALES.ja['chapter.title'], '第一章・もういちど灯る');
  assert.equal(STORY_LOCALES.ja['chapter.end'], 'つづく');
  assert.equal(STORY_LOCALES.ko['chapter.title'], '제1장 · 다시 켜지다');
  assert.equal(STORY_LOCALES.ko['chapter.end'], '계속됩니다');
});

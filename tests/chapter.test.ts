import assert from 'node:assert/strict';
import test from 'node:test';
import { CONNECTIONS, NPC_PLACEMENTS, SOCKET_HINTS, dir } from '../src/chapter/data.ts';
import { STORY_EN, STORY_ZH } from '../src/chapter/script.ts';
import { parseChapterSave } from '../src/chapter/progress.ts';

test('every connection references known sockets and earlier prerequisites', () => {
  const seen = new Set<string>();
  for (const connection of CONNECTIONS) {
    assert.ok(SOCKET_HINTS[connection.from], connection.from);
    assert.ok(SOCKET_HINTS[connection.to], connection.to);
    for (const required of connection.requires) assert.ok(seen.has(required), `${connection.id} requires ${required}`);
    seen.add(connection.id);
  }
});

test('story tables cover the same keys, names, sockets and connections', () => {
  assert.deepEqual(Object.keys(STORY_EN).sort(), Object.keys(STORY_ZH).sort());
  for (const npc of NPC_PLACEMENTS) assert.ok(STORY_ZH[`name.${npc.id}` as keyof typeof STORY_ZH]);
  for (const socket of Object.keys(SOCKET_HINTS)) assert.ok(STORY_ZH[`socket.${socket}` as keyof typeof STORY_ZH]);
  for (const connection of CONNECTIONS) assert.ok(STORY_ZH[`conn.${connection.id}` as keyof typeof STORY_ZH]);
});

test('dir produces unit vectors with latitude on +Y', () => {
  assert.ok(Math.abs(dir(90, 0).y - 1) < 1e-9);
  assert.ok(Math.abs(dir(10, 120).length() - 1) < 1e-9);
});

test('chapter saves reject unknown ids and orphaned thread paths', () => {
  const parsed = parseChapterSave(JSON.stringify({ version: 1, completed: ['h1', 'zz'], flags: ['seen:wick.intro', 3],
    threads: { version: 1, threads: [{ id: 'h1', points: [1, 2, 3] }, { id: 'h2', points: [1, 2, 3] }, { id: 'h1', points: [1, 2] }] } }));
  assert.deepEqual(parsed?.completed, ['h1']);
  assert.deepEqual(parsed?.flags, ['seen:wick.intro']);
  assert.equal(parsed?.threads?.threads.length, 1);
  assert.equal(parseChapterSave('{"version":2}'), null);
  assert.equal(parseChapterSave('nope'), null);
});

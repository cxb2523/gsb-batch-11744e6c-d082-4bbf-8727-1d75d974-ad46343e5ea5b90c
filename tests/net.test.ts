import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GREETING_COUNT, QUANT, THREAD_LIST_POINTS, THREAD_MAX_POINTS, decodePoints, encodePoints, parseClientMessage, thinPoints, validateThread,
} from '../src/net/protocol.ts';

/** A walk along the equator at radius 14.2 with `count` points `step` apart. */
function walk(count: number, step = 0.45): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) { const a = i * step / 14.2; out.push(Math.cos(a) * 14.2, 0.3, Math.sin(a) * 14.2); }
  return out;
}

test('position and greeting messages: valid ones parse, junk is dropped', () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'p', p: [0, 14.2, 0], f: [1, 0, 0], m: 0.5 })), { t: 'p', p: [0, 14.2, 0], f: [1, 0, 0], m: 0.5 });
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'g', g: 2 })), { t: 'g', g: 2 });
  for (const bad of [
    { t: 'p', p: [0, 40, 0], f: [1, 0, 0], m: 0 }, // off the planet
    { t: 'p', p: [0, 14, 0], f: [3, 0, 0], m: 0 }, // not a direction
    { t: 'g', g: GREETING_COUNT }, // no such greeting
    { t: 'g', g: 'hello' }, // free text never travels
    { t: 'x' },
  ]) assert.equal(parseClientMessage(JSON.stringify(bad)), null);
  assert.equal(parseClientMessage('{'), null);
  assert.equal(parseClientMessage('x'.repeat(400)), null);
});

test('walk uploads: a real walk is accepted, teleports and wrong sizes are rejected', () => {
  const ok = validateThread({ c: 2, p: walk(100) });
  assert.ok(ok);
  assert.equal(ok!.points.length, 300);
  assert.equal(validateThread({ c: 9, p: walk(100) }), null, 'unknown color');
  assert.equal(validateThread({ c: 0, p: walk(5) }), null, 'too short');
  assert.equal(validateThread({ c: 0, p: walk(THREAD_MAX_POINTS + 1) }), null, 'too long');
  const jump = walk(50); jump.push(0, -14.2, 0);
  assert.equal(validateThread({ c: 0, p: jump }), null, 'a jump across the planet');
  const high = walk(50); high[4] = 30;
  assert.equal(validateThread({ c: 0, p: high }), null, 'a point far above the ground');
});

test('the list thins long walks but keeps both ends, and survives encoding', () => {
  const long = validateThread({ c: 1, p: walk(THREAD_MAX_POINTS) })!.points;
  const thin = thinPoints(long, THREAD_LIST_POINTS);
  assert.ok(thin.length / 3 <= THREAD_LIST_POINTS + 1);
  assert.deepEqual([...thin.slice(0, 3)], [...long.slice(0, 3)]);
  assert.deepEqual([...thin.slice(-3)], [...long.slice(-3)]);
  const short = validateThread({ c: 1, p: walk(40) })!.points;
  assert.equal(thinPoints(short, THREAD_LIST_POINTS), short, 'short walks are untouched');
  const decoded = decodePoints(encodePoints(thin));
  assert.equal(decoded.length, thin.length);
  for (let i = 0; i < thin.length; i++) assert.ok(Math.abs(decoded[i] - thin[i] / QUANT) < 1e-6);
});

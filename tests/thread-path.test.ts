import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GAP_BRIDGE, PathRecorder, RECORD_SPACING, liveSag, pointAlong, polylineLength, pulseDuration, quantize,
  reelDuration, sampleSpline, simplifyPath, tetherScale,
} from '../src/thread/path.ts';

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

/** Points walking around a circle on the planet surface (radius 14). */
function walk(count: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * step / 14;
    out.push(14 * Math.sin(angle), 0, 14 * Math.cos(angle));
  }
  return out;
}

test('recorder keeps points at least the sampling spacing apart', () => {
  const recorder = new PathRecorder(36);
  recorder.begin(0, 0, 14);
  const path = walk(400, 0.05);
  for (let i = 0; i < path.length; i += 3) recorder.record(path[i], path[i + 1], path[i + 2]);
  assert.ok(recorder.count > 10);
  for (let i = 1; i < recorder.count; i++) {
    const d = Math.hypot(
      recorder.points[i * 3] - recorder.points[i * 3 - 3],
      recorder.points[i * 3 + 1] - recorder.points[i * 3 - 2],
      recorder.points[i * 3 + 2] - recorder.points[i * 3 - 1]);
    assert.ok(d >= RECORD_SPACING - 1e-6, `point ${i} only ${d} from the previous`);
    assert.ok(d < RECORD_SPACING * 2.1, `point ${i} is ${d} from the previous`);
  }
});

test('recorded length counts toward capacity and stops exactly when the spool is empty', () => {
  const recorder = new PathRecorder(10);
  recorder.begin(0, 0, 14);
  assert.equal(recorder.full, false);
  close(recorder.remaining, 1);
  const path = walk(1000, 0.05);
  let halfway = false;
  for (let i = 0; i < path.length; i += 3) {
    recorder.record(path[i], path[i + 1], path[i + 2]);
    if (!halfway && recorder.length > 5) { halfway = true; assert.ok(recorder.remaining < 0.55 && recorder.remaining > 0.4); }
  }
  assert.equal(recorder.full, true);
  close(recorder.length, 10, 1e-3);
  assert.equal(recorder.remaining, 0);
  const count = recorder.count;
  assert.equal(recorder.record(0, 0, 14), 0, 'no more points once full');
  assert.equal(recorder.count, count);
  assert.ok(Math.abs(polylineLength(recorder.points, recorder.count) - 10) < 1e-3);
});

test('big gaps (landing after a jump) are bridged with draped intermediate points', () => {
  const recorder = new PathRecorder(36);
  recorder.begin(0, 0, 14);
  let calls = 0;
  const added = recorder.record(0, 0, 14 + 3, (t, gap, p) => { calls++; p[1] -= 0.1 * t; assert.ok(gap > GAP_BRIDGE); });
  assert.ok(added >= 4, `expected several bridge points, got ${added}`);
  assert.equal(calls, added - 1, 'the landing point itself is not draped');
  close(recorder.lastZ(), 17);
});

test('simplify keeps endpoints, drops collinear points and caps straight pieces', () => {
  const line: number[] = [];
  for (let i = 0; i <= 40; i++) line.push(i * 0.22, 0, 14);
  const simple = simplifyPath(line, 41, 0.012, 1.2);
  assert.ok(simple.length / 3 < 41 / 2, 'collinear points removed');
  assert.deepEqual(simple.slice(0, 3), [0, 0, 14]);
  assert.deepEqual(simple.slice(-3), [40 * 0.22, 0, 14]);
  for (let i = 1; i < simple.length / 3; i++) {
    assert.ok(Math.hypot(simple[i * 3] - simple[i * 3 - 3], simple[i * 3 + 1] - simple[i * 3 - 2], simple[i * 3 + 2] - simple[i * 3 - 1]) <= 1.2 + 1e-6);
  }
  // A real corner survives.
  const corner = [0, 0, 14, 1, 0, 14, 2, 0, 14, 2, 1, 14, 2, 2, 14];
  const kept = simplifyPath(corner, 5, 0.012, 5);
  assert.ok(kept.length / 3 >= 3);
  assert.deepEqual(kept.slice(3, 6), [2, 0, 14]);
});

test('quantize rounds to 0.01 world units', () => {
  assert.deepEqual(quantize([1.2345, -0.004, 13.999]), [1.23, 0, 14]);
  const q = quantize(Float32Array.from([3.14159, 2.71828]));
  assert.deepEqual(q, [3.14, 2.72]);
});

test('smoothed spline passes through the control points and has a sensible length', () => {
  const points = walk(30, 0.6);
  const { xyz, along } = sampleSpline(points, 30);
  const rings = along.length;
  assert.ok(rings > 100);
  for (let i = 1; i < rings; i++) assert.ok(along[i] > along[i - 1], 'arc length strictly increases');
  const polyline = polylineLength(points, 30);
  assert.ok(along[rings - 1] >= polyline - 1e-3 && along[rings - 1] < polyline * 1.01, `${along[rings - 1]} vs ${polyline}`);
  // first and last samples are the end control points
  close(xyz[0], points[0]); close(xyz[2], points[2]);
  close(xyz[(rings - 1) * 3], points[29 * 3], 1e-4); close(xyz[(rings - 1) * 3 + 2], points[29 * 3 + 2], 1e-4);
  // ring spacing is even enough for a tube
  for (let i = 1; i < rings; i++) assert.ok(along[i] - along[i - 1] < 0.2);
});

test('pointAlong interpolates by arc length', () => {
  const xyz = [0, 0, 0, 1, 0, 0, 3, 0, 0];
  const along = [0, 1, 3];
  const out = [0, 0, 0], tangent = [0, 0, 0];
  pointAlong(xyz, along, 3, 2, out, tangent);
  close(out[0], 2); close(tangent[0], 1);
  pointAlong(xyz, along, 3, 99, out);
  close(out[0], 3);
});

test('tether holds the player back only when stepping away from the last laid point', () => {
  const anchor = [0, 0, 14];
  const stand = (x: number): [number, number, number] => [x, 0, Math.sqrt(14 * 14 - x * x)];
  const [px, py, pz] = stand(1.6);
  const away = [1, 0, 0], toward = [-1, 0, 0], sideways = [0, 1, 0];
  // Direction vectors are tangent-ish; the test only needs the sign relative to the anchor.
  close(tetherScale(px, py, pz, anchor[0], anchor[1], anchor[2], away[0], away[1], away[2]), 0, 1e-6);
  close(tetherScale(px, py, pz, anchor[0], anchor[1], anchor[2], toward[0], toward[1], toward[2]), 1);
  close(tetherScale(px, py, pz, anchor[0], anchor[1], anchor[2], sideways[0], sideways[1], sideways[2]), 1);
  // Close to the anchor nothing is held.
  const [nx, ny, nz] = stand(0.3);
  close(tetherScale(nx, ny, nz, anchor[0], anchor[1], anchor[2], away[0], away[1], away[2]), 1);
  // The hold builds up smoothly with distance.
  const mid = stand(1.0);
  const scale = tetherScale(mid[0], mid[1], mid[2], anchor[0], anchor[1], anchor[2], away[0], away[1], away[2]);
  assert.ok(scale > 0 && scale < 1, `partial hold expected, got ${scale}`);
});

test('live span sags loosely, tightens as the spool empties and is straight when taut', () => {
  assert.ok(liveSag(2, 1, false) > 0.3);
  assert.ok(liveSag(2, 0.05, false) < liveSag(2, 1, false));
  assert.equal(liveSag(2, 0.5, true), 0);
  assert.equal(liveSag(2, 0, false), 0);
  assert.ok(liveSag(500, 1, false) <= 1.1, 'sag is bounded');
});

test('pulse and reel timings stay inside the designed windows', () => {
  close(pulseDuration(6), 1);
  close(pulseDuration(24), 2);
  close(pulseDuration(80), 3);
  for (const length of [1, 10, 36, 80]) {
    const seconds = reelDuration(length);
    assert.ok(seconds >= 0.6 && seconds <= 1, `reel of ${length} takes ${seconds}`);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Cord, MAX_RINGS, RADIAL } from '../src/thread/cord.ts';
import { PathRecorder } from '../src/thread/path.ts';

function arc(count: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * step / 14;
    out.push(14.05 * Math.sin(angle), 0.3 * Math.sin(i * 0.4), 14.05 * Math.cos(angle));
  }
  return out;
}

function record(points: number[], capacity = 36): PathRecorder {
  const recorder = new PathRecorder(capacity);
  recorder.begin(points[0], points[1], points[2]);
  for (let i = 3; i < points.length; i += 3) recorder.record(points[i], points[i + 1], points[i + 2]);
  return recorder;
}

const finite = (values: ArrayLike<number>, count: number) => {
  for (let i = 0; i < count; i++) assert.ok(Number.isFinite(values[i]), `value ${i} is ${values[i]}`);
};

test('incremental laying keeps committed rings stable while the tail changes', () => {
  const recorder = record(arc(200, 0.05));
  const cord = new Cord('power', 1);
  cord.commit(recorder.points, recorder.count);
  cord.setTail(recorder.points, recorder.count, 0, 0.6, 14, 0.2, 0, 0);
  const committed = cord.committed;
  assert.ok(committed > 20, `committed ${committed}`);
  const before = Array.from(cord.centers.slice(0, committed * 3));
  const ringsA = cord.rings;
  cord.setTail(recorder.points, recorder.count, 1, 0.9, 14.5, 0, 0.03, 1.234);
  assert.deepEqual(Array.from(cord.centers.slice(0, committed * 3)), before, 'committed rings never move');
  assert.ok(cord.rings >= committed + 2);
  assert.ok(Math.abs(cord.rings - ringsA) < 40);
  for (let r = 1; r < cord.rings; r++) assert.ok(cord.along[r] >= cord.along[r - 1], 'arc length never decreases');
  finite(cord.centers, cord.rings * 3);
  assert.ok(cord.geometry.drawRange.count > 0);
  assert.equal(cord.geometry.drawRange.count, (cord.rings - 1) * RADIAL * 6);
});

test('the tail meets the committed cord without a gap', () => {
  const recorder = record(arc(120, 0.05));
  const cord = new Cord('water', 2);
  cord.commit(recorder.points, recorder.count);
  cord.setTail(recorder.points, recorder.count, recorder.lastX(), recorder.lastY() + 0.6, recorder.lastZ(), 0.1, 0, 0);
  for (let r = 1; r < cord.rings; r++) {
    const d = cord.along[r] - cord.along[r - 1];
    assert.ok(d < 0.25, `gap of ${d} before ring ${r}`);
  }
});

test('settling from final points matches the incremental cord on the committed part', () => {
  const recorder = record(arc(160, 0.05));
  const live = new Cord('lights', 3);
  live.commit(recorder.points, recorder.count);
  live.setTail(recorder.points, recorder.count, recorder.lastX() + 0.1, recorder.lastY(), recorder.lastZ(), 0, 0, 0);
  const final = new Cord('lights', 3);
  final.settle(recorder.points, recorder.count);
  const shared = live.committed - 1;
  assert.ok(shared > 10);
  for (let i = 0; i < shared * 3; i++) assert.ok(Math.abs(live.centers[i] - final.centers[i]) < 1e-4, `ring component ${i} differs`);
  assert.ok(Math.abs(final.length - recorder.length) / recorder.length < 0.03, `${final.length} vs ${recorder.length}`);
});

test('geometry buffers stay finite and inside the bounding sphere', () => {
  const recorder = record(arc(180, 0.05));
  const cord = new Cord('voice', 4);
  cord.settle(recorder.points, recorder.count);
  const position = cord.geometry.getAttribute('position');
  finite(position.array, cord.rings * 7 * 3);
  const normal = cord.geometry.getAttribute('normal');
  for (let i = 0; i < cord.rings * 7; i++) {
    const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    assert.ok(Math.abs(length - 1) < 1e-3, `normal ${i} has length ${length}`);
  }
  const sphere = cord.geometry.boundingSphere!;
  for (let r = 0; r < cord.rings; r++) {
    const d = Math.hypot(cord.centers[r * 3] - sphere.center.x, cord.centers[r * 3 + 1] - sphere.center.y, cord.centers[r * 3 + 2] - sphere.center.z);
    assert.ok(d <= sphere.radius, `ring ${r} is outside the culling sphere`);
  }
  cord.clear();
  assert.equal(cord.geometry.drawRange.count, 0);
  assert.equal(cord.rings, 0);
});

test('a cord never exceeds its ring budget even for absurd spans', () => {
  const cord = new Cord('root', 5);
  const points = [0, 0, 14, 0, 0, 1000, 0, 500, 1000];
  cord.settle(points, 3);
  assert.ok(cord.rings <= MAX_RINGS);
  const recorder = new PathRecorder(36);
  recorder.begin(0, 0, 14);
  cord.commit(recorder.points, recorder.count);
  cord.setTail(recorder.points, recorder.count, 400, 400, 400, 1, 0.1, 0);
  assert.ok(cord.rings <= MAX_RINGS);
  finite(cord.centers, cord.rings * 3);
});

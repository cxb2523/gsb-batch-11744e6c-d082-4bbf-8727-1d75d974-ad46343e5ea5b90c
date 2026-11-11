import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { CONNECTIONS, SOCKET_HINTS, THREAD_CAPACITY, dir, type ConnectionId, type SocketId } from '../src/chapter/data.ts';
import type { SurfaceAnchor, ThreadFrame, ThreadSystem, World } from '../src/contracts.ts';
import { createThreadSystem } from '../src/thread/index.ts';

const GROUND = 13.9;

function fakeWorld(): World {
  const sockets = {} as Record<SocketId, SurfaceAnchor>;
  for (const [id, hint] of Object.entries(SOCKET_HINTS) as [SocketId, typeof SOCKET_HINTS[SocketId]][]) {
    const normal = dir(hint.lat, hint.lon);
    sockets[id] = { position: normal.clone().multiplyScalar(GROUND + 0.7), normal, forward: new Vector3(0, 1, 0) };
  }
  return { anchors: { sockets }, sampleRadius: () => GROUND, isWater: () => false } as unknown as World;
}

/** Drives the system like main.ts does: fixed frames, player walking on the surface. */
class Harness {
  readonly world = fakeWorld();
  readonly system: ThreadSystem;
  readonly player = new Vector3();
  time = 0;
  connected: { id: ConnectionId; end: Vector3 }[] = [];
  steps: number[] = [];
  constructor() {
    this.system = createThreadSystem(this.world);
    this.system.onConnected = (id, end) => this.connected.push({ id, end });
    this.system.onStep = index => this.steps.push(index);
  }
  socket(id: SocketId): Vector3 { return this.world.anchors.sockets[id].position; }
  ground(normal: Vector3): Vector3 { return normal.clone().normalize().multiplyScalar(GROUND); }
  /** Stand next to a socket on the ground. */
  stand(id: SocketId, offset = 0.4): void {
    const normal = this.socket(id).clone().normalize();
    const side = new Vector3(0, 1, 0).cross(normal).normalize();
    this.player.copy(this.ground(normal.addScaledVector(side, offset / GROUND)));
  }
  frame(grounded = true): ThreadFrame {
    return { time: this.time, dt: 1 / 60, playerPosition: this.player, playerNormal: this.player.clone().normalize(), grounded };
  }
  tick(seconds: number, grounded = true): void {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) { this.time += 1 / 60; this.system.update(this.frame(grounded)); }
  }
  /** Walk along the surface toward `target` at 3 u/s until within `stop` of it. */
  walkTo(target: Vector3, stop = 0.3): void {
    const goal = this.ground(target.clone());
    for (let guard = 0; guard < 60 * 40 && this.player.distanceTo(goal) > stop; guard++) {
      const toward = goal.clone().sub(this.player);
      const step = Math.min(toward.length(), 3 / 60);
      this.player.addScaledVector(toward.normalize(), step);
      this.player.setLength(GROUND);
      this.tick(1 / 60);
    }
  }
}

const available = (...ids: ConnectionId[]) => new Set<ConnectionId>(ids);

function meshByName(h: Harness, name: string): { count: number } | undefined {
  let found: { count: number } | undefined;
  h.system.group.traverse(object => { if (object.name === name) found = object as unknown as { count: number }; });
  return found;
}

test('pickup, laying, connecting, pulse and onConnected fire exactly once', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1'));
  h.stand('generator');
  h.tick(0.1);
  const prompt = h.system.prompt(h.player);
  assert.equal(prompt?.kind, 'pickup');
  assert.equal(prompt?.socket, 'generator');
  assert.equal(h.system.interact(prompt!), true);
  assert.equal(h.system.carrying, 'h1');
  assert.equal(h.system.carryingKind, 'power');
  assert.equal(h.system.remaining, 1);

  h.walkTo(h.socket('lighthouse'), 0.5);
  assert.ok(h.system.remaining < 1 && h.system.remaining > 0.3, `remaining ${h.system.remaining}`);
  assert.ok(h.system.laidDistance > 3);
  assert.ok(h.steps.length >= 3, 'music-box steps fire while laying');
  assert.deepEqual(h.steps, [...h.steps].sort((a, b) => a - b));
  assert.equal(new Set(h.steps).size, h.steps.length, 'step indices never repeat');
  assert.equal(h.connected.length, 0);

  const connect = h.system.prompt(h.player);
  assert.equal(connect?.kind, 'connect');
  assert.equal(connect?.socket, 'lighthouse');
  assert.equal(h.system.interact(connect!), true);
  assert.equal(h.system.carrying, null);
  assert.equal(h.system.connecting, 'h1');
  assert.equal(h.connected.length, 0, 'the pulse has to travel before the connection fires');
  assert.equal(h.system.serialize().threads.length, 0, 'not saved before the pulse arrives');
  assert.notEqual(h.system.prompt(h.player)?.socket, 'lighthouse', 'no prompt on a socket mid-connection');
  assert.notEqual(h.system.prompt(h.player)?.kind, 'connect');

  h.tick(0.4);
  assert.equal(h.connected.length, 0);
  h.tick(4);
  assert.equal(h.connected.length, 1, 'onConnected fires exactly once');
  assert.equal(h.connected[0].id, 'h1');
  assert.ok(h.connected[0].end.distanceTo(h.socket('lighthouse')) < 1e-6);
  assert.equal(h.system.connecting, null);
  const save = h.system.serialize();
  assert.equal(save.threads.length, 1);
  assert.equal(save.threads[0].id, 'h1');
  assert.ok(save.threads[0].points.length >= 6);
  // first and last control points are the sockets
  const pts = save.threads[0].points;
  assert.ok(new Vector3(pts[0], pts[1], pts[2]).distanceTo(h.socket('generator')) < 0.02);
  assert.ok(new Vector3(pts[pts.length - 3], pts[pts.length - 2], pts[pts.length - 1]).distanceTo(h.socket('lighthouse')) < 0.02);
  // nothing else happens when time keeps running
  h.tick(3);
  assert.equal(h.connected.length, 1);
});

test('the connection is already saved when onConnected fires (the director serializes inside it)', () => {
  const h = new Harness();
  let saved = -1;
  h.system.onConnected = () => { saved = h.system.serialize().threads.length; };
  h.system.setAvailable(available('h1'));
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  h.walkTo(h.socket('lighthouse'), 0.5);
  h.system.interact(h.system.prompt(h.player)!);
  h.tick(5);
  assert.equal(saved, 1);
});

test('serialized points are quantized to 0.01 and restore rebuilds without pulses', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1'));
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  h.walkTo(h.socket('lighthouse'), 0.5);
  h.system.interact(h.system.prompt(h.player)!);
  h.tick(5);
  const save = h.system.serialize();
  for (const value of save.threads[0].points) assert.ok(Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, `${value} is not on the 0.01 grid`);

  const fresh = new Harness();
  fresh.system.restore(JSON.parse(JSON.stringify(save)));
  fresh.tick(5);
  assert.equal(fresh.connected.length, 0, 'restore never fires onConnected');
  assert.deepEqual(fresh.system.serialize(), save, 'round trip is lossless');
  assert.equal(fresh.system.carrying, null);
  assert.equal(fresh.system.connecting, null);
  // restored sockets are finished: no prompt at either end
  fresh.stand('generator'); fresh.tick(0.1);
  assert.equal(fresh.system.prompt(fresh.player), null);
  fresh.system.restore(null);
  assert.equal(fresh.system.serialize().threads.length, 0);
});

test('restore ignores malformed threads', () => {
  const h = new Harness();
  h.system.restore({ version: 1, threads: [
    { id: 'h1', points: [0, 0, 14] },
    { id: 'nope' as ConnectionId, points: [0, 0, 14, 1, 0, 14] },
    { id: 'h2', points: [0, 0, NaN, 1, 0, 14] },
    { id: 'w1', points: [0, 0, 14, 0.5, 0, 14, 1, 0, 14] },
  ] });
  assert.deepEqual(h.system.serialize().threads.map(thread => thread.id), ['w1']);
});

test('the spool runs dry: taut, empty remaining, and the tether holds the player back', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1'));
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  assert.equal(h.system.movementScale(h.player, new Vector3(1, 0, 0)), 1, 'free while the spool has thread');
  // Walk in a big circle away from everything until the spool is empty.
  const tangent = new Vector3(0, 1, 0).cross(h.player).normalize();
  let guard = 0;
  while (!h.system.taut && guard++ < 60 * 40) {
    h.player.addScaledVector(tangent, 3 / 60).setLength(GROUND);
    tangent.copy(new Vector3(0, 1, 0).cross(h.player).normalize());
    h.tick(1 / 60);
  }
  assert.equal(h.system.taut, true);
  assert.equal(h.system.remaining, 0);
  assert.ok(h.system.laidDistance <= THREAD_CAPACITY + 1e-3, `laid ${h.system.laidDistance}`);
  // Keep walking: further away from the last laid point is held, coming back is free.
  for (let i = 0; i < 60 * 3; i++) { h.player.addScaledVector(tangent, 0.5 / 60).setLength(GROUND); h.tick(1 / 60); }
  assert.ok(h.system.movementScale(h.player, tangent) < 0.05, `away scale ${h.system.movementScale(h.player, tangent)}`);
  assert.equal(h.system.movementScale(h.player, tangent.clone().negate()), 1);
  const side = new Vector3().crossVectors(h.player, tangent).normalize();
  assert.equal(h.system.movementScale(h.player, side), 1);
  // Laying stops: the thread length never exceeds the spool.
  const before = h.system.laidDistance;
  h.tick(1);
  assert.equal(h.system.laidDistance, before);
});

test('thread is only laid while grounded', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1'));
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  h.tick(0.1);
  const laidBefore = h.system.laidDistance;
  // Fly away from the pickup point without touching the ground.
  for (let i = 0; i < 60; i++) { h.player.x += 0.02; h.player.setLength(GROUND + 1.2); h.tick(1 / 60, false); }
  assert.equal(h.system.laidDistance, laidBefore, 'no thread recorded while airborne');
  h.player.setLength(GROUND);
  h.tick(0.1, true);
  assert.ok(h.system.laidDistance > laidBefore, 'laying resumes on landing');
});

test('reel returns the spool and frees the source after the animation', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1'));
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  h.walkTo(h.socket('lighthouse'), 3);
  assert.ok(h.system.remaining < 1);
  h.system.reel();
  assert.equal(h.system.carrying, null);
  assert.equal(h.system.remaining, 1);
  assert.equal(h.system.taut, false);
  h.stand('generator'); h.tick(0.1);
  assert.notEqual(h.system.prompt(h.player)?.kind, 'pickup', 'the thread is still zipping back');
  h.tick(1.2);
  assert.equal(h.system.prompt(h.player)?.kind, 'pickup', 'source is free again once the reel finishes');
  assert.equal(h.connected.length, 0);
  h.system.reel(); // reeling with nothing in hand is harmless
});

test('prompts: target is preferred while carrying, mismatch feedback, inactive otherwise', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1', 'w1'));
  // Not carrying: a target socket is inactive, an unavailable source is inactive.
  h.stand('lighthouse'); h.tick(0.1);
  assert.equal(h.system.prompt(h.player)?.kind, 'inactive');
  h.stand('lighthouse_box'); h.tick(0.1);
  assert.equal(h.system.prompt(h.player)?.kind, 'inactive');
  // Carrying h1: the wrong socket is a mismatch, the right one a connect.
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  // The crane is far from the lighthouse, so only the wrong socket is in reach.
  h.stand('crane'); h.tick(0.1);
  const mismatch = h.system.prompt(h.player);
  assert.equal(mismatch?.kind, 'mismatch');
  assert.equal(h.system.interact(mismatch!), false);
  assert.equal(h.system.carrying, 'h1', 'a mismatch leaves the thread in hand');
  // Standing within reach of both a wrong socket and the target: the target wins even if farther.
  const wrong = h.socket('lighthouse_box').clone().normalize();
  const target = h.socket('lighthouse').clone().normalize();
  h.player.copy(wrong.clone().lerp(target, 0.5).setLength(GROUND));
  h.tick(0.05);
  const wrongDistance = h.player.distanceTo(h.socket('lighthouse_box'));
  const targetDistance = h.player.distanceTo(h.socket('lighthouse'));
  if (wrongDistance <= 1.35 && targetDistance <= 1.35) assert.equal(h.system.prompt(h.player)?.kind, 'connect');
  h.player.copy(target.clone().multiplyScalar(GROUND));
  h.tick(0.05);
  assert.equal(h.system.prompt(h.player)?.kind, 'connect');
  // Interacting with a stale pickup prompt while carrying does nothing.
  assert.equal(h.system.interact({ kind: 'pickup', socket: 'generator', connection: 'h1', position: h.socket('generator') }), false);
});

test('only available connections can be picked up', () => {
  const h = new Harness();
  h.system.setAvailable(available());
  h.stand('generator'); h.tick(0.1);
  assert.equal(h.system.prompt(h.player)?.kind, 'inactive');
  assert.equal(h.system.interact({ kind: 'pickup', socket: 'generator', connection: 'h1', position: h.socket('generator') }), false);
  assert.equal(h.system.carrying, null);
});

test('lights threads grow lanterns, root threads grow leaves, other kinds stay plain', () => {
  const byId = new Map(CONNECTIONS.map(connection => [connection.id, connection]));
  const straight = (from: SocketId, to: SocketId, length: number): number[] => {
    const a = new Vector3().copy(dir(SOCKET_HINTS[from].lat, SOCKET_HINTS[from].lon)).multiplyScalar(GROUND + 0.7);
    const b = new Vector3().copy(dir(SOCKET_HINTS[to].lat, SOCKET_HINTS[to].lon)).multiplyScalar(GROUND + 0.7);
    const points: number[] = [];
    const n = Math.max(2, Math.round(length / 0.5));
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n).setLength(GROUND + 0.05); points.push(p.x, p.y, p.z); }
    return points;
  };
  const h = new Harness();
  const o1 = byId.get('o1')!, fh = byId.get('fh')!, h1 = byId.get('h1')!;
  h.system.restore({ version: 1, threads: [{ id: 'o1', points: straight(o1.from, o1.to, 10) }] });
  const lanterns = meshByName(h, 'ThreadLanterns')!.count;
  assert.ok(lanterns >= 5 && lanterns <= 40, `lanterns ${lanterns}`);
  assert.equal(meshByName(h, 'ThreadLeaves')!.count, 0);
  h.system.restore({ version: 1, threads: [{ id: 'fh', points: straight(fh.from, fh.to, 10) }] });
  assert.equal(meshByName(h, 'ThreadLanterns')!.count, 0, 'restore replaces previous props');
  assert.ok(meshByName(h, 'ThreadLeaves')!.count >= 5);
  h.system.restore({ version: 1, threads: [{ id: 'h1', points: straight(h1.from, h1.to, 10) }] });
  assert.equal(meshByName(h, 'ThreadLanterns')!.count + meshByName(h, 'ThreadLeaves')!.count, 0);
  h.system.reset();
  assert.equal(h.system.serialize().threads.length, 0);
});

test('reset during the pulse cancels it; the source cannot be re-picked while the pulse travels', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1'));
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  h.walkTo(h.socket('lighthouse'), 0.5);
  h.system.interact(h.system.prompt(h.player)!);
  h.tick(0.5);
  h.stand('generator'); h.tick(0.05);
  assert.notEqual(h.system.prompt(h.player)?.kind, 'pickup', 'h1 is mid-pulse');
  assert.equal(h.system.interact({ kind: 'pickup', socket: 'generator', connection: 'h1', position: h.socket('generator') }), false);
  h.system.reset();
  h.tick(5);
  assert.equal(h.connected.length, 0, 'a reset pulse never fires onConnected');
  assert.equal(h.system.connecting, null);
  assert.equal(h.system.serialize().threads.length, 0);
});

test('reeling mid-way, then laying again, works and the spool is full again', () => {
  const h = new Harness();
  h.system.setAvailable(available('h1'));
  h.stand('generator'); h.tick(0.1);
  h.system.interact(h.system.prompt(h.player)!);
  h.walkTo(h.socket('lighthouse'), 1.5);
  assert.ok(1 - h.system.remaining > 0.05, `used ${1 - h.system.remaining}`);
  h.system.reel();
  h.tick(1.2);
  h.stand('generator'); h.tick(0.1);
  assert.equal(h.system.interact(h.system.prompt(h.player)!), true);
  assert.equal(h.system.remaining, 1, 'a fresh spool after reeling');
  h.walkTo(h.socket('lighthouse'), 0.5);
  h.system.interact(h.system.prompt(h.player)!);
  h.tick(5);
  assert.equal(h.connected.length, 1);
});

test('draw calls stay small: one mesh per thread plus a handful of instanced meshes', () => {
  const h = new Harness();
  let meshes = 0;
  h.system.group.traverse(object => { if ((object as { isMesh?: boolean }).isMesh) meshes++; });
  assert.ok(meshes <= 15, `${meshes} meshes`);
});

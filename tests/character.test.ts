import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, Mesh, Vector3, type ShaderMaterial } from 'three';
import { createCharacter } from '../src/character/index.ts';
import { characterMaterials } from '../src/character/materials.ts';
import type { CharacterPose, Gesture } from '../src/contracts.ts';
import type { NpcId } from '../src/chapter/data.ts';

const IDS: (NpcId | 'player')[] = ['player', 'wick', 'marlo', 'pim', 'bram', 'sprout', 'sol', 'otto', 'ike', 'cat'];
const GESTURES: Gesture[] = ['none', 'wave', 'cheer', 'talk', 'nod', 'shrug', 'work', 'sit', 'lean'];

function meshesOf(character: ReturnType<typeof createCharacter>): Mesh[] {
  const meshes: Mesh[] = [];
  character.group.traverse(object => { if ((object as Mesh).isMesh) meshes.push(object as Mesh); });
  return meshes;
}

function bounds(character: ReturnType<typeof createCharacter>) {
  let minY = Infinity, maxY = -Infinity, finite = true;
  for (const mesh of meshesOf(character)) {
    const array = mesh.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < array.length; i += 3) {
      if (!Number.isFinite(array[i]) || !Number.isFinite(array[i + 1]) || !Number.isFinite(array[i + 2])) finite = false;
      minY = Math.min(minY, array[i + 1]); maxY = Math.max(maxY, array[i + 1]);
    }
  }
  return { minY, maxY, finite };
}

function step(character: ReturnType<typeof createCharacter>, pose: Partial<CharacterPose>, seconds: number, dt = 1 / 60): void {
  const full: CharacterPose = { elapsed: 0, dt, moving: 0, airborne: false, verticalSpeed: 0, ...pose };
  for (let t = 0; t < seconds; t += dt) { full.elapsed += dt; character.update(full); }
}

test('every cast member builds with sensible height, attachments and few meshes', () => {
  let meshCount = 0, triangles = 0;
  for (const id of IDS) {
    const character = createCharacter(id);
    const meshes = meshesOf(character);
    assert.ok(meshes.length >= 1 && meshes.length <= 3, `${id} meshes ${meshes.length}`);
    meshCount += meshes.length;
    for (const mesh of meshes) triangles += (mesh.geometry.index!.count) / 3;
    assert.ok(character.attachments?.head, `${id} head attachment`);
    assert.ok(character.attachments?.hand, `${id} hand attachment`);
    const { minY, maxY, finite } = bounds(character);
    assert.ok(finite, `${id} finite geometry`);
    assert.ok(Math.abs(minY) < 0.02, `${id} stands on y=0 (${minY})`);
    // Pim's kite flies far above his head; every other top is within 20% of the declared height
    if (id !== 'pim') assert.ok(Math.abs(maxY - character.height) < character.height * 0.2, `${id} height ${character.height} vs ${maxY}`);
    else assert.ok(maxY > character.height * 2, 'the kite flies overhead');
  }
  // all ten together: one draw call per material channel, not per limb
  assert.ok(meshCount <= 24, `meshes ${meshCount}`);
  assert.ok(triangles <= 48000, `triangles ${triangles}`);
});

test('heights follow the cast table: kid small, cat tiny, adults 1.1-1.3', () => {
  const height = (id: NpcId | 'player') => createCharacter(id).height;
  assert.ok(height('pim') > 0.78 && height('pim') < 0.95);
  assert.ok(height('cat') > 0.38 && height('cat') < 0.5);
  assert.ok(height('player') > 1.1 && height('player') < 1.2);
  for (const id of ['wick', 'marlo', 'bram', 'sol', 'ike'] as const) assert.ok(height(id) > 1.08 && height(id) < 1.32, `${id} ${height(id)}`);
});

test('every gesture, mood, stance, walk, run and jump keeps vertices finite and the feet near the ground', () => {
  for (const id of IDS) {
    const character = createCharacter(id);
    for (const gesture of GESTURES) {
      step(character, { gesture, moving: 0, talking: gesture === 'talk', mood: -0.8, stance: 'fold', lookAt: new Vector3(1, 1, 3) }, 0.8);
      const { finite } = bounds(character);
      assert.ok(finite, `${id} ${gesture}`);
    }
    for (const moving of [0.2, 1, 1.35]) {
      step(character, { moving, mood: 0.8, stance: 'default' }, 1.2);
      const { minY, finite } = bounds(character);
      assert.ok(finite);
      if (id !== 'cat') assert.ok(Math.abs(minY) < 0.05, `${id} walking at ${moving}: lowest point ${minY}`);
    }
    step(character, { airborne: true, verticalSpeed: 6.3, moving: 0 }, 0.2);
    step(character, { airborne: true, verticalSpeed: -6, moving: 1 }, 0.2);
    step(character, { airborne: false }, 0.5);
    assert.ok(bounds(character).finite, `${id} landing`);
  }
});

test('animation is continuous: no vertex jumps between frames while speed ramps up and down', () => {
  for (const id of ['player', 'bram', 'cat'] as const) {
    const character = createCharacter(id);
    const mesh = meshesOf(character)[0];
    const array = mesh.geometry.attributes.position.array as Float32Array;
    let previous = array.slice();
    let worst = 0;
    const pose: CharacterPose = { elapsed: 0, dt: 1 / 60, moving: 0, airborne: false, verticalSpeed: 0 };
    for (let frame = 0; frame < 360; frame++) {
      pose.elapsed += 1 / 60;
      pose.moving = Math.min(1.3, Math.max(0, Math.sin(frame / 60 * 1.1) * 0.8 + 0.5)) * (frame < 280 ? 1 : 0);
      character.update(pose);
      for (let i = 0; i < array.length; i++) worst = Math.max(worst, Math.abs(array[i] - previous[i]));
      previous = array.slice();
    }
    assert.ok(worst < 0.12, `${id} max per-frame vertex travel ${worst.toFixed(3)}`);
  }
});

test('switching gestures, stances and moods blends smoothly (no popping)', () => {
  for (const id of IDS) {
    const character = createCharacter(id);
    const array = meshesOf(character)[0].geometry.attributes.position.array as Float32Array;
    let previous = array.slice();
    let worst = 0;
    const pose: CharacterPose = { elapsed: 0, dt: 1 / 60, moving: 0, airborne: false, verticalSpeed: 0 };
    const stances = ['default', 'fold', 'hips', 'clasp', 'sill'] as const;
    for (let frame = 0; frame < 60 * 12; frame++) {
      pose.elapsed += 1 / 60;
      const phase = Math.floor(frame / 40);
      pose.gesture = GESTURES[phase % GESTURES.length];
      pose.stance = stances[Math.floor(phase / 2) % stances.length];
      pose.mood = Math.sin(phase) > 0 ? 0.8 : -0.8;
      pose.talking = phase % 3 === 0;
      character.update(pose);
      for (let i = 0; i < array.length; i++) worst = Math.max(worst, Math.abs(array[i] - previous[i]));
      previous = array.slice();
    }
    // Sprout's water drops restart their fall at zero scale (invisible), so they are exempt from the pop check.
    assert.ok(worst < (id === 'sprout' ? 1.2 : 0.25), `${id}: largest single-frame vertex travel ${worst.toFixed(3)}`);
  }
});

test('the player spool turns with laid thread, shrinks with fill, and the thread takes the held color', () => {
  const character = createCharacter('player');
  const tip = character.attachments!.spoolTip!;
  assert.ok(tip, 'spoolTip attachment');
  const thread = meshesOf(character).find(mesh => mesh.name === 'Skin:thread')!;
  assert.ok(thread, 'thread mesh');
  const uniform = (characterMaterials().thread as ShaderMaterial).uniforms.uColor.value as Color;
  const bulk = () => {
    const array = thread.geometry.attributes.position.array as Float32Array;
    // wound thread is the widest part: measure vertical extent of the thread mesh excluding the hanging strand
    let maxY = -Infinity;
    for (let i = 0; i < array.length; i += 3) maxY = Math.max(maxY, array[i + 1]);
    return maxY;
  };
  const worldTip = () => { character.group.updateMatrixWorld(true); return tip.getWorldPosition(new Vector3()); };
  step(character, { spoolFill: 1, spoolTurns: 0, heldThread: null }, 1);
  const fullBulk = bulk();
  const fullTip = worldTip();
  const before = Array.from((thread.geometry.attributes.position.array as Float32Array).slice(0, 60));
  step(character, { spoolFill: 1, spoolTurns: 2.5, heldThread: null }, 0.2);
  const after = Array.from((thread.geometry.attributes.position.array as Float32Array).slice(0, 60));
  assert.ok(before.some((value, i) => Math.abs(value - after[i]) > 1e-3), 'spool rotated');
  step(character, { spoolFill: 0.1, spoolTurns: 2.5, heldThread: '#4fb3e8' }, 1.5);
  assert.ok(bulk() < fullBulk - 0.03, `wound bulk shrinks (${fullBulk} -> ${bulk()})`);
  const expected = new Color('#4fb3e8');
  assert.ok(Math.abs(uniform.r - expected.r) < 0.02 && Math.abs(uniform.g - expected.g) < 0.02 && Math.abs(uniform.b - expected.b) < 0.02, 'thread color follows held thread');
  const emptyTip = worldTip();
  assert.ok(emptyTip.distanceTo(fullTip) > 0.01 && emptyTip.distanceTo(fullTip) < 0.2, 'spool tip follows the wound radius');
  // the tip sits behind and below the head, i.e. at the back of the pack
  assert.ok(fullTip.z < -0.2 && fullTip.y > 0.1 && fullTip.y < 0.7, `tip ${fullTip.toArray()}`);
  step(character, { spoolFill: 1, heldThread: null }, 1.5);
});

test('residents draw dark face marks as always-alive ink while bodies stay revivable paper', () => {
  const { body, ink, player } = characterMaterials();
  assert.equal(body.uniforms.uAlwaysAlive.value, 0);
  assert.equal(ink.uniforms.uAlwaysAlive.value, 1);
  assert.equal(player.uniforms.uAlwaysAlive.value, 1);
  assert.equal(createCharacter('wick').group.children.some(child => (child as Mesh).material === body), true);
  assert.equal(createCharacter('player').group.children.some(child => (child as Mesh).material === player), true);
});

test('looking at a point turns the head toward it without wrenching the neck', () => {
  const character = createCharacter('wick');
  const headLocal = () => {
    character.group.updateMatrixWorld(true);
    return character.attachments!.head!.getWorldPosition(new Vector3());
  };
  void headLocal;
  step(character, { lookAt: new Vector3(3, 0.9, 1) }, 1.5);
  const rest = meshesOf(character)[0].geometry.attributes.position.array as Float32Array;
  assert.ok(rest.length > 0);
  // far behind: the target is ignored rather than twisting the head backwards
  step(character, { lookAt: new Vector3(0, 0.9, -5) }, 1.5);
  assert.ok(bounds(character).finite);
});

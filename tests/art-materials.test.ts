import assert from 'node:assert/strict';
import test from 'node:test';
import { OneFactor, Vector3, ZeroFactor, type ShaderMaterial } from 'three';
import { createToonMaterial, PALETTE, toonShared } from '../src/art/toon.ts';
import { createWaterMaterial } from '../src/art/water.ts';
import { createPlanetSky } from '../src/sky.ts';
import { overlayBlending } from '../src/art/blend.ts';

/** Names declared as uniforms in the GLSL we author (not in three's own chunks). */
function declaredUniforms(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/^\s*uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+([^;]+);/gm)) {
    for (const declaration of match[2].split(',')) names.push(declaration.trim().replace(/\[.*$/, ''));
  }
  return names;
}

function balanced(source: string): boolean {
  let braces = 0, parens = 0;
  for (const character of source) {
    if (character === '{') braces++;
    if (character === '}') braces--;
    if (character === '(') parens++;
    if (character === ')') parens--;
    if (braces < 0 || parens < 0) return false;
  }
  return braces === 0 && parens === 0;
}

const BUILT_IN = new Set(['cameraPosition', 'viewMatrix', 'modelMatrix', 'projectionMatrix', 'modelViewMatrix', 'normalMatrix']);

function checkMaterial(material: ShaderMaterial): void {
  for (const [stage, source] of [['vertex', material.vertexShader], ['fragment', material.fragmentShader]] as const) {
    assert.ok(balanced(source), `${material.name} ${stage} shader has balanced braces and parentheses`);
    assert.match(source, /void main\s*\(\s*\)/, `${material.name} ${stage} has a main`);
    for (const name of declaredUniforms(source)) {
      if (BUILT_IN.has(name)) continue;
      assert.ok(name in material.uniforms, `${material.name} ${stage} declares ${name} but nothing supplies it`);
    }
  }
}

test('toon material keeps its option API and supplies every uniform its shader reads', () => {
  const material = createToonMaterial({ color: '#ff0000', alwaysAlive: true, emissive: 0.4, vertexColors: true, sway: true, name: 'Test', hatch: 0.5 });
  checkMaterial(material);
  assert.equal(material.name, 'Test');
  assert.equal(material.uniforms.uAlwaysAlive.value, 1);
  assert.equal(material.uniforms.uEmissive.value, 0.4);
  assert.equal(material.uniforms.uHatch.value, 0.5);
  assert.equal(material.defines?.USE_SWAY, '');
  assert.equal(material.userData.planetShadowReceiver, true);
  const plain = createToonMaterial();
  assert.equal(plain.uniforms.uAlwaysAlive.value, 0);
  assert.equal(plain.uniforms.uHatch.value, 1);
  // all instances share the sun, palette and dusk by reference
  assert.equal(plain.uniforms.uLightPosition, toonShared.uLightPosition);
  assert.equal(plain.uniforms.uDusk, toonShared.uDusk);
  assert.equal(PALETTE.ink, '#2a2c3a');
});

test('toon shader carries the paper hatching and the revived shading stages', () => {
  const { fragmentShader } = createToonMaterial();
  for (const needle of ['pencilFamily', 'sketchColor', 'revivalDetail', 'uShadowTint', 'halfLight', 'uDusk']) {
    assert.ok(fragmentShader.includes(needle), needle);
  }
});

test('water material keeps the scene-depth contract the ink renderer relies on', () => {
  const material = createWaterMaterial();
  checkMaterial(material);
  for (const name of ['tSceneDepth', 'uUseSceneDepth', 'uResolution', 'uCameraNear', 'uCameraFar']) {
    assert.ok(name in material.uniforms, name);
  }
  assert.equal(material.uniforms.uUseSceneDepth.value, 0);
  assert.equal(material.transparent, false);
  assert.match(material.name, /Water/);
});

test('sky keeps its API, always draws, and eases between title backdrop and gameplay', () => {
  const sky = createPlanetSky();
  assert.deepEqual(Object.keys(sky).sort(), ['mesh', 'reset', 'setDusk', 'update']);
  checkMaterial(sky.mesh.material as ShaderMaterial);
  const children = sky.mesh.children as unknown as { name: string; material: ShaderMaterial; userData: Record<string, unknown> }[];
  assert.deepEqual(children.map(child => child.name).sort(), ['UnspoolSkyBodies', 'UnspoolTitleOrbit']);
  for (const child of children) {
    checkMaterial(child.material);
    assert.equal(child.userData.ignoreDepthPrepass, true, 'overlays stay out of the water depth prepass');
    assert.equal(child.material.transparent, true);
  }
  const uniforms = (sky.mesh.material as ShaderMaterial).uniforms;
  assert.equal(sky.mesh.userData.noOutline, true);
  sky.update(0.1);
  assert.equal(uniforms.uTitle.value, 1);
  const normal = new Vector3(0, 1, 0), forward = new Vector3(0, 0, -1);
  sky.reset(normal, forward);
  for (let t = 0.2; t < 5; t += 0.1) sky.update(t, normal, forward);
  assert.equal(uniforms.uTitle.value, 0);
  assert.ok(Math.abs(uniforms.uUp.value.y - 1) < 1e-9);
  // moving to the opposite side of the planet keeps the frame orthonormal
  const south = new Vector3(0, -1, 0);
  for (let step = 0; step <= 20; step++) {
    const next = new Vector3(Math.sin(step / 20 * Math.PI), Math.cos(step / 20 * Math.PI), 0);
    sky.update(5 + step * 0.1, next, new Vector3(0, 0, -1));
  }
  const east = uniforms.uEast.value as Vector3, north = uniforms.uNorth.value as Vector3, up = uniforms.uUp.value as Vector3;
  assert.ok(Math.abs(east.length() - 1) < 1e-6 && Math.abs(north.length() - 1) < 1e-6);
  assert.ok(Math.abs(east.dot(north)) < 1e-6 && Math.abs(east.dot(up)) < 1e-6);
  assert.ok(up.distanceTo(south) < 1e-6);
  sky.setDusk(0.4);
  assert.equal(toonShared.uDusk.value, 0.4);
  sky.setDusk(5);
  assert.equal(toonShared.uDusk.value, 1);
  sky.setDusk(0);
  sky.update(99);
  assert.equal(uniforms.uTitle.value > 0, true, 'back to the title backdrop');
});

test('overlay blending leaves the destination alpha (the ink surface id) untouched', () => {
  const material = createToonMaterial();
  overlayBlending(material);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.blendSrcAlpha, ZeroFactor);
  assert.equal(material.blendDstAlpha, OneFactor);
});

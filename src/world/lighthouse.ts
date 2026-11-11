import {
  AdditiveBlending, ConeGeometry, DoubleSide, Group, Mesh, ShaderMaterial, Vector3,
} from 'three';
import { glowLevel, level } from './activation';
import { Kit, frameRoot, type Ctx } from './context';
import type { Frame } from './frame';
import { socketWall } from './fixtures';
import { house } from './buildings';
import { GLOW } from './materials';
import { C } from './palette';
import { shade } from './kit';
import { rockCluster } from './foliage';
import { barrel, crate, bench, lampPost } from './props';
import { sub } from './layout';
import { addHalo } from './halos';

/** The striped lighthouse on the cape. Frame: origin at the tower center on
 * the ground, +Z toward the door. */

const R0 = 0.66, R1 = 0.45, Y0 = 0.25, Y1 = 3.65;
const radiusAt = (y: number) => R0 + (R1 - R0) * (y - Y0) / (Y1 - Y0);
const APOTHEM = Math.cos(Math.PI / 8);

export function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'LighthouseBeam',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uLevel: { value: 0 }, uColor: { value: new Vector3(1, 0.9, 0.55) } },
    userData: { noOutline: true },
    vertexShader: /* glsl */ `
      varying float vT;
      varying vec3 vN;
      void main() {
        vT = clamp(position.z / ${(8).toFixed(1)}, 0.0, 1.0);
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLevel;
      uniform vec3 uColor;
      varying float vT;
      varying vec3 vN;
      void main() {
        float facing = abs(vN.z);
        float a = uLevel * 0.42 * (1.0 - vT * 0.85) * smoothstep(0.0, 0.8, facing);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

export function buildLighthouse(ctx: Ctx, frame: Frame): { top: Vector3 } {
  const { b } = ctx;
  const k = b.kit(frame);
  ground(k);
  // stone platform
  k.s.cyl(1.05, 0.22, 0, -0.1, 0, C.stone, { seg: 8, rTop: 0.95, rot: [0, Math.PI / 8, 0] });
  k.s.cyl(0.98, 0.05, 0, 0.12, 0, C.stoneDark, { seg: 8, rot: [0, Math.PI / 8, 0], jitter: 0 });
  // tower stripes
  const stripes = 4;
  for (let i = 0; i < stripes; i++) {
    const ya = Y0 + (Y1 - Y0) * i / stripes, yb = Y0 + (Y1 - Y0) * (i + 1) / stripes;
    k.s.cyl(radiusAt(ya), yb - ya + 0.01, 0, ya, 0, i % 2 ? C.red : C.white, { seg: 8, rTop: radiusAt(yb), rot: [0, Math.PI / 8, 0], jitter: 0.015 });
  }
  // door
  const dz = radiusAt(Y0 + 0.5) * APOTHEM;
  k.s.box(0.66, 1.18, 0.1, 0, Y0 + 0.59, dz + 0.0, C.stone, { jitter: 0.02 });
  k.d.box(0.48, 1.0, 0.07, 0, Y0 + 0.5, dz + 0.06, C.woodDark, { jitter: 0 });
  k.d.box(0.34, 0.36, 0.03, 0, Y0 + 0.78, dz + 0.1, shade(C.woodDark, 0.12), { jitter: 0 });
  k.d.box(0.34, 0.3, 0.03, 0, Y0 + 0.36, dz + 0.1, shade(C.woodDark, 0.12), { jitter: 0 });
  k.d.ball(0.035, 0.16, Y0 + 0.5, dz + 0.11, C.brass, { detail: 0, jitter: 0 });
  k.s.box(0.8, 0.07, 0.4, 0, Y0 + 0.03, dz + 0.2, C.stoneDark, { jitter: 0.03 });
  k.s.box(0.62, 0.07, 0.3, 0, Y0 - 0.02, dz + 0.5, C.stone, { jitter: 0.03 });
  // little windows on the other faces, stairs-wise
  for (const [yaw, y] of [[Math.PI * 0.5, 1.3], [Math.PI, 1.9], [-Math.PI * 0.5, 2.45], [Math.PI * 0.75, 3.0], [-Math.PI * 0.75, 1.2], [Math.PI * 0.25, 2.2]] as const) {
    const w = k.at(0, 0, 0, yaw);
    const wz = radiusAt(y) * APOTHEM;
    w.d.box(0.16, 0.34, 0.06, 0, y, wz + 0.01, C.glass, { glow: GLOW.none, jitter: 0 });
    w.s.box(0.24, 0.06, 0.08, 0, y + 0.2, wz, C.stoneDark, { jitter: 0 });
    w.s.box(0.24, 0.05, 0.1, 0, y - 0.2, wz, C.stoneDark, { jitter: 0 });
  }
  // gallery
  const gy = Y1;
  k.s.cyl(0.78, 0.09, 0, gy - 0.04, 0, C.iron, { seg: 8, rot: [0, Math.PI / 8, 0], rTop: 0.7 });
  k.s.cyl(0.58, 0.05, 0, gy - 0.08, 0, C.coal, { seg: 8, jitter: 0 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    k.s.rod(Math.sin(a) * 0.72, gy + 0.05, Math.cos(a) * 0.72, Math.sin(a) * 0.72, gy + 0.42, Math.cos(a) * 0.72, 0.022, C.iron, { seg: 4, jitter: 0 });
    const b2 = (i + 1) / 8 * Math.PI * 2;
    k.s.rod(Math.sin(a) * 0.72, gy + 0.42, Math.cos(a) * 0.72, Math.sin(b2) * 0.72, gy + 0.42, Math.cos(b2) * 0.72, 0.02, C.iron, { seg: 4, jitter: 0 });
    k.s.rod(Math.sin(a) * 0.72, gy + 0.22, Math.cos(a) * 0.72, Math.sin(b2) * 0.72, gy + 0.22, Math.cos(b2) * 0.72, 0.014, C.iron, { seg: 4, jitter: 0 });
  }
  // lantern room
  const ly = gy + 0.05;
  k.d.cyl(0.3, 0.58, 0, ly, 0, C.glass, { seg: 8, rTop: 0.27, glow: GLOW.lighthouse, jitter: 0 });
  k.d.ball(0.13, 0, ly + 0.28, 0, C.glassWarm, { glow: GLOW.lighthouse, detail: 1, jitter: 0 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    k.s.box(0.045, 0.62, 0.045, Math.sin(a) * 0.3, ly + 0.3, Math.cos(a) * 0.3, C.iron, { jitter: 0 });
  }
  k.s.cyl(0.36, 0.06, 0, ly - 0.02, 0, C.iron, { seg: 8, jitter: 0 });
  k.s.cyl(0.36, 0.05, 0, ly + 0.56, 0, C.iron, { seg: 8, jitter: 0 });
  k.s.cone(0.46, 0.5, 0, ly + 0.6, 0, C.red, { seg: 8, jitter: 0.02 });
  k.s.ball(0.06, 0, ly + 1.12, 0, C.brass, { detail: 0 });
  k.s.rod(0, ly + 1.15, 0, 0, ly + 1.4, 0, 0.012, C.iron, { seg: 3 });
  k.c.cyl(0.7, 3.6, 0, -0.1, 0, undefined, { seg: 8 });
  k.c.cyl(1.06, 0.27, 0, -0.1, 0, undefined, { seg: 8 });

  // keeper's cottage beside the tower
  const hutFrame = sub(frame, -1.9, -0.3, -0.5);
  const hutKit = b.kit(hutFrame);
  house(hutKit, {
    w: 1.4, d: 1.1, floors: [1.5], wall: C.wallCream, roofColor: C.roofTerracotta, roof: 'gable', ridge: 'x', rise: 0.55,
    front: [['w', 'd']], sides: [1], back: [1], chimney: { x: -0.35, z: 0 }, shutters: C.roofTeal, flowerBoxes: false,
  });
  // yard clutter
  rockCluster(b.kit(sub(frame, 1.1, -1.5)), b.random, 4, 0.8, 0.4);
  lampPost(b.kit(sub(frame, 0.9, 1.5)), 1.7, GLOW.finale);

  // socket fixtures: door side (north) and the electric box facing the dock
  const doorFace = k.at(0, 0, 0, -Math.PI / 4).at(0, 0, radiusAt(0.8) * APOTHEM - 0.03);
  socketWall(b, 'lighthouse', doorFace, 0.75);
  const boxFace = k.at(0, 0, 0, Math.PI / 4).at(0, 0, radiusAt(0.8) * APOTHEM - 0.03);
  socketWall(b, 'lighthouse_box', boxFace, 0.75, { body: C.roofTeal, w: 0.32, h: 0.36 });
  boxFace.s.box(0.4, 0.46, 0.06, 0, 0.75, 0.0, C.coal, { jitter: 0 });

  // ---- activation: lamp glow + rotating beam
  const root = frameRoot(ctx, frame);
  const pivot = new Group();
  pivot.position.set(0, ly + 0.3, 0);
  root.add(pivot);
  const material = beamMaterial();
  const geometry = new ConeGeometry(1.5, 8, 14, 1, true);
  geometry.translate(0, -4, 0).rotateX(-Math.PI / 2);
  const beam = new Mesh(geometry, material);
  const beam2 = new Mesh(geometry, material);
  beam2.rotation.y = Math.PI;
  beam.name = beam2.name = 'LighthouseBeam';
  beam.frustumCulled = beam2.frustumCulled = false;
  pivot.add(beam, beam2);
  pivot.visible = false;
  const lamp = glowLevel(ctx, GLOW.lighthouse, [1.2, 1.05, 0.6], 1.15, 0.8);
  const beamLevel = level(ctx, v => { material.uniforms.uLevel.value = v; pivot.visible = v > 0.01; }, 0.6);
  let angle = 0;
  b.onUpdate((_t, dt) => { if (pivot.visible) { angle += dt * 0.9; pivot.rotation.y = angle; } });
  b.onActivate('h1', instant => { lamp.set(1, instant); beamLevel.set(1, instant); });
  const topWorld = k.p(0, ly + 0.3, 0);
  addHalo(topWorld, 2.4, GLOW.lighthouse);
  return { top: topWorld };
}

function ground(_k: Kit): void { /* terrain is already shaped around the cape */ }

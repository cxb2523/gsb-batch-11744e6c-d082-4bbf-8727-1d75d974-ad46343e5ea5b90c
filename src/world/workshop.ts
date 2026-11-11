import { Mesh, Vector3 } from 'three';
import { glowLevel, level, WARM } from './activation';
import { house } from './buildings';
import { Part, frameRoot, type Ctx, Kit } from './context';
import { socketPost } from './fixtures';
import { makeFrame, DEG, type Frame } from './frame';
import { bush, flowerPatch, grassTuft, pineTree, roundTree, rock, rockCluster } from './foliage';
import { dirtColor } from './ground';
import { shade } from './kit';
import { offsetFrom, smoothLine, sampleLine, sub, groundAt } from './layout';
import { GLOW } from './materials';
import { C } from './palette';
import { picto } from './pictos';
import { barrel, bench, bucket, crate, fence, lampPost, planter, sack, sign_post, stoneWall, table } from './props';
import { Puffs } from './puffs';
import { scatterDisc } from './scatter';
import { buildTerraces } from './terraces';
import { terrainHeight } from './terrain';
import { createFlowMaterial, FlowGeometry } from './waterFlow';
import { anchorFrom } from './anchors';
import { PLANET_RADIUS } from '../chapter/data';

/** Workshop district: a hill with a stone spring on top, a mill-race that
 * runs down to a waterwheel beside the workshop, a sluice and tail race, and
 * flower terraces to the south-east. Positions are east/north units from
 * lat 18, lon 112. */

export const W = (e: number, n: number): Vector3 => offsetFrom(18, 112, e, n);
const frameAt = (ctx: Ctx, e: number, n: number, bearing = 0, lift = 0): Frame => ctx.b.placeAt(W(e, n), bearing * DEG, lift);
const kitAt = (ctx: Ctx, e: number, n: number, bearing = 0): Kit => ctx.b.kit(frameAt(ctx, e, n, bearing));

export function buildWorkshop(ctx: Ctx): void {
  const flow = new FlowGeometry();
  const { b } = ctx;

  workshopBuilding(ctx);
  const wheelInfo = waterwheel(ctx);
  stream(ctx, flow);
  tailRace(ctx, flow);
  spring(ctx);
  const terrace = buildTerraces(ctx, frameAt(ctx, 6.6, -4.9, 135));
  terrace.flow(flow, flow.length[1] + 0.05);
  yardProps(ctx);
  extras(ctx);
  workshopPaths(ctx);
  vegetation(ctx);

  // water mesh
  const material = createFlowMaterial();
  const geometry = flow.build();
  const water = new Mesh(geometry, material);
  water.name = 'FlowWater';
  water.frustumCulled = false;
  ctx.group.add(water);
  material.uniforms.uLen.value.set(flow.length[0], flow.length[1]);
  const streamFill = level(ctx, v => { material.uniforms.uFill.value.x = v; }, 0.16);
  const tailFill = level(ctx, v => { material.uniforms.uFill.value.y = v; }, 0.15);

  // activation: w1 stream, wheel, smoke, forge; w2 sluice, tail race, flowers (terraces), hub
  const smoke = new Puffs(ctx, smokeOrigin, { count: 7, radius: 0.16, rise: 1.4, speed: 0.26, drift: 0.35, color: '#efe9de' });
  const forge = glowLevel(ctx, GLOW.forge, [1.2, 0.55, 0.2], 1, 0.8);
  const windows = glowLevel(ctx, GLOW.workshopWindows, [1.1, 0.82, 0.42], 0.9, 0.8);
  b.onActivate('w1', instant => {
    streamFill.set(1, instant);
    wheelInfo.spin.set(1, instant);
    smoke.set(true, instant);
    forge.set(1, instant);
    windows.set(1, instant);
  });
  b.onActivate('w2', instant => { tailFill.set(1, instant); });
  b.onFinale(a => windows.set(Math.max(windows.target, a * 0.9)));
}

let smokeOrigin = new Vector3();

function workshopBuilding(ctx: Ctx): void {
  const { b, ground } = ctx;
  const f = frameAt(ctx, -3.2, 0.2, 90);
  const k = b.kit(f);
  const info = house(k, {
    w: 2.6, d: 2.2, floors: [2.0], wall: '#cfdcc0', roofColor: C.roofTerracotta, roof: 'gable', ridge: 'x', rise: 0.8, overhang: 0.3,
    front: [['w', 'd']], sides: [1], back: [2], doorColor: C.roofTeal, shutters: C.roofTeal, glow: GLOW.workshopWindows, doorStep: true,
    chimney: { x: -0.75, z: -0.55, color: C.brick }, sign: { kind: 'cog', board: C.wallCream, a: C.iron, b: C.yellow, style: 'hang', x: 0 }, collide: true,
  });
  smokeOrigin = k.p(info.chimneyTop!.x, info.chimneyTop!.y + 0.1, info.chimneyTop!.z);
  // forge beside the door with a glowing mouth
  const forgeKit = k.at(1.95, 0, 0.35, 0);
  forgeKit.s.box(1.2, 1.2, 0.8, 0, 0.6, 0, C.stoneDark, { jitter: 0.03 });
  forgeKit.s.box(1.3, 0.1, 0.9, 0, 1.25, 0, C.stone, { jitter: 0.02 });
  forgeKit.d.box(0.5, 0.35, 0.05, 0, 0.62, 0.41, C.coal, { jitter: 0 });
  forgeKit.d.box(0.4, 0.22, 0.04, 0, 0.6, 0.43, C.orange, { glow: GLOW.forge, jitter: 0 });
  forgeKit.s.box(0.3, 1.4, 0.3, 0.0, 1.9, -0.2, C.brick, { jitter: 0.03 });
  forgeKit.c.box(1.2, 1.2, 0.8, 0, 0.6, 0);
  // anvil on a stump, bellows
  const anvil = k.at(1.95, 0, 1.6);
  anvil.s.cyl(0.2, 0.45, 0, 0, 0, C.trunk, { seg: 8, rTop: 0.18 });
  anvil.s.box(0.32, 0.12, 0.2, 0, 0.51, 0, C.coal, { jitter: 0 });
  anvil.s.box(0.18, 0.1, 0.16, 0.2, 0.52, 0, C.coal, { jitter: 0 });
  anvil.s.box(0.12, 0.22, 0.12, 0, 0.4, 0, C.coal, { jitter: 0 });
  anvil.c.cyl(0.22, 0.6, 0, 0, 0, undefined, { seg: 8 });
  ground.clear(f.origin, 2.4);
  // Bram stands in front of the door facing the yard
  b.npcs.bram = anchorFrom(W(-1.6, 0.72), W(0.5, 0.72), 0);
  // sign beside the door and a tool wall
  const front = k.at(0, 0, 1.1);
  front.s.box(0.06, 0.8, 0.06, 0.95, 0.9, 0.05, C.woodDark, { jitter: 0 });
  for (let i = 0; i < 3; i++) front.s.rod(0.95 - 0.1 + i * 0.1, 0.6, 0.12, 0.95 - 0.1 + i * 0.1, 1.05 - (i % 2) * 0.15, 0.12, 0.018, C.iron, { seg: 4 });
  picto(front.d, 'cog', -0.85, 1.25, 0.06, 0.36, C.iron, C.yellow);
  void front;
}

function waterwheel(ctx: Ctx): { spin: ReturnType<typeof level> } {
  const { b } = ctx;
  const f = frameAt(ctx, -3.2, -1.62, 270);
  const k = b.kit(f);
  // pillars, stone pit and axle bearings
  for (const sx of [-1, 1]) {
    k.s.block(sx * 0.42 - 0.12, -0.5, -0.3, sx * 0.42 + 0.12, 1.1, 0.3, C.stone, { jitter: 0.03 });
    k.s.box(0.14, 0.16, 0.2, sx * 0.42, 0.9, 0, C.coal, { jitter: 0 });
    k.c.block(sx * 0.42 - 0.12, -0.5, -0.3, sx * 0.42 + 0.12, 1.4, 0.3);
  }
  k.s.block(-0.55, -0.3, -0.95, 0.55, 0.05, 0.95, C.stoneDark, { jitter: 0.03 });
  const root = frameRoot(ctx, f);
  const wheel = new Part(ctx, root, f, new Vector3(0, 0.9, 0), 81);
  const w = wheel.kit;
  const R = 0.88, width = 0.5;
  const rim = 16;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < rim; i++) {
      const a0 = i / rim * Math.PI * 2, a1 = (i + 1) / rim * Math.PI * 2;
      w.s.rod(sx * width / 2, Math.sin(a0) * R, Math.cos(a0) * R, sx * width / 2, Math.sin(a1) * R, Math.cos(a1) * R, 0.04, C.woodDark, { seg: 4, jitter: 0.03 });
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      w.s.rod(sx * width / 2, 0, 0, sx * width / 2, Math.sin(a) * R, Math.cos(a) * R, 0.03, C.wood, { seg: 4, jitter: 0.03 });
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    // paddle boards between the rims, slightly tilted like buckets
    w.d.box(width, 0.2, 0.035, 0, Math.sin(a) * (R - 0.06), Math.cos(a) * (R - 0.06), C.plank, { rot: [Math.PI / 2 - a + 0.35, 0, 0], jitter: 0.03 });
  }
  w.s.cyl(0.07, width + 0.5, -(width + 0.5) / 2, 0, 0, C.coal, { seg: 6, rot: [0, 0, -Math.PI / 2], jitter: 0 });
  w.s.cyl(0.13, 0.3, -0.15, 0, 0, C.woodDark, { seg: 8, rot: [0, 0, -Math.PI / 2], jitter: 0 });
  wheel.mount();
  const spin = level(ctx, () => { /* eased */ }, 0.4);
  b.onUpdate((_t, dt) => { if (spin.value > 0) wheel.group.rotation.x += dt * 1.1 * spin.value; });
  // flume end post with the socket
  socketPost(b, 'waterwheel', b.kit(frameAt(ctx, -2.0, -1.8, 90)), { h: 0.74 });
  ctx.ground.clear(f.origin, 1.8);
  return { spin };
}

/** Wooden/stone channel following explicit bed radii (so the last part becomes an aqueduct). */
function channel(ctx: Ctx, line: Vector3[], radii: number[], width: number, trestle: boolean): void {
  const { b } = ctx;
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i].clone().multiplyScalar(radii[i]);
    const q = line[i + 1].clone().multiplyScalar(radii[i + 1]);
    const dr = radii[i + 1] - radii[i];
    const forward = q.clone().sub(p);
    const frame = makeFrame(p, forward);
    const len = Math.hypot(p.distanceTo(q), 0) * 1.0;
    const lift = radii[i] - terrainHeight(line[i]);
    const kk = b.kit(frame).at(0, 0, 0, 0, -Math.atan2(dr, Math.max(len, 1e-3)));
    const aqueduct = lift > 0.35;
    const bed = aqueduct ? C.plank : C.stone, side = aqueduct ? C.woodLight : C.stoneDark;
    kk.s.box(width + 0.18, 0.08, len * 1.18, 0, -0.04, len / 2, bed, { jitter: 0.03 });
    for (const sx of [-1, 1]) kk.s.box(0.08, 0.2, len * 1.18, sx * (width / 2 + 0.05), 0.07, len / 2, side, { jitter: 0.03 });
    if (aqueduct && trestle && i % 4 === 0) {
      const h = lift + 0.12;
      for (const sx of [-1, 1]) {
        kk.s.box(0.1, h, 0.1, sx * (width / 2 + 0.05), -h / 2 - 0.06, 0, C.woodDark, { jitter: 0.03 });
        kk.s.box(0.22, 0.08, 0.22, sx * (width / 2 + 0.05), -h - 0.04, 0, C.stoneDark, { jitter: 0.03 });
      }
      kk.s.box(width + 0.36, 0.08, 0.1, 0, -0.14, 0, C.woodDark, { jitter: 0.02 });
      if (h > 0.8) {
        kk.s.rod(-width / 2 - 0.05, -h * 0.9, 0.04, width / 2 + 0.05, -0.2, 0.04, 0.02, C.wood, { seg: 4 });
        kk.s.rod(width / 2 + 0.05, -h * 0.9, 0.04, -width / 2 - 0.05, -0.2, 0.04, 0.02, C.wood, { seg: 4 });
      }
      for (const sx of [-1, 1]) kk.c.box(0.14, h, 0.14, sx * (width / 2 + 0.05), -h / 2 - 0.06, 0);
    }
    if (lift > 0.3 && lift < 1.45) kk.c.box(width + 0.2, 0.28, len * 1.15, 0, -0.1, len / 2);
  }
}

function stream(ctx: Ctx, flow: FlowGeometry): void {
  const rel: [number, number][] = [[3.7, 4.75], [3.1, 3.95], [2.4, 3.15], [1.7, 2.4], [1.0, 1.6], [0.3, 0.85], [-0.5, 0.1], [-1.2, -0.6], [-1.9, -1.1], [-2.55, -1.4], [-3.05, -1.55]];
  const line = sampleLine(smoothLine(rel.map(([e, n]) => W(e, n)), 6), 0.2);
  const N = line.length - 1;
  const radii = line.map((d, i) => {
    const t = i / N;
    const bed = 14 + 1.98 - 0.15 * t;
    return Math.max(bed, terrainHeight(d) + 0.07);
  });
  channel(ctx, line, radii, 0.4, true);
  flow.stream(line, radii.map(r => r + 0.06), 0.4, 0, 0);
  ctx.ground.lines.push({ points: line, width: 0.8 });
}

function tailRace(ctx: Ctx, flow: FlowGeometry): void {
  const rel: [number, number][] = [[-3.2, -1.8], [-2.3, -2.1], [-1.3, -2.2], [-0.5, -2.2], [0.4, -2.6], [1.3, -3.0], [2.2, -3.4], [3.0, -3.8]];
  const line = sampleLine(smoothLine(rel.map(([e, n]) => W(e, n)), 6), 0.22);
  const radii = line.map(d => terrainHeight(d) + 0.05);
  channel(ctx, line, radii, 0.4, false);
  flow.stream(line, radii.map(r => r + 0.05), 0.4, 1, 0);
  ctx.ground.lines.push({ points: line, width: 0.8 });
  // sluice gate where the race passes under a plank bridge
  const f = frameAt(ctx, -0.55, -2.2, 90);
  const k = b(ctx).kit(f);
  for (const sx of [-1, 1]) {
    k.s.block(sx * 0.5 - 0.12, -0.2, -0.35, sx * 0.5 + 0.12, 0.85, 0.35, C.stone, { jitter: 0.03 });
    k.c.block(sx * 0.5 - 0.12, -0.2, -0.35, sx * 0.5 + 0.12, 0.85, 0.35);
  }
  for (let i = 0; i < 5; i++) k.s.box(1.4, 0.06, 0.16, 0, 0.9, -0.34 + i * 0.17, C.plank, { jitter: 0.03 });
  const root = frameRoot(ctx, f);
  const gate = new Part(ctx, root, f, new Vector3(0, 0.0, 0), 82);
  gate.kit.s.box(0.84, 0.62, 0.07, 0, 0.32, 0.0, C.woodLight, { jitter: 0.03 });
  for (let i = -1; i <= 1; i++) gate.kit.s.box(0.8, 0.04, 0.09, 0, 0.32 + i * 0.2, 0, C.woodDark, { jitter: 0 });
  gate.kit.s.rod(-0.25, 0.64, 0, -0.25, 1.15, 0, 0.025, C.iron, { seg: 4 });
  gate.kit.s.rod(0.25, 0.64, 0, 0.25, 1.15, 0, 0.025, C.iron, { seg: 4 });
  gate.kit.s.box(0.7, 0.05, 0.05, 0, 1.15, 0, C.iron, { jitter: 0 });
  gate.kit.s.cyl(0.16, 0.05, 0, 1.18, 0, C.coal, { seg: 10, jitter: 0 });
  gate.mount();
  const open = level(ctx, v => { gate.group.position.y = v * 0.8; }, 0.5);
  gate.group.position.y = 0.0;
  b(ctx).onActivate('w2', instant => open.set(1, instant));
  // socket on a post at the north bank, reachable from the bridge
  socketPost(b(ctx), 'sluice', b(ctx).kit(sub(f, 0.95, 0.0, Math.PI)), { h: 0.72 });
}
const b = (ctx: Ctx) => ctx.b;

function spring(ctx: Ctx): void {
  const f = frameAt(ctx, 3.85, 5.25, 215);
  const k = ctx.b.kit(f);
  const r = ctx.b.random;
  // pool ring of stones, water disc, boulder with a spout
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    k.s.ball(0.22, Math.cos(a) * 0.62, 0.14, Math.sin(a) * 0.62, i % 3 ? C.rock : shade(C.rock, 0.1), { detail: 0, scale: [1, 0.75, 1], rot: [0, a, 0], jitter: 0.04 });
  }
  k.s.cyl(0.58, 0.18, 0, 0, 0, C.stoneDark, { seg: 10, jitter: 0 });
  k.s.cyl(0.52, 0.03, 0, 0.2, 0, C.water, { seg: 10, jitter: 0 });
  rock(k.at(-0.1, 0, -0.9), r, 0.62, C.rock, true);
  k.s.cyl(0.05, 0.4, 0.0, 0.62, -0.62, '#c5805a', { seg: 6, rot: [0.9, 0, 0], jitter: 0 });
  k.s.ball(0.06, 0.0, 0.62, -0.52, '#c5805a', { detail: 0 });
  rockCluster(k.at(1.0, 0, -0.3), r, 5, 0.6, 0.3);
  rockCluster(k.at(-1.1, 0, 0.2), r, 4, 0.5, 0.26);
  flowerPatch(k.at(0.9, 0, 0.9), r, 8, 0.4, [C.white, C.blossom, C.violet]);
  flowerPatch(k.at(-0.9, 0, 0.8), r, 8, 0.4, [C.yellow, C.white]);
  // shrine lantern post and signpost
  lampPost(k.at(-1.25, 0, -0.5), 1.3, GLOW.finale, C.woodDark, C.glassWarm, true);
  sign_post(k.at(1.5, 0, 1.6, 0.6), 2);
  bench(k.at(-1.5, 0, 1.6, Math.PI * 0.8));
  k.c.cyl(0.62, 0.35, 0, 0, 0, undefined, { seg: 10 });
  ctx.ground.clear(f.origin, 1.9);
  socketPost(ctx.b, 'spring', ctx.b.kit(sub(f, 0.3, 1.9, 0)), { h: 0.72 });
}

function yardProps(ctx: Ctx): void {
  const { b } = ctx;
  const r = b.random;
  // hub post north of the yard
  const hubFrame = frameAt(ctx, 0.2, 1.55, 180);
  lampPost(b.kit(hubFrame), 2.0, GLOW.workshopHub, C.coal, C.lantern, false);
  b.kit(hubFrame).c.cyl(0.14, 2.0, 0, 0, 0, undefined, { seg: 6 });
  socketPost(b, 'hub_workshop', b.kit(sub(hubFrame, 0, 0.45, 0)), { h: 0.74 });
  const hub = glowLevel(ctx, GLOW.workshopHub, WARM, 1.1, 0.8);
  b.onActivate('w2', instant => hub.set(1, instant));
  // workbench, timber, cart, barrels
  const bench1 = kitAt(ctx, -1.2, 1.5, 90);
  table(bench1, 1.2, 0.5, 0.7, C.woodLight);
  bench1.s.box(0.24, 0.12, 0.16, 0.3, 0.8, 0, C.iron, { jitter: 0 });
  bench1.s.box(0.5, 0.025, 0.1, -0.25, 0.755, 0, C.ironLight, { jitter: 0 });
  bench1.c.box(1.2, 0.8, 0.5, 0, 0.4, 0);
  for (let i = 0; i < 5; i++) kitAt(ctx, -4.7, -1.1 + i * 0.0, 20).s.box(1.6, 0.14, 0.14, 0, 0.07 + Math.floor(i / 3) * 0.14, ((i % 3) - 1) * 0.15, i % 2 ? C.woodLight : C.plank, { jitter: 0.04 });
  const timber = kitAt(ctx, -2.2, 2.4, 100);
  for (let i = 0; i < 8; i++) timber.s.box(1.5, 0.14, 0.14, 0, 0.07 + Math.floor(i / 3) * 0.14, ((i % 3) - 1) * 0.15, i % 2 ? C.woodLight : C.plank, { jitter: 0.04 });
  timber.c.box(1.5, 0.5, 0.5, 0, 0.25, 0);
  barrel(kitAt(ctx, -0.9, -0.9), 0.6, 0.26, C.woodLight);
  crate(kitAt(ctx, 0.4, 0.2, 14), 0.5, C.plank);
  crate(kitAt(ctx, 0.52, 0.2, 40), 0.4, C.woodLight);
  sack(kitAt(ctx, -1.0, 2.1));
  bucket(kitAt(ctx, -0.5, -0.3));
  planter(kitAt(ctx, -1.9, 1.3), true, 0.2, 0.2, C.brick);
  planter(kitAt(ctx, -1.9, -0.6), true, 0.2, 0.2, C.brick);
  // cart
  const cart = kitAt(ctx, 1.2, -0.2, 70);
  cart.s.box(1.0, 0.14, 0.6, 0, 0.35, 0, C.woodLight, { jitter: 0.03 });
  for (const sz of [-1, 1]) cart.s.box(1.0, 0.18, 0.05, 0, 0.5, sz * 0.3, C.wood, { jitter: 0.03 });
  for (const sz of [-1, 1]) cart.s.cyl(0.26, 0.06, 0, 0.0, 0, C.woodDark, { seg: 10, rot: [0, 0, Math.PI / 2] });
  for (const sz of [-1, 1]) cart.s.cyl(0.26, 0.06, 0.0, 0.26, sz * 0.36, C.woodDark, { seg: 10, rot: [Math.PI / 2, 0, 0], jitter: 0 });
  cart.s.rod(-0.5, 0.35, 0.1, -1.0, 0.2, 0.0, 0.02, C.woodDark, { seg: 4 });
  cart.s.rod(-0.5, 0.35, -0.1, -1.0, 0.2, 0.0, 0.02, C.woodDark, { seg: 4 });
  cart.c.box(1.0, 0.7, 0.6, 0, 0.35, 0);
  sack(cart.at(0.1, 0.42, 0.0));
  sack(cart.at(-0.2, 0.42, 0.1));
  // fences along the yard south side
  for (let i = 0; i < 3; i++) fence(kitAt(ctx, 0.7 + i * 0.8, -1.2, 20), 0.8, C.white, 0.5);
  stoneWall(kitAt(ctx, -1.0, 3.4, 90), 3.0, 0.5);
  void r;
}

function extras(ctx: Ctx): void {
  const { b, ground } = ctx;
  // miller's cottage north-west and a gardener's hut by the terraces
  const cottage = frameAt(ctx, -0.8, 3.9, 180);
  house(b.kit(cottage), { w: 1.9, d: 1.6, floors: [1.75], wall: C.wallPink, roofColor: C.roofMustard, front: [['w', 'd']], shutters: C.roofTeal, glow: GLOW.workshopWindows, chimney: { x: 0.4, z: 0 }, flowerBoxes: false });
  ground.clear(cottage.origin, 1.6);
  const hut = frameAt(ctx, 8.6, -1.9, 230);
  house(b.kit(hut), { w: 1.4, d: 1.2, floors: [1.5], wall: C.mint, roofColor: C.roofTeal, front: [['w', 'd']], shutters: C.white, glow: GLOW.workshopWindows });
  ground.clear(hut.origin, 1.4);
  const k = b.kit(hut);
  barrel(k.at(1.2, 0, 1.0), 0.5, 0.2, C.woodLight);
  planter(k.at(-1.0, 0, 1.0), true, 0.2, 0.2, C.brick);
  // Sprout sits beside the dry terraces
  b.npcs.sprout = anchorFrom(W(4.9, -3.1), W(6.4, -4.5), 0);
  void PLANET_RADIUS; void groundAt;
}

function workshopPaths(ctx: Ctx): void {
  const mk = (pts: [number, number][], width: number) => {
    const line = sampleLine(smoothLine(pts.map(([e, n]) => W(e, n)), 6), 0.3);
    ctx.ground.ribbon(line, width, dirtColor, { lift: 0.02 });
  };
  mk([[-1.9, 0.2], [-1.0, 0.8], [0.0, 1.0], [1.0, 1.0], [1.6, 0.5], [2.4, -0.4], [3.6, -1.2], [5.0, -2.5]], 0.7);
  mk([[0.2, 1.1], [1.1, 1.9], [1.5, 2.9], [2.2, 3.7], [2.9, 4.5], [3.4, 5.1]], 0.55);
  mk([[-1.9, -0.2], [-1.2, -1.1], [-0.4, -1.5], [0.6, -1.6], [1.3, -2.1]], 0.5);
  mk([[6.0, -1.5], [6.8, -2.1], [7.6, -2.9]], 0.5);
}

function vegetation(ctx: Ctx): void {
  const r = ctx.b.random;
  const hill = offsetFrom(18, 112, 3.8, 5.0);
  scatterDisc(ctx, hill, 6.5, 26, { margin: 0.9, minHeight: 14.5 }, k => pineTree(k, r, { scale: 0.9 }));
  scatterDisc(ctx, W(0, 0), 7.2, 14, { margin: 1.0 }, k => roundTree(k, r, { scale: 0.9 }));
  scatterDisc(ctx, W(2, 0), 7.5, 20, { margin: 0.5 }, k => bush(k, r));
  scatterDisc(ctx, W(2, 0), 7.5, 20, { margin: 0.3 }, k => flowerPatch(k, r, 5, 0.34));
  scatterDisc(ctx, W(2, 0), 7.5, 90, { margin: 0.1 }, k => grassTuft(k, r));
  scatterDisc(ctx, hill, 5.5, 8, { margin: 0.3, minHeight: 14.8 }, k => rockCluster(k, r, 3, 0.5, 0.3));
}

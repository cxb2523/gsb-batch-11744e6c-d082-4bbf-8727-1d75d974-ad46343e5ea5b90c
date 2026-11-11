import { Euler, Matrix4, Vector3 } from 'three';
import { SEA_RADIUS } from '../chapter/data';
import { glowLevel, level, WARM } from './activation';
import { boat } from './boats';
import { house } from './buildings';
import { Part, frameRoot, Kit, type Ctx } from './context';
import { buildCrane } from './crane';
import { DEG, makeFrame, type Frame } from './frame';
import { socketPost } from './fixtures';
import { bush, flowerPatch, grassTuft, palm, rockCluster, roundTree } from './foliage';
import { cobbleColors, dirtColor, segmentDistance } from './ground';
import { dockClutter, driftwood, dinghyOnBeach, fishStall, netRack, pierEndFurniture, upturnedBoat, warehouse } from './harborParts';
import { shade } from './kit';
import { offsetFrom, smoothLine, sampleLine, sub, subPoint, walk } from './layout';
import { buildLighthouse } from './lighthouse';
import { GLOW } from './materials';
import { C } from './palette';
import { barrel, bench, bucket, buoy, crate, lampPost, laundry, planter, ropeCoil, sack } from './props';
import { scatterDisc } from './scatter';
import { lanternString, poleLine, wire } from './strings';
import { groundPoint, terrainHeight } from './terrain';
import { anchorAt, anchorFrom } from './anchors';
import { SPAWN } from '../chapter/data';

/** Harbor district: square with hub post, pier and generator, houses,
 * warehouse, quay and crane, lighthouse cape. Positions are east/north world
 * units from lat 10, lon 0. */

export const P = (e: number, n: number): Vector3 => offsetFrom(10, 0, e, n);
export const DECK = SEA_RADIUS + 0.26;
const WATERLINE = SEA_RADIUS + 0.02;

function frameAt(ctx: Ctx, e: number, n: number, bearing = 0, lift = 0): Frame {
  return ctx.b.placeAt(P(e, n), bearing * DEG, lift);
}
function kitAt(ctx: Ctx, e: number, n: number, bearing = 0, lift = 0): Kit {
  return ctx.b.kit(frameAt(ctx, e, n, bearing, lift));
}

export function buildHarbor(ctx: Ctx): void {
  harborSquare(ctx);
  houses(ctx);
  pierAndGenerator(ctx);
  warehouseYard(ctx);
  quayAndCrane(ctx);
  lighthouseCape(ctx);
  wiresAndLanterns(ctx);
  beachDetails(ctx);
  vegetation(ctx);
  harborPaths(ctx);
  harborAnchors(ctx);
}

function harborSquare(ctx: Ctx): void {
  const { b, ground } = ctx;
  const center = frameAt(ctx, 0, 0.65, 0);
  ground.paved(center, -2.3, 2.3, -1.25, 1.75, cobbleColors(), { cell: 0.3, stagger: true, seed: 3, lift: 0.035 });
  ground.clear(P(0, 0.65), 3.0);

  // well in the middle
  const well = b.kit(sub(center, 0.45, 0.2));
  well.s.cyl(0.46, 0.46, 0, 0, 0, C.stone, { seg: 10, rTop: 0.42 });
  well.s.cyl(0.36, 0.02, 0, 0.45, 0, C.water, { seg: 10, jitter: 0 });
  well.s.cyl(0.47, 0.06, 0, 0.44, 0, C.stoneDark, { seg: 10, jitter: 0 });
  for (const sx of [-1, 1]) well.s.box(0.07, 0.95, 0.07, sx * 0.4, 0.45, 0, C.woodDark, { jitter: 0 });
  well.s.box(1.1, 0.07, 0.8, 0, 1.0, 0, C.woodDark, { jitter: 0 });
  well.s.gable(1.25, 0.34, 0.95, 0, 1.0, 0, C.roofTerracotta, { jitter: 0.02 });
  well.s.barrelX(0.04, 0.8, 0, 0.82, 0, C.wood, { seg: 6 });
  well.s.rod(0.2, 0.82, 0, 0.2, 0.48, 0, 0.01, C.rope, { seg: 3 });
  well.s.cyl(0.07, 0.1, 0.2, 0.38, 0, C.ironLight, { seg: 6, rTop: 0.09, jitter: 0 });
  well.c.cyl(0.5, 1.1, 0, 0, 0, undefined, { seg: 10 });
  for (const [x, z, y] of [[0.9, 0.35, 0.5], [-0.15, 0.5, 2.3], [0.75, -0.2, 1.2]] as const) bucket(b.kit(sub(center, x, z, y)));

  // hub post: tall lantern post, socket housing on a low post beside it
  const hubFrame = frameAt(ctx, -0.94, 1.47, 180);
  lampPost(b.kit(hubFrame), 2.0, GLOW.harborHub, C.coal, C.lantern, false);
  b.kit(hubFrame).c.cyl(0.14, 2.0, 0, 0, 0, undefined, { seg: 6 });
  socketPost(b, 'hub_harbor', b.kit(sub(hubFrame, 0, 0.45, 0)), { h: 0.74 });
  const hub = glowLevel(ctx, GLOW.harborHub, WARM, 1.1, 0.8);
  b.onActivate('h2', instant => hub.set(1, instant));

  // planters, benches, lamp posts
  for (const [e, n, yaw] of [[-1.3, 2.2, 180], [1.3, 2.2, 180]] as const) bench(kitAt(ctx, e, n, yaw));
  for (const [e, n] of [[-2.3, 0.7], [2.3, 0.7], [-2.3, 2.1], [2.3, 2.1]] as const) lampPost(kitAt(ctx, e, n, 0), 2.0, GLOW.finale);
  for (const [e, n] of [[0.0, 2.3], [0.7, 2.3], [-2.35, 2.6], [2.35, 2.6]] as const) planter(kitAt(ctx, e, n, 0), true, 0.2, 0.22, C.brick);
}

function houses(ctx: Ctx): void {
  const { b, ground } = ctx;
  const row: [number, number, number, Parameters<typeof house>[1]][] = [
    [-3.0, 3.35, 180, { w: 2.1, d: 1.7, floors: [1.75, 1.35], wall: C.wallPink, roofColor: C.roofTeal, chimney: { x: 0.5, z: -0.2 }, front: [['s', 'd'], ['w', 'w', 'w']], sign: { kind: 'loaf', board: C.butter, a: C.roofTerracotta }, awning: { colors: [C.red, C.white] }, flowerBoxes: true, glow: GLOW.harborWindows }],
    [-0.6, 3.45, 180, { w: 1.9, d: 1.7, floors: [1.75, 1.35], wall: C.wallBlue, roofColor: C.roofTerracotta, chimney: { x: -0.4, z: 0 }, front: [['d', 's'], ['w', 'b']], sign: { kind: 'anchor', board: C.wallCream, a: C.navy }, shutters: C.navy, glow: GLOW.harborWindows }],
    [1.7, 3.25, 180, { w: 1.9, d: 1.6, floors: [1.85], wall: C.butter, roofColor: C.red, chimney: { x: 0.45, z: 0.1 }, front: [['w', 'd', 'w']], shutters: C.leafMid, flowerBoxes: true, glow: GLOW.harborWindows, doorLamp: true }],
    // west: net-mender
    [-3.7, 1.75, 90, { w: 1.7, d: 1.4, floors: [1.7], wall: C.mint, roofColor: C.roofMustard, roof: 'gable', ridge: 'x', chimney: { x: 0.35, z: 0.1 }, front: [['w', 'd']], shutters: C.roofTeal, glow: GLOW.harborWindows, lanterns: 1, curtains: C.wallPink }],
    // east: fish shop
    [4.15, 1.35, 270, { w: 1.9, d: 1.5, floors: [1.8], wall: C.wallCream, roofColor: C.roofTeal, chimney: { x: -0.4, z: 0 }, front: [['s', 'd']], sign: { kind: 'fish', board: C.wallBlue, a: C.roofTerracotta, style: 'hang' }, glow: GLOW.harborWindows, shutters: C.navy }],
    // a pair of cottages further north-east and north-west
    [5.8, 3.6, 250, { w: 1.6, d: 1.4, floors: [1.6], wall: C.wallPink, roofColor: C.roofMustard, front: [['w', 'd']], shutters: C.roofTeal, glow: GLOW.harborWindows, flowerBoxes: false, chimney: { x: 0.3, z: 0 } }],
    [-6.2, 3.2, 120, { w: 1.7, d: 1.4, floors: [1.7], wall: C.wallBlue, roofColor: C.red, front: [['d', 'w']], shutters: C.white, glow: GLOW.harborWindows, chimney: { x: -0.3, z: 0 } }],
  ];
  for (const [e, n, bearing, spec] of row) {
    const f = frameAt(ctx, e, n, bearing);
    house(b.kit(f), spec);
    ground.clear(f.origin, 1.7);
  }
  // fish stall opposite the square's east edge
  fishStall(ctx, frameAt(ctx, 2.7, 1.55, 270));
  // laundry between cottages
  laundry(kitAt(ctx, -4.9, 4.4, 90), 1.6);
}

function pierAndGenerator(ctx: Ctx): void {
  const { b } = ctx;
  const root = P(-1.7, -1.9);
  const tip = P(-1.7, -5.5);
  b.open(p => segmentDistance(p.clone().normalize(), root, tip) < 0.66);
  const segments = 7;
  const total = 3.8;
  const len = total / segments;
  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;
    const center = root.clone().lerp(tip, t).normalize();
    const f = b.placeRadius(center, Math.PI, DECK);
    const k = b.kit(f);
    for (let j = 0; j < 4; j++) k.s.box(1.02, 0.05, len / 4 - 0.012, 0, -0.03, (j - 1.5) * len / 4, j % 2 ? C.plank : shade(C.plank, -0.08), { jitter: 0.03 });
    for (const sx of [-1, 1]) k.s.box(0.09, 0.17, len + 0.02, sx * 0.42, -0.14, 0, C.woodDark, { jitter: 0.03 });
    k.s.box(1.0, 0.07, 0.08, 0, -0.14, len / 2 - 0.05, C.woodDark, { jitter: 0.03 });
    for (const sx of [-1, 1]) k.s.cyl(0.075, 1.9, sx * 0.44, -1.8, 0, C.woodDark, { seg: 6, jitter: 0.04 });
    k.c.box(1.04, 0.2, len + 0.02, 0, -0.1, 0);
    for (const sx of [-1, 1]) {
      k.c.box(0.1, 1.4, len + 0.02, sx * 0.56, 0.65, 0);
      if (i % 2 === 0) k.s.cyl(0.04, 0.55, sx * 0.51, 0, 0, C.wood, { seg: 5, jitter: 0.03 });
      k.s.box(0.05, 0.05, len + 0.02, sx * 0.51, 0.45, 0, C.wood, { jitter: 0 });
    }
  }
  // end platform
  const endF = b.placeRadius(P(-1.7, -5.85), Math.PI, DECK);
  const ek = b.kit(endF);
  for (let j = 0; j < 5; j++) ek.s.box(1.7, 0.05, 0.27, 0, -0.03, (j - 2) * 0.28, j % 2 ? C.plank : shade(C.plank, -0.08), { jitter: 0.03 });
  ek.s.box(1.72, 0.17, 0.09, 0, -0.14, 0.66, C.woodDark, { jitter: 0 });
  ek.s.box(1.72, 0.17, 0.09, 0, -0.14, -0.66, C.woodDark, { jitter: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ek.s.cyl(0.08, 1.9, sx * 0.78, -1.8, sz * 0.62, C.woodDark, { seg: 6, jitter: 0.04 });
  ek.c.box(1.74, 0.2, 1.44, 0, -0.1, 0);
  ek.c.box(0.1, 1.4, 1.44, -0.88, 0.65, 0);
  ek.c.box(0.1, 1.4, 1.44, 0.88, 0.65, 0);
  ek.c.box(1.74, 1.4, 0.1, 0, 0.65, -0.72);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    ek.s.cyl(0.04, 0.5, sx * 0.84, 0, sz * 0.66, C.wood, { seg: 5, jitter: 0.03 });
  }
  for (const sx of [-1, 1]) ek.s.box(0.05, 0.05, 1.3, sx * 0.84, 0.45, 0, C.wood, { jitter: 0 });
  ek.s.box(1.7, 0.05, 0.05, 0, 0.45, -0.66, C.wood, { jitter: 0 });
  lampPost(ek.at(0.6, 0, -0.45), 1.7, GLOW.finale, C.coal, C.glassWarm, false);
  barrel(ek.at(-0.6, 0, -0.4), 0.55, 0.23, C.woodLight);
  crate(ek.at(-0.45, 0, 0.1, 0.5), 0.4, C.plank);
  ropeCoil(ek.at(0.2, 0, 0.35));
  buoy(ek.at(0.65, 0, 0.3), C.red, 0.13);
  pierEndFurniture(ek.at(-0.1, 0, -0.2, 0.2));
  // bollards along the pier sides
  for (const [e, n] of [[-1.28, -2.8], [-2.12, -3.5], [-1.28, -4.4]] as const) {
    const bf = b.placeRadius(P(e, n), 0, DECK);
    const bk = b.kit(bf);
    bk.s.cyl(0.07, 0.2, 0, 0, 0, C.coal, { seg: 6, rTop: 0.055, jitter: 0 });
    bk.s.cyl(0.085, 0.04, 0, 0.18, 0, C.iron, { seg: 6, jitter: 0 });
  }

  // generator on a plank platform at the root
  const gf = frameAt(ctx, -0.35, -1.6, 0);
  const g = b.kit(gf);
  g.s.box(1.2, 0.12, 0.95, 0, 0.0, 0, C.plank, { jitter: 0.03 });
  g.s.box(0.75, 0.55, 0.52, 0, 0.4, -0.08, C.roofMustard, { jitter: 0.02 });
  g.s.box(0.8, 0.07, 0.57, 0, 0.7, -0.08, C.coal, { jitter: 0 });
  g.s.box(0.32, 0.2, 0.3, -0.4, 0.55, -0.1, C.coal, { jitter: 0 });
  g.s.cyl(0.05, 0.5, -0.28, 0.7, -0.22, C.coal, { seg: 6 });
  g.s.cyl(0.075, 0.05, -0.28, 1.2, -0.22, C.iron, { seg: 6, rTop: 0.05 });
  g.s.box(0.06, 0.4, 0.06, 0.28, 0.55, 0.0, C.iron, { jitter: 0 });
  g.d.ball(0.05, 0.28, 0.78, 0.0, C.red, { detail: 0, jitter: 0 });
  g.c.box(1.2, 0.85, 0.95, 0, 0.3, 0);
  socketPost(b, 'generator', b.kit(sub(gf, 0, 0.75, 0)), { h: 0.72 });
  // flywheel spins after h1
  const root2 = frameRoot(ctx, gf);
  const wheel = new Part(ctx, root2, gf, new Vector3(0.52, 0.5, -0.08), 51);
  const w = wheel.kit;
  w.s.cyl(0.3, 0.07, -0.035, 0, 0, C.ironLight, { seg: 14, rot: [0, 0, Math.PI / 2] });
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI;
    w.s.box(0.04, 0.5, 0.05, 0, Math.sin(a) * 0.0, 0, C.iron, { rot: [a, 0, 0], jitter: 0 });
  }
  w.s.cyl(0.07, 0.09, -0.045, 0, 0, C.coal, { seg: 6, rot: [0, 0, Math.PI / 2] });
  w.s.rod(0.05, 0.0, 0.0, 0.2, 0.0, 0.22, 0.025, C.coal, { seg: 4 });
  w.s.ball(0.045, 0.2, 0.0, 0.22, C.red, { detail: 0 });
  wheel.mount();
  const spin = level(ctx, () => { /* eased */ }, 0.5);
  b.onUpdate((_t, dt) => { if (spin.value > 0) wheel.group.rotation.x += dt * 6 * spin.value; });
  b.onActivate('h1', instant => spin.set(1, instant));

  // moored boats
  const skiff = b.placeRadius(P(-0.65, -3.25), 170 * DEG, WATERLINE);
  boat(b.kit(skiff), { len: 1.75, beam: 0.68, hull: C.roofTeal, stripe: C.white, seats: 2, oars: true, collide: true });
  const trawler = b.placeRadius(P(-3.5, -4.5), 195 * DEG, WATERLINE);
  boat(b.kit(trawler), { len: 2.7, beam: 1.0, hull: C.wallBlue, stripe: C.red, cabin: { color: C.wallCream, roof: C.red }, mast: C.woodDark, flag: C.yellow, lantern: true, halo: true, cargo: 'net', collide: true });
  const sail = b.placeRadius(P(6.4, -4.4), 120 * DEG, WATERLINE);
  boat(b.kit(sail), { len: 1.8, beam: 0.72, hull: C.roofTerracotta, stripe: C.white, mast: C.woodDark, flag: C.white, seats: 1, collide: true });
}

function warehouseYard(ctx: Ctx): void {
  const { b } = ctx;
  const f = frameAt(ctx, -5.75, 1.6, 180);
  warehouse(ctx, b.kit(f));
  // boat yard west of the generator where Wick works
  upturnedBoat(kitAt(ctx, -3.3, 0.15, 90));
  netRack(kitAt(ctx, -2.1, 0.45, 90), 1.3);
  barrel(kitAt(ctx, -4.3, 0.35), 0.6, 0.25, C.plank);
  crate(kitAt(ctx, -2.05, -0.25, 10), 0.45, C.plank);
  dinghyOnBeach(kitAt(ctx, 1.6, -1.55, 80));
  driftwood(kitAt(ctx, 0.9, -1.55, 20));
  driftwood(kitAt(ctx, -4.4, -1.62, 80));
  for (const [e, n] of [[-3.1, 0.1], [1.5, -1.5]] as const) ctx.ground.clear(P(e, n), 1.0);
}

function quayAndCrane(ctx: Ctx): void {
  const { b } = ctx;
  // deck
  const qf = b.placeRadius(P(3.4, -1.9), 0, DECK);
  const q = b.kit(qf);
  const W = 3.4, D = 1.9;
  for (let j = 0; j < 8; j++) for (let s = 0; s < 3; s++) {
    q.s.box(W / 3 - 0.012, 0.05, D / 8 - 0.01, (s - 1) * W / 3, -0.03, (j - 3.5) * D / 8, (j + s) % 2 ? C.plank : shade(C.plank, -0.08), { jitter: 0.03 });
  }
  q.s.box(W + 0.1, 0.18, 0.1, 0, -0.14, D / 2, C.woodDark, { jitter: 0 });
  q.s.box(W + 0.1, 0.18, 0.1, 0, -0.14, -D / 2, C.woodDark, { jitter: 0 });
  for (const sx of [-1, 1]) q.s.box(0.1, 0.18, D, sx * W / 2, -0.14, 0, C.woodDark, { jitter: 0 });
  for (let i = 0; i < 5; i++) q.s.cyl(0.09, 1.9, -W / 2 + 0.15 + i * (W - 0.3) / 4, -1.9, -D / 2 + 0.05, C.woodDark, { seg: 6, jitter: 0.04 });
  q.c.box(W + 0.1, 0.35, D + 0.1, 0, -0.18, 0);
  // seaward rail + posts (collider extends past the ends to meet the sea wall)
  q.c.box(W + 0.9, 1.4, 0.1, 0, 0.65, -D / 2 - 0.05);
  q.c.box(0.1, 1.4, 0.5, -W / 2 - 0.4, 0.65, -D / 2 + 0.15);
  q.c.box(0.1, 1.4, 0.5, W / 2 + 0.4, 0.65, -D / 2 + 0.15);
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + i * W / 8;
    q.s.cyl(0.045, 0.52, x, 0, -D / 2 + 0.05, C.wood, { seg: 5, jitter: 0.03 });
  }
  q.s.cable(-W / 2, 0.45, -D / 2 + 0.05, W / 2, 0.45, -D / 2 + 0.05, 0.05, 0.016, C.rope, 8);
  for (const x of [-1.1, 0.3, 1.2]) {
    q.s.cyl(0.08, 0.22, x, 0, -D / 2 + 0.2, C.coal, { seg: 6, rTop: 0.06, jitter: 0 });
    q.s.cyl(0.09, 0.04, x, 0.2, -D / 2 + 0.2, C.iron, { seg: 6, jitter: 0 });
  }
  const qRight = new Vector3(1, 0, 0).transformDirection(qf.matrix);
  b.open(p => {
    const d = p.clone().sub(qf.origin);
    return Math.abs(d.dot(qRight)) < W / 2 + 0.05 && Math.abs(d.dot(qf.forward) + D / 2) < 0.7;
  });
  // crate pile and clutter on the quay
  crate(kitAt(ctx, 4.1, -1.1, 12), 0.55, C.plank);
  crate(kitAt(ctx, 4.7, -1.12, -8), 0.5, C.woodLight);
  crate(kitAt(ctx, 4.35, -1.12, 20, 0.0), 0.42, C.plank);
  dockClutter(kitAt(ctx, 2.0, -2.5, 0, 0));
  sack(kitAt(ctx, 5.0, -1.3, 0));
  sack(kitAt(ctx, 5.0, -1.5, 0));
  // crane at the east end
  buildCrane(ctx, b.placeRadius(P(4.45, -1.95), Math.PI, DECK));
  ctx.ground.clear(P(3.4, -1.9), 2.2);

  // berth: the arriving boat, sailing in when the lighthouse comes on
  const berth = P(3.0, -3.55);
  const route: Vector3[] = [P(12.5, -11), P(9.5, -8), P(7.0, -5.8), P(4.9, -4.3), berth.clone()];
  const waterPath = smoothLine(route, 8);
  b.paths.boat = waterPath.map(n => n.clone().multiplyScalar(WATERLINE));
  const boatRoot = new Part(ctx, ctx.group, frameAt(ctx, 3.0, -3.55, 270), new Vector3(), 61);
  boat(boatRoot.kit, { len: 2.3, beam: 0.9, hull: C.red, stripe: C.white, cabin: { color: C.wallCream, roof: C.roofTeal }, mast: C.woodDark, flag: C.roofMustard, lantern: true, cargo: 'crates' });
  boatRoot.mount();
  const bg = boatRoot.group;
  bg.matrixAutoUpdate = false;
  bg.visible = false;
  const sailing = { t: 1, active: false };
  const points = b.paths.boat;
  const matrix = new Matrix4(), rock = new Matrix4();
  const place = (u: number, time: number) => {
    const idx = Math.min(points.length - 1.0001, u * (points.length - 1));
    const i = Math.floor(idx), f = idx - i;
    const pos = points[i].clone().lerp(points[i + 1], f).normalize().multiplyScalar(WATERLINE);
    const forward = points[i + 1].clone().sub(points[i]);
    if (forward.lengthSq() < 1e-8) forward.set(-1, 0, 0);
    const frame = makeFrame(pos, forward);
    const bob = Math.sin(time * 1.6) * 0.025;
    matrix.copy(frame.matrix).multiply(rock.makeRotationFromEuler(eulerOf(Math.sin(time * 1.1 + 1) * 0.02, 0, Math.sin(time * 1.3) * 0.035)));
    matrix.setPosition(pos.clone().addScaledVector(frame.up, bob));
    bg.matrix.copy(matrix);
    bg.matrixWorldNeedsUpdate = true;
  };
  b.onUpdate((time, dt) => {
    if (!bg.visible) return;
    if (sailing.active) {
      sailing.t = Math.min(1, sailing.t + dt / 16);
      if (sailing.t >= 1) sailing.active = false;
    }
    const u = 1 - Math.pow(1 - sailing.t, 2.2);
    place(u, time);
  });
  b.onActivate('h1', instant => {
    bg.visible = true;
    sailing.t = instant ? 1 : 0;
    sailing.active = !instant;
    place(instant ? 1 : 0, 0);
  });
}

function eulerOf(x: number, y: number, z: number): Euler { return new Euler(x, y, z); }

function lighthouseCape(ctx: Ctx): void {
  const f = frameAt(ctx, -7.1, -4.9, 55);
  buildLighthouse(ctx, f);
  ctx.ground.clear(f.origin, 2.6);
}

function wiresAndLanterns(ctx: Ctx): void {
  const gen = P(-1.7, -1.5);
  // The line stops at the lighthouse hut: poles on the cape itself crowded the
  // only walkway between the lighthouse box and the beach.
  const line = [P(-0.6, -0.65), P(-3.0, -0.85), P(-5.2, -0.8)];
  const tops = poleLine(ctx, line, { sag: 0.16 });
  void gen;
  // wires reach the generator and the lighthouse hut
  void tops;
  const sq = [[-2.3, 0.7], [2.3, 0.7], [-2.3, 2.1], [2.3, 2.1]];
  const at = (e: number, n: number, h: number) => P(e, n).multiplyScalar(terrainHeight(P(e, n)) + h);
  lanternString(ctx, at(sq[0][0], sq[0][1], 2.2), at(sq[1][0], sq[1][1], 2.2), 9, { glow: GLOW.finale, sag: 0.25 });
  lanternString(ctx, at(sq[2][0], sq[2][1], 2.2), at(sq[3][0], sq[3][1], 2.2), 9, { glow: GLOW.finale, sag: 0.25 });
  lanternString(ctx, at(sq[0][0], sq[0][1], 2.2), at(sq[2][0], sq[2][1], 2.2), 7, { glow: GLOW.finale, sag: 0.22 });
  lanternString(ctx, at(sq[1][0], sq[1][1], 2.2), at(sq[3][0], sq[3][1], 2.2), 7, { glow: GLOW.finale, sag: 0.22 });
  wire(ctx, at(-2.3, 0.7, 2.2), at(-1.0, -0.65, 2.7), 0.1);
}

function beachDetails(ctx: Ctx): void {
  const { b } = ctx;
  const r = b.random;
  for (const [e, n] of [[0.55, -1.45], [1.3, -1.6], [5.5, -1.7]] as const) palm(kitAt(ctx, e, n, r() * 360), r, 1.0);
  rockCluster(kitAt(ctx, 6.4, -2.0), r, 5, 0.9, 0.38);
  rockCluster(kitAt(ctx, -4.6, -1.9), r, 4, 0.7, 0.3);
  for (const [e, n] of [[0.2, -1.8], [-0.6, -1.7], [1.8, -1.6]] as const) flowerPatch(kitAt(ctx, e, n), r, 4, 0.3, [C.white, C.blossom]);
}

function vegetation(ctx: Ctx): void {
  const { b, ground } = ctx;
  const r = b.random;
  const center = P(0, 3.5);
  ground.clear(P(0, 0.65), 3.0);
  scatterDisc(ctx, center, 6.8, 22, { margin: 0.9, minHeight: SEA_RADIUS + 0.5 }, (k) => roundTree(k, r, { scale: 0.9 }));
  scatterDisc(ctx, center, 6.8, 26, { margin: 0.5, minHeight: SEA_RADIUS + 0.4 }, (k) => bush(k, r, { berries: r() > 0.6 ? C.red : null }));
  scatterDisc(ctx, center, 6.8, 22, { margin: 0.25, minHeight: SEA_RADIUS + 0.35 }, (k) => flowerPatch(k, r, 5, 0.34));
  scatterDisc(ctx, P(0, 2), 7.4, 90, { margin: 0.1, minHeight: SEA_RADIUS + 0.3 }, (k) => grassTuft(k, r));
}

function harborPaths(ctx: Ctx): void {
  const { ground } = ctx;
  const mk = (pts: [number, number][], width: number) => {
    const line = sampleLine(smoothLine(pts.map(([e, n]) => P(e, n)), 6), 0.3);
    ground.ribbon(line, width, dirtColor, { lift: 0.02 });
  };
  mk([[-1.0, -0.4], [-1.45, -0.85], [-1.7, -1.3]], 0.6);
  mk([[-1.7, -1.25], [-2.6, -1.2], [-3.8, -1.2], [-5.0, -1.35], [-5.9, -2.1], [-6.5, -3.0], [-6.8, -3.9]], 0.65);
  mk([[1.6, -0.5], [2.3, -1.0], [3.1, -1.4]], 0.6);
  mk([[0, 2.3], [0.1, 4.3], [0.4, 6.5], [0.8, 9.0]], 0.7);
}

function harborAnchors(ctx: Ctx): void {
  const { b } = ctx;
  b.spawn = anchorAt(SPAWN.lat, SPAWN.lon, SPAWN.faceLat, SPAWN.faceLon);
  // Wick at the pier root facing the generator and the square; Marlo steps onto the quay.
  b.npcs.wick = anchorFrom(P(-1.7, -2.65), P(-1.7, 1.0), 0, DECK + 0.0);
  b.npcs.marlo = anchorFrom(P(2.55, -2.25), P(2.0, 1.5), 0, DECK);
  b.npcs.pim = anchorAt(15, 7, 8, 10);
  b.npcs.cat = anchorAt(11, -2, 12, 0);
  const cat = [[0.3, 0.2], [-0.6, 0.7], [-1.2, -0.2], [-1.9, -0.95], [-2.8, -1.1], [-3.8, -1.2], [-3.0, -0.6], [-1.6, 0.2], [0.8, 1.4], [1.9, 0.2], [2.8, -0.9], [3.6, -1.3], [2.6, -0.4], [1.4, 0.2]];
  b.paths.cat = cat.map(([e, n]) => { const d = P(e, n); return groundPoint(d); });
}

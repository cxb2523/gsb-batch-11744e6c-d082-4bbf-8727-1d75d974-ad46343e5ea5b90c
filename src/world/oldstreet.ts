import { Vector3 } from 'three';
import { dir, PLANET_RADIUS } from '../chapter/data';
import { glowLevel, level, WARM } from './activation';
import { house } from './buildings';
import { Kit, type Ctx } from './context';
import { Flaps } from './flaps';
import { socketPost } from './fixtures';
import { blossomTree, bush, flowerPatch, grassTuft, roundTree, rockCluster } from './foliage';
import { cobbleColors, dirtColor } from './ground';
import { makeFrame, northAt, type Frame } from './frame';
import { shade } from './kit';
import { groundAt, walk, sampleLine, smoothLine, sub } from './layout';
import { GLOW } from './materials';
import { FLOOR, interiorProps, neighborHouse } from './neighbors';
import { C } from './palette';
import { picto } from './pictos';
import { barrel, bench, bucket, crate, fence, lampPost, laundry, mailbox, planter, sack, sign_post, stoneWall, stool, table } from './props';
import { Puffs } from './puffs';
import { scatterDisc } from './scatter';
import { lanternString, wire } from './strings';
import { anchorFrom } from './anchors';
import { groundPoint } from './terrain';
import { sphereTangent } from '../sphere';
import { addHalo } from './halos';

/** Old Street: a cobbled street from lamp A (east) to lamp B (west) between
 * two rows of shophouses, a noodle stall and plaza, a narrow side alley where
 * Otto's and Ike's windows face each other, and a blossom tree court. */

const A = dir(6, -98), B = dir(25, -138);
const MID = A.clone().add(B).normalize();
const TM = B.clone().sub(MID.clone().multiplyScalar(B.dot(MID))).normalize();
const R = PLANET_RADIUS;
export const STREET_LENGTH = Math.acos(A.dot(B)) * R;
const HALF = 1.3;

/** Unit direction on the street axis at arc distance s (positive toward B). */
export const sp = (s: number): Vector3 => MID.clone().multiplyScalar(Math.cos(s / R)).addScaledVector(TM, Math.sin(s / R));
const tangentAt = (s: number): Vector3 => TM.clone().multiplyScalar(Math.cos(s / R)).addScaledVector(MID, -Math.sin(s / R));
/** Left of travel toward B. */
const leftAt = (s: number): Vector3 => sp(s).cross(tangentAt(s)).normalize();
/** Direction offset v to the left of the street axis (v < 0 is the north/right row). */
export const sd = (s: number, v: number): Vector3 => walk(sp(s), leftAt(s), v);

/** Frame at street coords whose front faces the street axis (or an explicit bearing). */
function frameFacingStreet(ctx: Ctx, s: number, v: number, lift = 0): Frame {
  const n = sd(s, v);
  const toward = sp(s).clone().sub(n);
  const origin = groundPoint(n).addScaledVector(n, lift);
  return makeFrame(origin, sphereTangent(n, toward));
}
function frameAlong(ctx: Ctx, s: number, v: number, along = 1): Frame {
  const n = sd(s, v);
  const origin = groundPoint(n);
  return makeFrame(origin, sphereTangent(n, tangentAt(s).multiplyScalar(along)));
}

export function buildOldStreet(ctx: Ctx): void {
  const { b, ground } = ctx;
  const flaps = new Flaps(ctx, 96);
  const glow = GLOW.oldWindows;
  const S = (s: number, v: number, lift = 0) => b.kit(frameFacingStreet(ctx, s, v, lift));

  // ---- street surface
  const pts: Vector3[] = [];
  for (let s = -STREET_LENGTH / 2 - 1.0; s <= STREET_LENGTH / 2 + 1.0; s += 0.3) pts.push(sp(s));
  ground.ribbon(pts, 2 * HALF, (i, j) => cobbleColors()[(i * 5 + j * 3 + (i % 3)) % 5], { lift: 0.032, strips: 9 });
  for (const side of [-1, 1]) {
    const edge: Vector3[] = [];
    for (let s = -STREET_LENGTH / 2 - 1.0; s <= STREET_LENGTH / 2 + 1.0; s += 0.3) edge.push(sd(s, side * (HALF + 0.07)));
    ground.ribbon(edge, 0.16, (i) => (i % 2 ? C.stoneDark : shade(C.stoneDark, 0.08)), { lift: 0.04, strips: 1, register: false });
  }
  // pocket plaza and the alley / court
  const plaza = frameAlong(ctx, -3.55, -2.15, 1);
  ground.paved(plaza, -1.55, 1.55, -1.05, 1.05, cobbleColors(), { cell: 0.3, stagger: true, seed: 9, lift: 0.036 });
  const alleyF = frameAlong(ctx, 0.6, -3.0, 1);
  const alleyDirFrame = makeFrame(alleyF.origin, sphereTangent(alleyF.up, leftAt(0.6).multiplyScalar(-1)));
  ground.paved(alleyDirFrame, -1.18, 1.18, -1.8, 2.7, cobbleColors(), { cell: 0.28, stagger: true, seed: 12, lift: 0.034 });
  ground.clear(sd(0.6, -3.4), 1.4);

  // ---- south row
  const south: [number, number, number, Parameters<typeof house>[1]][] = [
    [-4.15, 2.3, 0, { w: 2.2, d: 1.95, floors: [1.8, 1.45], wall: C.wallPink, roofColor: C.roofTeal, chimney: { x: 0.5, z: -0.3 }, front: [['s', 'd'], ['w', 'w']], sign: { kind: 'teapot', board: C.butter, a: C.roofTeal, style: 'hang' }, awning: { colors: [C.mint, C.white] }, flowerBoxes: true, glow, leaves: { flaps, tag: 'o1', color: C.roofTeal }, lanterns: 2 }],
    [-1.7, 2.3, 0, { w: 2.3, d: 1.9, floors: [1.8, 1.45], wall: C.wallBlue, roofColor: C.roofMustard, chimney: { x: -0.5, z: 0 }, front: [['d', 's'], ['b', 'w']], sign: { kind: 'spool', board: C.wallCream, a: C.red }, awning: { colors: [C.roofTerracotta, C.white] }, glow, leaves: { flaps, tag: 'o1', color: C.navy } }],
    [0.8, 2.3, 0, { w: 2.2, d: 1.9, floors: [1.8, 1.45], wall: C.wallCream, roofColor: C.red, chimney: { x: 0.4, z: -0.3 }, front: [['s', 'd'], ['w', 'w', 'w']], sign: { kind: 'loaf', board: C.wallBlue, a: C.roofTerracotta, style: 'hang' }, awning: { colors: [C.red, C.white] }, glow, leaves: { flaps, tag: 'o1', color: C.leafMid }, flowerBoxes: true }],
    [3.25, 2.3, 0, { w: 2.3, d: 1.9, floors: [1.8, 1.45], wall: C.butter, roofColor: C.roofTeal, chimney: { x: -0.4, z: -0.2 }, front: [['w', 'd', 's'], ['w', 'b']], sign: { kind: 'lantern', board: C.wallPink, a: C.red }, glow, leaves: { flaps, tag: 'o1', color: C.roofTerracotta }, lanterns: 3 }],
  ];
  for (const [s, v, , spec] of south) {
    const f = frameFacingStreet(ctx, s, v);
    house(b.kit(f), spec);
    ground.clear(f.origin, 1.8);
  }
  // north row: repair shop at the west end
  const repair = frameFacingStreet(ctx, 4.95, -2.15);
  house(b.kit(repair), { w: 1.7, d: 1.6, floors: [1.8, 1.4], wall: C.mint, roofColor: C.navy, chimney: { x: 0.35, z: 0 }, front: [['d', 'w'], ['w', 'w']], sign: { kind: 'cog', board: C.wallCream, a: C.iron, style: 'hang' }, awning: { colors: [C.navy, C.white] }, glow, leaves: { flaps, tag: 'o1', color: C.roofMustard } });
  ground.clear(repair.origin, 1.5);

  // ---- Otto's and Ike's houses facing each other across the alley
  const ottoFrame = frameFacingStreet(ctx, -1.65, -2.25);
  const ikeFrame = frameFacingStreet(ctx, 2.85, -2.25);
  const ottoKit = b.kit(ottoFrame), ikeKit = b.kit(ikeFrame);
  const otto = neighborHouse(ctx, ottoKit, { id: 'otto', w: 2.1, d: 1.9, alley: -1, wall: C.wallPink, roof: C.roofTerracotta, inside: C.peach, floor: C.woodLight, shutter: C.roofTeal, flaps, socket: 'otto_window' });
  const ike = neighborHouse(ctx, ikeKit, { id: 'ike', w: 2.1, d: 1.9, alley: 1, wall: C.wallBlue, roof: C.roofMustard, inside: C.butter, floor: C.woodLight, shutter: C.navy, flaps, socket: 'ike_window' });
  interiorProps(ottoKit, 'otto', 2.1, 1.9, -1);
  interiorProps(ikeKit, 'ike', 2.1, 1.9, 1);
  b.npcs.otto = otto.npc;
  b.npcs.ike = ike.npc;
  ground.clear(ottoFrame.origin, 1.5);
  ground.clear(ikeFrame.origin, 1.5);

  // ---- noodle stall + plaza + hub
  noodleStall(ctx, frameFacingStreet(ctx, -4.35, -1.75, 0), flaps);
  const hubFrame = frameFacingStreet(ctx, -3.0, -1.6);
  lampPost(b.kit(hubFrame), 2.1, GLOW.oldHub, C.coal, C.lantern, false);
  b.kit(hubFrame).c.cyl(0.14, 2.0, 0, 0, 0, undefined, { seg: 6 });
  socketPost(b, 'hub_oldstreet', b.kit(sub(hubFrame, 0, 0.42, 0)), { h: 0.74 });
  const hub = glowLevel(ctx, GLOW.oldHub, WARM, 1.1, 0.8);
  b.onActivate('o2', instant => hub.set(1, instant));

  // ---- lamps at both ends with their sockets
  const lampA = frameAlong(ctx, -STREET_LENGTH / 2 + 0.05, 0.0, 1);
  const lampB = frameAlong(ctx, STREET_LENGTH / 2 - 0.05, 1.55, -1);
  for (const [f, id] of [[lampA, 'lamp_a'], [lampB, 'lamp_b']] as const) {
    const lk = b.kit(f);
    lampPost(lk, 2.3, GLOW.oldLanterns, C.coal, C.glassWarm, false);
    lk.c.cyl(0.14, 2.0, 0, 0, 0, undefined, { seg: 6 });
    socketPost(b, id, b.kit(sub(f, 0.55, 0.15, 0)), { h: 0.72 });
  }
  void bench;
  // archway at the west end
  archway(ctx, STREET_LENGTH / 2 + 0.55);
  // east end signpost
  sign_post(b.kit(frameAlong(ctx, -STREET_LENGTH / 2 - 0.5, 1.6, 1)), 2);

  // ---- court with the blossom tree
  court(ctx);

  // ---- street dressing
  dressing(ctx, flaps);

  // ---- lanterns, bunting, wires
  strings(ctx);

  // ---- vegetation around
  surroundings(ctx);

  // ---- activation
  flaps.mount();
  const windows = glowLevel(ctx, GLOW.oldWindows, [1.1, 0.82, 0.42], 0.95, 0.8);
  const lanterns = glowLevel(ctx, GLOW.oldLanterns, [1.2, 0.75, 0.4], 1.0, 0.7);
  const steam = new Puffs(ctx, noodleSteamOrigin, { count: 6, radius: 0.12, rise: 0.8, speed: 0.3, drift: 0.15 });
  b.onActivate('o1', instant => {
    flaps.set('o1', true, instant, 0.1, 1.0);
    windows.set(1, instant);
    lanterns.set(1, instant);
    steam.set(true, instant);
  });
  b.onActivate('o2', instant => flaps.set('o2', true, instant, 0.25, 1.4));
  b.onFinale(a => { windows.set(a > 0.05 ? Math.max(a, windows.target) : windows.target); lanterns.set(a > 0.05 ? Math.max(a, lanterns.target) : lanterns.target); });

  // anchors: Sol behind the stall facing the street
  const solN = sd(-4.35, -2.25);
  b.npcs.sol = anchorFrom(solN, sp(-4.35), 0);
  void level; void picto; void table; void stool; void bucket; void crate; void sack; void mailbox; void barrel; void planter; void fence; void stoneWall; void laundry; void blossomTree; void bush; void flowerPatch; void grassTuft; void roundTree; void rockCluster; void northAt; void groundAt; void sampleLine; void smoothLine; void dirtColor; void scatterDisc; void wire; void lanternString; void Kit;
  void FLOOR;
}

let noodleSteamOrigin = new Vector3();

function noodleStall(ctx: Ctx, frame: Frame, flaps: Flaps): void {
  const { b } = ctx;
  const k = b.kit(frame);
  const W = 2.0;
  // platform and counter
  k.s.box(W + 0.3, 0.08, 1.1, 0, 0.0, 0, C.plank, { jitter: 0.03 });
  k.s.box(W, 0.55, 0.5, 0, 0.35, 0.1, C.roofTerracotta, { jitter: 0.02 });
  k.s.box(W + 0.12, 0.07, 0.62, 0, 0.66, 0.1, C.woodLight, { jitter: 0.02 });
  for (const sx of [-1, 1]) {
    k.s.box(0.09, 1.9, 0.09, sx * (W / 2 + 0.02), 0.95, 0.4, C.woodDark, { jitter: 0.02 });
    k.s.box(0.09, 2.1, 0.09, sx * (W / 2 + 0.02), 1.05, -0.45, C.woodDark, { jitter: 0.02 });
  }
  // awning (static stripes slanting down toward customers)
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const x = -W / 2 - 0.1 + (W + 0.2) * (i + 0.5) / stripes;
    k.s.box((W + 0.2) / stripes, 0.04, 1.2, x, 1.98, 0.0, i % 2 ? C.white : C.red, { rot: [0.22, 0, 0], jitter: 0 });
    k.s.box((W + 0.2) / stripes, 0.12, 0.03, x, 1.77, 0.6, i % 2 ? C.white : C.red, { jitter: 0 });
  }
  k.s.box(W + 0.2, 0.9, 0.05, 0, 1.4, -0.5, C.wallCream, { jitter: 0 });
  // back wall menu board with a bowl
  k.s.box(0.8, 0.5, 0.05, 0, 1.5, -0.45, C.woodDark, { jitter: 0 });
  picto(k.d, 'bowl', 0, 1.5, -0.42, 0.42, C.roofTerracotta, C.yellow);
  // big pot and steam
  k.s.cyl(0.26, 0.3, -0.45, 0.7, 0.05, C.iron, { seg: 10, rTop: 0.3 });
  k.s.cyl(0.32, 0.03, -0.45, 0.99, 0.05, C.ironLight, { seg: 10 });
  k.s.cyl(0.24, 0.02, -0.45, 0.98, 0.05, C.cloth, { seg: 10, jitter: 0 });
  k.s.box(0.5, 0.2, 0.3, -0.45, 0.45, 0.35, C.coal, { jitter: 0 });
  // bowls, ladle, noodle baskets
  for (let i = 0; i < 4; i++) k.s.cyl(0.08, 0.06 + i * 0.0, 0.45 + (i % 2) * 0.14, 0.73 + Math.floor(i / 2) * 0.06, 0.2 + (i % 2) * 0.07, i % 2 ? C.wallBlue : C.white, { seg: 8, rTop: 0.1, jitter: 0 });
  k.s.rod(0.15, 0.74, 0.3, 0.3, 0.92, 0.3, 0.012, C.woodDark, { seg: 3 });
  k.s.cyl(0.1, 0.04, 0.0, 0.73, 0.28, C.woodLight, { seg: 8, rTop: 0.12 });
  k.d.ball(0.1, 0.0, 0.8, 0.28, C.yellow, { detail: 1, scale: [1, 0.55, 1], jitter: 0 });
  k.c.box(W + 0.12, 1.1, 0.6, 0, 0.55, 0.1);
  // hanging lantern
  k.s.rod(0, 1.9, 0.55, 0, 1.75, 0.55, 0.008, C.iron, { seg: 3 });
  k.d.ball(0.1, 0, 1.64, 0.55, C.lantern, { glow: GLOW.oldLanterns, scale: [1, 1.25, 1], jitter: 0, detail: 0 });
  addHalo(k.p(0, 1.64, 0.55), 0.6, GLOW.oldLanterns);
  // stools in front
  for (const x of [-0.65, 0.0, 0.65]) stool(k.at(x, 0.0, 1.0), C.woodLight);
  noodleSteamOrigin = k.p(-0.45, 1.05, 0.05);
  ctx.ground.clear(frame.origin, 1.7);
  void flaps;
}

function archway(ctx: Ctx, s: number): void {
  const { b } = ctx;
  const f = frameAlong(ctx, s, 0, 1);
  const k = b.kit(f);
  for (const sx of [-1, 1]) {
    k.s.block(sx * 1.55 - 0.24, -0.4, -0.3, sx * 1.55 + 0.24, 2.3, 0.3, C.stone, { jitter: 0.03 });
    k.s.block(sx * 1.55 - 0.3, 2.3, -0.36, sx * 1.55 + 0.3, 2.42, 0.36, C.stoneDark, { jitter: 0 });
    k.c.block(sx * 1.55 - 0.26, -0.5, -0.32, sx * 1.55 + 0.26, 2.45, 0.32);
    k.s.box(0.7, 0.1, 0.1, sx * 1.55, 1.0, 0.33, C.stoneDark, { jitter: 0 });
  }
  k.s.block(-1.85, 2.4, -0.34, 1.85, 2.72, 0.34, C.stone, { jitter: 0.03 });
  k.c.block(-1.85, 2.4, -0.34, 1.85, 2.72, 0.34);
  k.s.gable(4.0, 0.45, 0.8, 0, 2.72, 0, C.roofTeal, { jitter: 0.02 });
  k.s.box(0.7, 0.4, 0.06, 0, 2.55, 0.37, C.woodDark, { jitter: 0 });
  picto(k.d, 'lantern', 0, 2.55, 0.41, 0.34, C.red, C.yellow);
  for (const x of [-0.8, 0, 0.8]) { k.d.ball(0.1, x, 2.15, 0.0, C.lantern, { glow: GLOW.oldLanterns, scale: [1, 1.25, 1], jitter: 0 }); addHalo(k.p(x, 2.15, 0.0), 0.55, GLOW.oldLanterns); }
  void b;
}

function court(ctx: Ctx): void {
  const { b } = ctx;
  const r = b.random;
  const f = makeFrame(groundAt(sd(0.6, -4.7)), sphereTangent(sd(0.6, -4.7), leftAt(0.6).multiplyScalar(-1)));
  const k = b.kit(f);
  blossomTree(k.at(0.0, 0, 0.9), r, 1.5);
  ctx.ground.clear(f.origin, 2.4);
  ctx.ground.paved(f, -1.5, 1.5, -1.3, 1.5, [C.dirt, shade(C.dirt, -0.06), shade(C.dirt, 0.05)], { cell: 0.34, lift: 0.034, seed: 5 });
  bench(k.at(-0.9, 0, -0.1, Math.PI / 2));
  bench(k.at(0.9, 0, -0.1, -Math.PI / 2));
  for (const sx of [-1, 1]) {
    stoneWall(k.at(sx * 1.55, 0, -0.9, -Math.PI / 2), 2.6, 0.5);
    flowerPatch(k.at(sx * 1.2, 0, 1.0), r, 7, 0.34, [C.blossom, C.white, C.tulip]);
    planter(k.at(sx * 1.1, 0, -0.9), true, 0.2, 0.22, C.brick);
  }
  stoneWall(k.at(1.55, 0, 1.55, Math.PI), 3.1, 0.5);
}

function dressing(ctx: Ctx, flaps: Flaps): void {
  const { b } = ctx;
  const r = b.random;
  void flaps;
  // street furniture: benches, barrels, crates, planters
  const items: [number, number, 'bench' | 'barrel' | 'crate' | 'planter' | 'pots'][] = [
    [-4.2, 1.1, 'barrel'], [-3.0, 1.15, 'planter'], [-2.6, 1.1, 'planter'], [-0.3, 1.1, 'crate'], [0.0, 1.15, 'barrel'], [1.9, 1.1, 'planter'],
    [2.2, 1.1, 'barrel'], [4.1, 1.15, 'crate'], [4.45, 1.15, 'planter'], [3.6, -1.1, 'barrel'], [4.2, -1.15, 'planter'], [-1.7, 1.12, 'planter'],
  ];
  for (const [s, v, kind] of items) {
    const kk = b.kit(frameFacingStreet(ctx, s, v));
    if (kind === 'barrel') barrel(kk, 0.6, 0.25, C.woodLight);
    else if (kind === 'crate') crate(kk, 0.45, C.plank);
    else planter(kk, true, 0.19, 0.2, C.brick);
  }
  bench(b.kit(frameFacingStreet(ctx, 1.9, -1.15)));
  mailbox(b.kit(frameAlong(ctx, -4.8, 1.18, 1)));
  // alley dressing: only low things near the walls
  for (let i = 0; i < 4; i++) {
    const kk = b.kit(frameAlong(ctx, 0.6, -1.8 - i * 0.6, 1));
    flowerPatch(kk.at(i % 2 ? 0.75 : -0.75, 0, 0), r, 3, 0.1, [C.violet, C.white]);
  }
  laundry(b.kit(frameAlong(ctx, 0.6, -5.35, 1)), 2.0, 1.6);
}

function strings(ctx: Ctx): void {
  const at = (s: number, v: number, h: number) => { const n = sd(s, v); return n.clone().multiplyScalar(groundPoint(n).length() + h); };
  for (const s of [-4.6, -2.6, -0.6, 1.4, 3.4]) {
    lanternString(ctx, at(s, 1.3, 2.8), at(s, -1.3, 2.8), 5, { glow: GLOW.oldLanterns, sag: 0.22 });
  }
  for (const s of [-3.6, 0.6, 3.9]) lanternString(ctx, at(s, 1.3, 3.15), at(s + 0.9, -1.3, 3.25), 7, { sag: 0.25, flags: true, colors: [C.red, C.yellow, C.wallBlue, C.mint, C.blossom], size: 0.1 });
}

function surroundings(ctx: Ctx): void {
  const r = ctx.b.random;
  const center = sd(0.6, -6);
  scatterDisc(ctx, center, 7.2, 20, { margin: 1.0 }, k => roundTree(k, r, { scale: 0.95 }));
  scatterDisc(ctx, center, 7.2, 18, { margin: 0.6 }, k => bush(k, r));
  scatterDisc(ctx, center, 7.2, 16, { margin: 0.3 }, k => flowerPatch(k, r, 5, 0.34));
  scatterDisc(ctx, sd(0, 0), 7.2, 70, { margin: 0.1 }, k => grassTuft(k, r));
}

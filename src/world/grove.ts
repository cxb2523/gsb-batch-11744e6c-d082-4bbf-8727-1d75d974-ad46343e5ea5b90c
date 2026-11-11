import {
  BufferAttribute, Color, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, Vector3,
} from 'three';
import { dir } from '../chapter/data';
import { glowLevel, level } from './activation';
import { anchorFrom } from './anchors';
import { housing } from './fixtures';
import type { Ctx } from './context';
import { flowerPatch, grassTuft, mushroom, rockCluster, bush, stump } from './foliage';
import { addHalo } from './halos';
import { mix, shade } from './kit';
import { slerp, sampleLine, groundAt } from './layout';
import { GLOW } from './materials';
import { C } from './palette';
import { northAt } from './frame';
import { scatterDisc } from './scatter';
import { register } from './fixtures';
import type { SocketId } from '../chapter/data';

/** The Great Tree: a huge stylized tree on a mound at the north, with three
 * big roots running toward the harbor, the workshop and the old street. Each
 * root ends in a socket; connecting it lights the root's veins and brings a
 * third of the blossoms. */

const TREE = dir(72, 0);
const TIPS: { id: SocketId; lat: number; lon: number; channel: number; group: number; hub: [number, number] }[] = [
  { id: 'root_harbor', lat: 50, lon: 0, channel: GLOW.rootHarbor, group: 0, hub: [16, -4] },
  { id: 'root_workshop', lat: 73.3, lon: 79.5, channel: GLOW.rootWorkshop, group: 1, hub: [24, 112] },
  { id: 'root_oldstreet', lat: 73.3, lon: -79.5, channel: GLOW.rootOldStreet, group: 2, hub: [21, -114] },
];

export function buildGrove(ctx: Ctx): void {
  const { b } = ctx;
  const r = b.random;
  const frame = b.placeAt(TREE, Math.PI);
  const k = b.kit(frame);
  b.greatTree = anchorFrom(TREE, dir(63, 0), 0);
  ctx.ground.clear(TREE, 2.3);

  const bark = ['#a97a52', '#bb8c5f', '#9a6c48'];
  // buttress fins and twisting trunk
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + 0.3;
    k.s.box(0.32, 1.3, 1.25, Math.cos(a) * 1.0, 0.45, Math.sin(a) * 1.0, bark[i % 3], { rot: [0, -a + Math.PI / 2, 0.0], jitter: 0.03 });
  }
  const levels = 7;
  let y = -0.2;
  for (let i = 0; i < levels; i++) {
    const r0 = 1.15 - i * 0.085, r1 = 1.15 - (i + 1) * 0.085;
    const h = 0.72;
    const ox = Math.sin(i * 0.9) * 0.1, oz = Math.cos(i * 1.3) * 0.1;
    k.s.cyl(r0, h, ox, y, oz, bark[i % 3], { seg: 9, rTop: r1, rot: [0, i * 0.33, 0], jitter: 0.03 });
    // knots / bark ridges
    k.s.box(0.18, 0.4, 0.14, Math.cos(i * 2.1) * r0 * 0.93 + ox, y + 0.35, Math.sin(i * 2.1) * r0 * 0.93 + oz, shade(C.trunk, -0.18), { rot: [0, -i * 2.1, 0], jitter: 0.03 });
    y += h * 0.92;
  }
  k.s.ball(0.12, 0.7, 1.1, 0.78, C.coal, { detail: 0, scale: [1, 1.5, 0.5] });
  // a little round door at the foot facing the harbor (south = +Z of this frame)
  k.s.box(0.42, 0.62, 0.06, 0, 0.35, 1.07, C.roofTeal, { jitter: 0 });
  k.s.ball(0.04, 0.12, 0.35, 1.11, C.brass, { detail: 0 });
  k.s.box(0.56, 0.1, 0.34, 0, 0.0, 1.22, C.stone, { jitter: 0.03 });
  k.c.cyl(1.05, 6.0, 0, -0.5, 0, undefined, { seg: 9 });

  // limbs and crown
  const top = y;
  const limbs = 6;
  const sway = { sway: 1, swayHeight: top + 3.2 };
  const leaf = [C.leafMid, C.leafLight, C.leafDark, mix(C.leafMid, C.leafLight, 0.5)];
  const canopy: { c: Vector3; rad: number }[] = [];
  const addBall = (x: number, yy: number, z: number, rad: number, i: number, detail = 1) => {
    k.f.ball(rad, x, yy, z, leaf[i % leaf.length], { ...sway, detail, scale: [1, 0.86, 1] });
    canopy.push({ c: new Vector3(x, yy, z), rad });
  };
  for (let i = 0; i < limbs; i++) {
    const a = i / limbs * Math.PI * 2 + 0.2;
    const ex = Math.cos(a) * 2.2, ez = Math.sin(a) * 2.2;
    k.s.taper(0, top - 0.6, 0, ex, top + 0.9, ez, 0.3, 0.12, bark[i % 3], { seg: 6, jitter: 0.03 });
    k.s.taper(ex * 0.5, top + 0.1, ez * 0.5, ex * 0.9 + Math.cos(a + 0.4) * 0.8, top + 1.5, ez * 0.9 + Math.sin(a + 0.4) * 0.8, 0.16, 0.06, bark[(i + 1) % 3], { seg: 5, jitter: 0.03 });
  }
  addBall(0, top + 1.6, 0, 2.0, 0);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.4;
    addBall(Math.cos(a) * 2.2, top + 1.2 + (i % 3) * 0.35, Math.sin(a) * 2.2, 1.3 + (i % 3) * 0.12, i + 1);
  }
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 1.0;
    addBall(Math.cos(a) * 1.0, top + 3.0 + (i % 2) * 0.3, Math.sin(a) * 1.0, 1.15, i + 2);
  }
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + 0.1;
    addBall(Math.cos(a) * 3.0, top + 0.5, Math.sin(a) * 3.0, 0.95, i + 3, 0);
  }
  addBall(0, top + 4.0, 0, 0.9, 1, 0);

  // blossoms in three sectors; each root brings back a third
  // each blossom belongs to the root whose direction (around the trunk) is closest
  const xAxis = new Vector3(1, 0, 0).transformDirection(frame.matrix), zAxis = new Vector3(0, 0, 1).transformDirection(frame.matrix);
  const rootAngles = TIPS.map(tip => {
    const d = dir(tip.lat, tip.lon).sub(TREE);
    return Math.atan2(d.dot(zAxis), d.dot(xAxis));
  });
  const sectorOf = (x: number, z: number) => {
    const ang = Math.atan2(z, x);
    let best = 0, bestDiff = Infinity;
    rootAngles.forEach((ra, i) => {
      const diff = Math.abs(Math.atan2(Math.sin(ang - ra), Math.cos(ang - ra)));
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  };
  const blossoms: { p: Vector3; size: number; color: Color; group: number; delay: number }[] = [];
  const pinks = [C.blossom, shade(C.blossom, 0.15), mix(C.blossom, C.wallPink, 0.5), C.white];
  for (const ball of canopy) {
    const count = 6 + Math.round(ball.rad * 2);
    for (let i = 0; i < count; i++) {
      const u = r() * Math.PI * 2, v = Math.acos(1 - r() * 1.4);
      const dirv = new Vector3(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
      const p = k.p(ball.c.x + dirv.x * ball.rad * 0.98, ball.c.y + dirv.y * ball.rad * 0.86 + 0.0, ball.c.z + dirv.z * ball.rad * 0.98);
      blossoms.push({ p, size: 0.14 + r() * 0.12, color: new Color(pinks[Math.floor(r() * pinks.length)]), group: sectorOf(ball.c.x + dirv.x, ball.c.z + dirv.z), delay: r() * 0.7 });
    }
  }
  const geometry = new IcosahedronGeometry(1, 0);
  geometry.deleteAttribute('uv');
  const vertexCount = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(vertexCount * 3).fill(1), 3));
  geometry.setAttribute('aSway', new BufferAttribute(new Float32Array(vertexCount).fill(0.8), 1));
  const mesh = new InstancedMesh(geometry, ctx.mats.foliage, blossoms.length);
  mesh.name = 'Blossoms';
  mesh.frustumCulled = false;
  const amounts = [0, 0, 0];
  const m = new Matrix4(), q = new Quaternion(), s = new Vector3();
  const write = () => {
    blossoms.forEach((bl, i) => {
      const t = Math.min(1, Math.max(0, amounts[bl.group] * 1.6 - bl.delay));
      const grow = t * t * (3 - 2 * t);
      s.setScalar(Math.max(0.0001, bl.size * grow));
      m.compose(bl.p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, bl.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  write();
  ctx.group.add(mesh);

  // hanging lanterns for the finale
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + 0.2;
    const rad = 2.6 + (i % 3) * 0.5;
    const hx = Math.cos(a) * rad, hz = Math.sin(a) * rad, hy = top + 0.55 - (i % 2) * 0.35;
    k.s.rod(hx, hy + 0.9, hz, hx, hy + 0.2, hz, 0.012, C.iron, { seg: 3, jitter: 0 });
    k.d.ball(0.16, hx, hy, hz, C.lantern, { glow: GLOW.finale, scale: [1, 1.25, 1], jitter: 0 });
    addHalo(k.p(hx, hy, hz), 0.9, GLOW.finale);
  }

  // roots with veins and the socket tips
  const tint: Record<number, [number, number, number]> = {};
  TIPS.forEach(tip => {
    const tipN = dir(tip.lat, tip.lon);
    const start = slerp(TREE, tipN, Math.min(0.2, 1.0 / (TREE.angleTo(tipN) * 14)));
    const line = sampleLine([start, slerp(start, tipN, 0.35), slerp(start, tipN, 0.7), tipN], 0.32);
    const pts: Vector3[] = [];
    line.forEach((n, i) => {
      const t = i / Math.max(1, line.length - 1);
      const side = new Vector3().crossVectors(n, northAt(n)).normalize();
      const wiggle = Math.sin(t * 7 + tip.group * 2) * 0.28 * Math.sin(t * Math.PI);
      const p = groundAt(n.clone().addScaledVector(side, wiggle / 14).normalize(), 0);
      pts.push(p);
    });
    const kw = b.worldKit('grove');
    const veinSpots: Vector3[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const t = i / pts.length;
      const rad = 0.36 * (1 - t) + 0.13 * t;
      const a = pts[i].clone().addScaledVector(pts[i].clone().normalize(), rad * 0.75);
      const c = pts[i + 1].clone().addScaledVector(pts[i + 1].clone().normalize(), rad * 0.7);
      const rad2 = 0.36 * (1 - (i + 1) / pts.length) + 0.13 * ((i + 1) / pts.length);
      kw.s.taper(a.x, a.y, a.z, c.x, c.y, c.z, rad, rad2, bark[i % 3], { seg: 7, jitter: 0.03 });
      kw.s.ball(rad * 0.98, a.x, a.y, a.z, bark[(i + 1) % 3], { detail: 0, scale: [1, 0.85, 1] });
      if (i % 2 === 1) veinSpots.push(a.clone().addScaledVector(a.clone().normalize(), rad * 0.85));
      // little side roots
      if (i % 3 === 2) {
        const out = new Vector3().crossVectors(a.clone().normalize(), c.clone().sub(a)).normalize().multiplyScalar((i % 2 ? 1 : -1) * 0.5);
        const e = a.clone().add(out);
        const g = groundAt(e.clone().normalize(), 0.06);
        kw.s.taper(a.x, a.y, a.z, g.x, g.y, g.z, rad * 0.5, rad * 0.15, bark[(i + 1) % 3], { seg: 5, jitter: 0.03 });
      }
    }
    for (const sp of veinSpots) kw.d.ball(0.07, sp.x, sp.y, sp.z, C.leafLight, { glow: tip.channel, detail: 0, jitter: 0, scale: [1, 0.6, 1] });
    // the tip: a hooked stump with the receptacle facing the district
    const tipFrame = b.placeAt(tipN, 0);
    const hubN = dir(tip.hub[0], tip.hub[1]);
    const toHub = hubN.clone().sub(tipN);
    const facing = b.kit(b.placeAt(tipN, Math.atan2(toHub.dot(new Vector3().crossVectors(northAt(tipN), tipN).normalize()), toHub.dot(northAt(tipN)))));
    void tipFrame;
    facing.s.cyl(0.24, 0.9, 0, -0.1, 0, bark[0], { seg: 7, rTop: 0.18, jitter: 0.03 });
    facing.s.ball(0.2, 0, 0.8, 0, bark[1], { detail: 1, scale: [1, 0.7, 1] });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      facing.s.rod(Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2, Math.cos(a) * 0.55, -0.02, Math.sin(a) * 0.55, 0.07, bark[(i + 2) % 3], { seg: 5 });
    }
    const hk = facing.at(0, 0, 0.06);
    const tipPos = housing(hk, 0.62, { body: '#7a5236', ring: C.brass, w: 0.34, h: 0.34, d: 0.2 });
    register(b, tip.id, hk, tipPos);
    facing.c.cyl(0.3, 1.0, 0, -0.2, 0, undefined, { seg: 7 });
    ctx.ground.clear(tipN, 0.8);
    tint[tip.group] = [0.62, 1.0, 0.32];
    const glow = glowLevel(ctx, tip.channel, [0.7, 1.15, 0.34], 1.0, 0.7);
    const amountLevel = level(ctx, v => { amounts[tip.group] = v; write(); }, 0.2);
    b.onActivate(tip.group === 0 ? 'fh' : tip.group === 1 ? 'fw' : 'fo', instant => { glow.set(1, instant); amountLevel.set(1, instant); });
  });

  // ground cover under the tree
  scatterDisc(ctx, TREE, 5.5, 20, { margin: 0.6, minHeight: 13.9 }, kk => flowerPatch(kk, r, 6, 0.3, [C.white, C.blossom, C.violet, C.yellow]));
  scatterDisc(ctx, TREE, 6, 16, { margin: 0.5, minHeight: 13.9 }, kk => mushroom(kk, r));
  scatterDisc(ctx, TREE, 6, 9, { margin: 0.7, minHeight: 13.9 }, kk => rockCluster(kk, r, 3, 0.4, 0.3));
  scatterDisc(ctx, TREE, 6, 10, { margin: 0.8, minHeight: 13.9 }, kk => bush(kk, r, { berries: C.red }));
  scatterDisc(ctx, TREE, 6, 3, { margin: 0.7, minHeight: 13.9 }, kk => stump(kk, r));
  scatterDisc(ctx, TREE, 6.5, 90, { margin: 0.1, minHeight: 13.9 }, kk => grassTuft(kk, r));
}

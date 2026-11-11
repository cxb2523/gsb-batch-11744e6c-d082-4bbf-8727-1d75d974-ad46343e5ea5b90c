import { Vector3 } from 'three';
import { FAR_HOUSE } from '../chapter/data';
import { glowLevel, level } from './activation';
import { anchorFrom } from './anchors';
import { house } from './buildings';
import type { Ctx } from './context';
import { Part, frameRoot } from './context';
import { DEG } from './frame';
import { flowerPatch, grassTuft, rockCluster } from './foliage';
import { addHalo } from './halos';
import { shade } from './kit';
import { sub } from './layout';
import { GLOW } from './materials';
import { C } from './palette';
import { mailbox, fence, lampPost } from './props';
import { scatterDisc } from './scatter';
import { dir } from '../chapter/data';

/** The lonely cottage on the back of the planet. Dark and quiet; the door is
 * locked and at the very end of the chapter a window lights and someone is
 * standing in it. */

export function buildFarHouse(ctx: Ctx): void {
  const { b } = ctx;
  const r = b.random;
  const center = dir(FAR_HOUSE.lat, FAR_HOUSE.lon);
  const frame = b.placeAt(center, 0 * DEG);
  const k = b.kit(frame);
  const wall = '#4d4d6b', roof = '#35364f', trim = '#2c2d44';
  const info = house(k, {
    w: 1.9, d: 1.6, floors: [1.75], wall, trim, roofColor: roof, roof: 'gable', ridge: 'z', rise: 0.85, overhang: 0.25,
    front: [['w', 'd']], sides: [0], back: [1], doorColor: '#23243a', glass: '#1f2133', glow: GLOW.farWindow, shutters: '#2a2b42',
    chimney: { x: 0.5, z: -0.2, color: '#3a3b57' }, base: '#55566f', doorStep: true,
  });
  void info;
  // locked door: iron straps, a padlock and a chain
  const door = k.at(0, 0, 0.8);
  const dx = 0.365;
  for (const y of [0.35, 0.85]) door.s.box(0.62, 0.07, 0.03, dx, y, 0.085, C.coal, { jitter: 0 });
  door.s.ball(0.06, dx + 0.2, 0.62, 0.12, C.brass, { detail: 0 });
  door.s.box(0.09, 0.1, 0.05, dx + 0.2, 0.55, 0.12, C.iron, { jitter: 0 });
  door.s.rod(dx - 0.25, 0.7, 0.1, dx + 0.2, 0.62, 0.12, 0.012, C.iron, { seg: 3 });
  door.s.rod(dx - 0.25, 0.7, 0.1, dx - 0.2, 0.55, 0.1, 0.012, C.iron, { seg: 3 });
  // window glow channel and the silhouette that shows up at the end
  const winX = -0.365;
  const root = frameRoot(ctx, frame);
  const figure = new Part(ctx, root, frame, new Vector3(winX, 1.06, 0.8 + 0.07), 91);
  const f = figure.kit;
  f.d.ball(0.075, 0, 0.12, 0, '#17182a', { detail: 1, jitter: 0 });
  f.d.box(0.2, 0.14, 0.05, 0, -0.02, 0, '#17182a', { jitter: 0 });
  f.d.box(0.09, 0.14, 0.05, 0.1, 0.05, 0, '#17182a', { jitter: 0, rot: [0, 0, 0.6] });
  figure.mount();
  figure.group.visible = false;
  figure.group.scale.setScalar(0.001);
  const window = glowLevel(ctx, GLOW.farWindow, [1.15, 0.8, 0.4], 1.0, 0.6);
  const show = level(ctx, v => { figure.group.visible = v > 0.01; figure.group.scale.setScalar(Math.max(0.001, v)); }, 0.7);
  b.onFinale(a => {
    const on = a > 0.85;
    window.set(on ? 1 : 0);
    show.set(on ? 1 : 0);
  });
  addHalo(k.p(winX, 1.0, 1.0), 1.4, GLOW.farWindow);

  // yard: crooked fence, mailbox, dead tree, unlit lamp, dry grass
  const gate = b.kit(sub(frame, 0, 2.6, 0));
  for (let i = 0; i < 6; i++) {
    if (i === 3) continue;
    const fk = sub(frame, -2.1 + i * 0.7 + 0.2, 2.9, (r() - 0.5) * 0.1);
    fence(b.kit(fk), 0.65, '#6a6b86', 0.5);
  }
  void gate;
  mailbox(b.kit(sub(frame, 1.3, 2.4, 0.3)), '#7a3b45');
  lampPost(b.kit(sub(frame, -1.4, 2.2, 0)), 1.5, GLOW.none, C.coal, '#33344a', true);
  // a dead tree behind the house
  const tk = b.kit(sub(frame, -1.6, -1.8, 0.5));
  tk.s.cyl(0.18, 1.6, 0, -0.05, 0, '#4c3f47', { seg: 6, rTop: 0.08, rot: [0.08, 0, 0.12], jitter: 0.03 });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    tk.s.rod(0, 1.3 + (i % 2) * 0.2, 0, Math.cos(a) * 0.9, 1.9 + (i % 3) * 0.3, Math.sin(a) * 0.9, 0.05, '#4c3f47', { seg: 4, jitter: 0.03 });
    tk.s.rod(Math.cos(a) * 0.55, 1.65, Math.sin(a) * 0.55, Math.cos(a + 0.5) * 1.05, 2.15 + (i % 2) * 0.15, Math.sin(a + 0.5) * 1.05, 0.03, '#4c3f47', { seg: 3, jitter: 0.03 });
  }
  tk.c.cyl(0.16, 1.6, 0, 0, 0, undefined, { seg: 6 });
  b.farDoor = anchorFromDoor(b.kit(frame), dx);
  ctx.ground.clear(center, 2.8);
  // ground cover: dry meadow flowers and rocks
  scatterDisc(ctx, center, 5.5, 18, { margin: 0.5 }, kk => flowerPatch(kk, r, 4, 0.3, [C.autumn, C.white]));
  scatterDisc(ctx, center, 5.5, 10, { margin: 0.5 }, kk => rockCluster(kk, r, 3, 0.5, 0.3, shade(C.rock, -0.1)));
  scatterDisc(ctx, center, 6, 80, { margin: 0.2 }, kk => grassTuft(kk, r, C.autumn));
  void anchorFrom;
}

function anchorFromDoor(k: ReturnType<Ctx['b']['kit']>, dx: number) {
  return k.anchor(dx, 0.0, 1.25, 0, 1);
}

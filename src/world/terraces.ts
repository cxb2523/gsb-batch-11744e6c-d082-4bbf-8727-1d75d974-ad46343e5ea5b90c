import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, Vector3, BufferAttribute } from 'three';
import { level } from './activation';
import type { Ctx, Kit } from './context';
import { socketPost } from './fixtures';
import { FlowGeometry } from './waterFlow';
import { shade, toColor } from './kit';
import { subDir } from './layout';
import { C, FLOWERS } from './palette';
import type { Frame } from './frame';
import { groundPoint } from './terrain';
import { planter } from './props';

/** Four flower terraces on the south-east slope: stone retaining walls, soil
 * beds, a trough on each level and a stair on the right. Flower heads are one
 * instanced mesh that blooms (staggered) when the water arrives. */

const COUNT = 4;
const DEPTH = 1.12;
const WIDTH = 3.1;
const rise = (k: number) => 0.45 - 0.15 * k;
const zOf = (k: number) => -1.7 + k * DEPTH;

export interface Terraces {
  troughEnds: Vector3[];
  flow: (g: FlowGeometry, endU: number) => void;
}

export function buildTerraces(ctx: Ctx, frame: Frame): Terraces {
  const { b } = ctx;
  const k = b.kit(frame);
  const r = b.random;
  const heads: { pos: Vector3; color: Color; size: number; delay: number }[] = [];
  const trough: Vector3[] = [];

  for (let t = 0; t < COUNT; t++) {
    const H = rise(t), z = zOf(t);
    ctx.ground.clear(subDir(frame, 0, z), 2.0);
    ctx.ground.clear(subDir(frame, 1.9, z), 0.9);
    // platform + stone face
    k.s.block(-WIDTH / 2, -1.1, z - DEPTH / 2, WIDTH / 2, H, z + DEPTH / 2, C.stone, { jitter: 0.02 });
    k.s.block(-WIDTH / 2, H - 0.02, z - DEPTH / 2 + 0.02, WIDTH / 2, H + 0.02, z + DEPTH / 2 - 0.02, '#8a6a4c', { jitter: 0.03 });
    // courses on the front face
    const n = 6;
    for (let i = 0; i < n; i++) {
      k.s.box(WIDTH / n * 0.94, 0.12, 0.05, -WIDTH / 2 + (i + 0.5) * WIDTH / n + (t % 2 ? 0.1 : -0.05), H - 0.12, z + DEPTH / 2 + 0.02, shade(C.stone, ((i + t) % 3 - 1) * 0.04), { jitter: 0.03 });
      k.s.box(WIDTH / n * 0.94, 0.12, 0.05, -WIDTH / 2 + (i + 0.5) * WIDTH / n - (t % 2 ? 0.1 : -0.05), H - 0.34, z + DEPTH / 2 + 0.02, shade(C.stoneDark, ((i + t) % 3 - 1) * 0.04), { jitter: 0.03 });
    }
    k.s.block(-WIDTH / 2 - 0.04, H, z + DEPTH / 2 - 0.1, WIDTH / 2 + 0.04, H + 0.07, z + DEPTH / 2 + 0.04, shade(C.stone, 0.1), { jitter: 0 });
    k.s.block(-WIDTH / 2 - 0.04, H, z - DEPTH / 2, -WIDTH / 2 + 0.06, H + 0.07, z + DEPTH / 2 + 0.04, shade(C.stone, 0.1), { jitter: 0 });
    k.s.block(WIDTH / 2 - 0.06, H, z - DEPTH / 2, WIDTH / 2 + 0.04, H + 0.07, z + DEPTH / 2 + 0.04, shade(C.stone, 0.1), { jitter: 0 });
    k.c.block(-WIDTH / 2, -1.1, z - DEPTH / 2, WIDTH / 2, H, z + DEPTH / 2);
    // irrigation trough along the back edge (water arrives later)
    const tz = z - DEPTH / 2 + 0.16;
    k.s.block(-1.3, H, tz - 0.14, 1.3, H + 0.045, tz + 0.14, '#5b4a3a', { jitter: 0.03 });
    for (const sz of [-1, 1]) k.s.block(-1.3, H, tz + sz * 0.14 - (sz > 0 ? 0.05 : 0), 1.3, H + 0.18, tz + sz * 0.14 + (sz > 0 ? 0 : 0.05), C.stoneDark, { jitter: 0.03 });
    for (const sx of [-1, 1]) k.s.block(sx * 1.3 - (sx > 0 ? 0.06 : 0), H, tz - 0.14, sx * 1.3 + (sx > 0 ? 0 : 0.06), H + 0.18, tz + 0.14, C.stoneDark, { jitter: 0.03 });
    trough.push(k.p(0, H + 0.11, tz));
    // beds: soil rows with flower heads
    for (let row = 0; row < 3; row++) {
      const rz = z - 0.12 + row * 0.24;
      k.s.block(-1.35, H + 0.01, rz - 0.09, 1.35, H + 0.06, rz + 0.09, '#6f523a', { jitter: 0.03 });
      for (let i = 0; i < 12; i++) {
        const x = -1.25 + (i + 0.5 + (row % 2) * 0.25) * 2.5 / 12 + (r() - 0.5) * 0.04;
        const h = 0.16 + r() * 0.1;
        k.f.cone(0.012, h, x, H + 0.04, rz, C.leafMid, { seg: 3, sway: 1, swayHeight: h + 0.05, jitter: 0.05 });
        k.f.blade(0.09, 0.09, x, H + 0.06, rz, C.leafLight, { rot: [0, r() * 6, 0.5], sway: 1, swayHeight: h, jitter: 0.04 });
        const p = k.p(x, H + 0.04 + h + 0.02, rz);
        heads.push({ pos: p, color: toColor(FLOWERS[(i + row + t) % FLOWERS.length]).clone(), size: 0.045 + r() * 0.02, delay: (t * 0.5 + (i / 12) + r() * 0.3) });
      }
    }
    // fence posts at the corners, planters
    for (const sx of [-1, 1]) k.s.box(0.07, 0.3, 0.07, sx * (WIDTH / 2 - 0.1), H + 0.15, z + DEPTH / 2 - 0.12, C.woodDark, { jitter: 0 });
  }
  // stair on the right side: rise 0.28 per step, treads 0.56
  const stepCount = COUNT - 1;
  for (const sx of [WIDTH / 2 + 0.3, -(WIDTH / 2 + 0.3)]) for (let i = 0; i <= stepCount; i++) {
    const H = rise(0) - i * 0.15;
    const z = zOf(0) - DEPTH / 2 + DEPTH / 2 + i * DEPTH;
    k.s.block(sx - 0.3, -1.0, z - DEPTH / 2, sx + 0.3, H, z + DEPTH / 2, C.stoneDark, { jitter: 0.04 });
    k.c.block(sx - 0.3, -1.0, z - DEPTH / 2, sx + 0.3, H, z + DEPTH / 2);
  }
  void planter;

  // socket on the top terrace: a valve post at the left end of the top trough
  const sockKit = b.kit(frame).at(-1.62, rise(0), zOf(0) - 0.12, Math.PI / 2);
  socketPost(b, 'garden', sockKit, { h: 0.7 });

  // flower heads: one instanced mesh with animated growth and color
  const geometry = new IcosahedronGeometry(1, 0);
  geometry.deleteAttribute('uv');
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3));
  const mesh = new InstancedMesh(geometry, ctx.mats.solid, heads.length);
  mesh.name = 'FlowerHeads';
  mesh.frustumCulled = false;
  const bud = new Color('#6e8f4f');
  const m = new Matrix4(), q = new Quaternion(), s = new Vector3();
  const state = { amount: 0 };
  const write = () => {
    heads.forEach((h, i) => {
      const t = Math.min(1, Math.max(0, state.amount * 2.2 - h.delay));
      const grow = t * t * (3 - 2 * t);
      s.setScalar(h.size * (0.35 + grow * 0.95) * (state.amount > 0 ? 1 : 0.35));
      m.compose(h.pos, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new Color().copy(bud).lerp(h.color, grow));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  write();
  ctx.group.add(mesh);
  const bloom = level(ctx, v => { state.amount = v; write(); }, 0.22);
  ctx.b.onActivate('w2', instant => bloom.set(1, instant));

  return {
    troughEnds: trough,
    flow(g, endU) {
      trough.forEach((p, t) => {
        const H = rise(t);
        void H;
        const along = new Vector3(1, 0, 0).transformDirection(frame.matrix);
        const up = p.clone().normalize();
        const side = new Vector3().crossVectors(up, along).normalize();
        const a = p.clone().addScaledVector(along, -1.2).addScaledVector(side, 0.08);
        const bb = p.clone().addScaledVector(along, 1.2).addScaledVector(side, 0.08);
        const c = p.clone().addScaledVector(along, 1.2).addScaledVector(side, -0.08);
        const d = p.clone().addScaledVector(along, -1.2).addScaledVector(side, -0.08);
        g.quad([a, d, c, bb].map(v => v.clone().addScaledVector(up, 0.0)), endU, 1, 0.16);
      });
    },
  };
}

void subDir; void groundPoint;
export type { Kit };

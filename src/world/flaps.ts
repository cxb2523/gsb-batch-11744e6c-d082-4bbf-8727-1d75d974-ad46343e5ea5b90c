import { BoxGeometry, BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ctx, Kit } from './context';
import { toColor, type ColorLike } from './kit';

/** Hinged leaves (shutters, window leaves, awning flaps) in ONE instanced
 * mesh. Each leaf is a unit slab hinged at x=0 that swings about the vertical
 * axis; opening is animated here so every house shares a single draw call. */

interface Leaf {
  hinge: Matrix4;
  w: number;
  h: number;
  /** +1 hinged on the left edge (extends +x), -1 on the right edge. */
  side: 1 | -1;
  open: number;
  rest: number;
  angle: number;
  from: number;
  to: number;
  start: number;
  duration: number;
  tag: string;
}

function leafGeometry(): BufferGeometry {
  const slab = new BoxGeometry(1, 1, 0.04).translate(0.5, 0, 0).toNonIndexed();
  const parts: BufferGeometry[] = [slab];
  for (let i = -1; i <= 1; i++) parts.push(new BoxGeometry(0.88, 0.035, 0.05).translate(0.5, i * 0.27, 0.0).toNonIndexed());
  const merged = mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; }), false)!;
  const count = merged.getAttribute('position').count;
  const color = new Float32Array(count * 3);
  const slabCount = (slab.getAttribute('position') as BufferAttribute).count;
  for (let i = 0; i < count; i++) {
    const v = i < slabCount ? 1 : 0.78;
    color.set([v, v, v], i * 3);
  }
  merged.setAttribute('color', new BufferAttribute(color, 3));
  merged.computeVertexNormals();
  return merged;
}

const easeOutBack = (t: number) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class Flaps {
  readonly mesh: InstancedMesh;
  private readonly leaves: Leaf[] = [];
  private readonly colors: Color[] = [];
  private clock = 0;
  private dirty = new Set<number>();
  private readonly scratch = new Matrix4();
  private readonly rot = new Quaternion();
  private readonly scale = new Vector3();
  private readonly unit = new Vector3(0, 1, 0);
  private mounted = false;

  constructor(private readonly ctx: Ctx, private readonly capacity = 64) {
    this.mesh = new InstancedMesh(leafGeometry(), ctx.mats.solid, capacity);
    this.mesh.name = 'Flaps';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** Add a leaf on a face kit (z=0 on the wall, +Z outward). */
  add(k: Kit, hingeX: number, hingeY: number, w: number, h: number, color: ColorLike, side: 1 | -1, tag: string, openAngle = 1.75, rest = 0): number {
    const local = new Matrix4().makeTranslation(hingeX, hingeY, 0.085);
    const base = k.s.base ? new Matrix4().multiplyMatrices(k.s.root, k.s.base) : k.s.root.clone();
    const hinge = new Matrix4().multiplyMatrices(base, local);
    const index = this.leaves.length;
    if (index >= this.capacity) throw new Error('Flaps capacity exceeded');
    this.leaves.push({ hinge, w, h, side, open: openAngle, rest, angle: rest, from: rest, to: rest, start: 0, duration: 1, tag });
    this.colors.push(toColor(color).clone());
    this.dirty.add(index);
    return index;
  }

  /** Called after all leaves are added. */
  mount(): void {
    this.mesh.count = this.leaves.length;
    this.leaves.forEach((_, i) => { this.mesh.setColorAt(i, this.colors[i]); this.write(i); });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mounted = true;
    this.ctx.group.add(this.mesh);
    // Without this, leaves only moved on instant (save-restore) sets.
    this.ctx.b.onUpdate((_time, dt) => this.update(dt));
  }

  private write(index: number): void {
    const leaf = this.leaves[index];
    const total = (leaf.side === 1 ? -leaf.angle : leaf.angle) + (leaf.side === 1 ? 0 : Math.PI);
    this.rot.setFromAxisAngle(this.unit, total);
    this.scale.set(leaf.w, leaf.h, 1);
    this.scratch.compose(new Vector3(), this.rot, this.scale);
    this.scratch.premultiply(leaf.hinge);
    this.mesh.setMatrixAt(index, this.scratch);
  }

  /** Swing every leaf with `tag` open (1) or closed (0), staggered. */
  set(tag: string, open: boolean, instant: boolean, stagger = 0.12, duration = 1.1): void {
    let n = 0;
    this.leaves.forEach((leaf, i) => {
      if (leaf.tag !== tag) return;
      leaf.from = leaf.angle;
      leaf.to = open ? leaf.open : leaf.rest;
      leaf.start = this.clock + (instant ? 0 : n * stagger);
      leaf.duration = instant ? 0.0001 : duration;
      if (instant) { leaf.angle = leaf.to; if (this.mounted) { this.write(i); this.mesh.instanceMatrix.needsUpdate = true; } }
      this.dirty.add(i);
      n++;
    });
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.dirty.size) return;
    for (const i of [...this.dirty]) {
      const leaf = this.leaves[i];
      const t = (this.clock - leaf.start) / leaf.duration;
      if (t < 0) continue;
      const k = Math.min(1, t);
      leaf.angle = leaf.from + (leaf.to - leaf.from) * (leaf.to > leaf.from ? easeOutBack(k) : k * k * (3 - 2 * k));
      this.write(i);
      if (k >= 1) { leaf.angle = leaf.to; this.write(i); this.dirty.delete(i); }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

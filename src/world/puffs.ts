import { BufferAttribute, Color, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { Ctx } from './context';

/** Rising smoke / steam puffs: one instanced mesh of soft low-poly balls that
 * grow while they climb and shrink away. Opaque so it fits the toon pipeline. */

export interface PuffOptions {
  count?: number;
  radius?: number;
  rise?: number;
  drift?: number;
  speed?: number;
  color?: string;
  seed?: number;
}

export class Puffs {
  readonly mesh: InstancedMesh;
  private amount = 0;
  private target = 0;
  private readonly up: Vector3;
  private readonly side: Vector3;
  private readonly phase: number[] = [];
  private readonly count: number;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly p = new Vector3();

  constructor(ctx: Ctx, private readonly origin: Vector3, private readonly o: PuffOptions = {}) {
    this.count = o.count ?? 6;
    const geometry = new IcosahedronGeometry(1, 1);
    geometry.deleteAttribute('uv');
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3));
    this.mesh = new InstancedMesh(geometry, ctx.mats.solid, this.count);
    this.mesh.name = 'Puffs';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    const color = new Color(o.color ?? '#f4efe6');
    let seed = (o.seed ?? 1) * 9301;
    for (let i = 0; i < this.count; i++) {
      seed = (seed * 49297 + 233280) % 233280;
      this.phase.push(i / this.count + seed / 233280 * 0.1);
      this.mesh.setColorAt(i, color);
    }
    this.up = origin.clone().normalize();
    this.side = new Vector3().crossVectors(this.up, new Vector3(0.3, 0.8, 0.5)).normalize();
    this.mesh.visible = false;
    ctx.group.add(this.mesh);
    ctx.b.onUpdate((time, dt) => this.update(time, dt));
  }

  set(on: boolean, instant = false): void {
    this.target = on ? 1 : 0;
    if (instant) this.amount = this.target;
  }

  private update(time: number, dt: number): void {
    this.amount += (this.target - this.amount) * Math.min(1, dt * 1.5);
    if (Math.abs(this.target - this.amount) < 0.002) this.amount = this.target;
    this.mesh.visible = this.amount > 0.01;
    if (!this.mesh.visible) return;
    const rise = this.o.rise ?? 1.1, radius = this.o.radius ?? 0.14, speed = this.o.speed ?? 0.35, drift = this.o.drift ?? 0.25;
    for (let i = 0; i < this.count; i++) {
      const t = (time * speed + this.phase[i]) % 1;
      const grow = 0.45 + t * 1.1;
      const fade = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      this.p.copy(this.origin).addScaledVector(this.up, t * rise).addScaledVector(this.side, Math.sin(time * 0.8 + i * 2.1) * drift * t);
      this.s.setScalar(radius * grow * Math.max(0.001, fade) * this.amount);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createToonMaterial } from '../art/toon';
import type { Cord } from './cord';
import { easeOutBack } from './path';

/** Things that grow along finished threads: paper lanterns on stakes (lights)
 * and little leaves (root). Everything is instanced (3 draw calls total) and
 * animated from a birth time, so the pulse can pre-schedule each pop. */

const LANTERN_MAX = 192;
const LEAF_MAX = 384;
export const LANTERN_SPACING = 1.1;
const LANTERN_FIRST = 1.15;
const LEAF_SPACING = 0.6;
const LEAF_FIRST = 0.7;
const END_MARGIN = 0.85;
const LANTERN_HEIGHT = 0.36;
const LANTERN_PALETTE = ['#ff9a5c', '#ffc15a', '#ff7f7a', '#ffd98a'].map(hex => new Color(hex));
const LEAF_PALETTE = ['#b4e06b', '#7fd98a', '#d3ee7c', '#5cc48a'].map(hex => new Color(hex));
const NEVER = -1e4;

function withColor(geometry: BufferGeometry, hex: string): BufferGeometry {
  const color = new Color(hex);
  const count = geometry.getAttribute('position').count;
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { values[i * 3] = color.r; values[i * 3 + 1] = color.g; values[i * 3 + 2] = color.b; }
  geometry.setAttribute('color', new BufferAttribute(values, 3));
  return geometry;
}

function lanternGeometry(): BufferGeometry {
  const body = new SphereGeometry(0.115, 10, 8).scale(1, 1.2, 1).translate(0, LANTERN_HEIGHT + 0.1, 0);
  const cap = new CylinderGeometry(0.05, 0.068, 0.05, 8).translate(0, LANTERN_HEIGHT + 0.1 + 0.14, 0);
  const tassel = new ConeGeometry(0.035, 0.1, 6).rotateX(Math.PI).translate(0, LANTERN_HEIGHT - 0.06, 0);
  const parts = [withColor(body, '#ffffff'), withColor(cap, '#6d4a3a'), withColor(tassel, '#c9573f')].map(part => {
    const flat = part.index ? part.toNonIndexed() : part;
    flat.deleteAttribute('uv');
    return flat;
  });
  return mergeGeometries(parts)!;
}

function leafGeometry(): BufferGeometry {
  // A small rounded leaf folded along its midrib; local +Y is the growth direction.
  const v = {
    B: [0, 0, 0], L1: [-0.05, 0.045, 0.004], R1: [0.05, 0.045, 0.004], L2: [-0.046, 0.105, 0.008], R2: [0.046, 0.105, 0.008],
    M0: [0, 0.05, 0.022], M1: [0, 0.11, 0.03], T: [0, 0.17, 0.016],
  } as const;
  const sway = { B: 0, L1: 0.3, R1: 0.3, L2: 0.65, R2: 0.65, M0: 0.35, M1: 0.7, T: 1 } as const;
  const tris: (keyof typeof v)[][] = [
    ['B', 'L1', 'M0'], ['B', 'M0', 'R1'], ['L1', 'L2', 'M0'], ['M0', 'L2', 'M1'],
    ['M0', 'M1', 'R2'], ['M0', 'R2', 'R1'], ['L2', 'T', 'M1'], ['M1', 'T', 'R2'],
  ];
  const positions: number[] = [], swayValues: number[] = [];
  for (const tri of tris) for (const key of tri) { positions.push(...v[key]); swayValues.push(sway[key]); }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aSway', new BufferAttribute(new Float32Array(swayValues), 1));
  geometry.computeVertexNormals();
  return geometry;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class ThreadProps {
  readonly group = new Group();
  private readonly stakes: InstancedMesh;
  private readonly lanterns: InstancedMesh;
  private readonly leaves: InstancedMesh;
  // lantern instance data
  private lanternCount = 0;
  private readonly lanternPos = new Float32Array(LANTERN_MAX * 3);
  private readonly lanternRot = new Float32Array(LANTERN_MAX * 4);
  private readonly lanternBirth = new Float32Array(LANTERN_MAX);
  private readonly lanternPhase = new Float32Array(LANTERN_MAX);
  private readonly lanternOwner = new Int16Array(LANTERN_MAX);
  // leaf instance data
  private leafCount = 0;
  private readonly leafPos = new Float32Array(LEAF_MAX * 3);
  private readonly leafRot = new Float32Array(LEAF_MAX * 4);
  private readonly leafBirth = new Float32Array(LEAF_MAX);
  private readonly leafSize = new Float32Array(LEAF_MAX);
  private readonly leafOwner = new Int16Array(LEAF_MAX);
  private leafAnimUntil = -1;
  // scratch
  private readonly p = new Float32Array(3);
  private readonly t = new Float32Array(3);
  private readonly position = new Vector3();
  private readonly up = new Vector3();
  private readonly scale = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly tilt = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly matrix = new Matrix4();
  private readonly xAxis = new Vector3(1, 0, 0);
  private readonly yAxis = new Vector3(0, 1, 0);
  private readonly basisX = new Vector3();
  private readonly basisY = new Vector3();
  private readonly basisZ = new Vector3();
  private readonly color = new Color();

  constructor() {
    this.group.name = 'ThreadProps';
    this.stakes = new InstancedMesh(
      new CylinderGeometry(0.012, 0.018, LANTERN_HEIGHT + 0.02, 5).translate(0, (LANTERN_HEIGHT + 0.02) / 2, 0),
      createToonMaterial({ color: '#7a5434', alwaysAlive: true, name: 'ThreadStake' }), LANTERN_MAX);
    this.lanterns = new InstancedMesh(
      lanternGeometry(),
      createToonMaterial({ vertexColors: true, alwaysAlive: true, emissive: 0.85, name: 'ThreadLantern' }), LANTERN_MAX);
    this.leaves = new InstancedMesh(
      leafGeometry(),
      createToonMaterial({ alwaysAlive: true, sway: true, emissive: 0.12, castShadow: false, name: 'ThreadLeaf' }), LEAF_MAX);
    for (const mesh of [this.stakes, this.lanterns, this.leaves]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.ignoreDepthPrepass = true;
      // Allocate the instance color buffer now so the shader variant never changes at runtime.
      mesh.setColorAt(0, this.color.set('#ffffff'));
      this.group.add(mesh);
    }
    this.stakes.name = 'ThreadStakes'; this.lanterns.name = 'ThreadLanterns'; this.leaves.name = 'ThreadLeaves';
  }

  get lanternTotal(): number { return this.lanternCount; }
  get leafTotal(): number { return this.leafCount; }

  clear(): void {
    this.lanternCount = 0; this.leafCount = 0; this.leafAnimUntil = -1;
    this.stakes.count = this.lanterns.count = this.leaves.count = 0;
  }

  /** Remove everything that belongs to one connection (owner = index). */
  removeOwner(owner: number): void {
    let w = 0;
    for (let r = 0; r < this.lanternCount; r++) {
      if (this.lanternOwner[r] === owner) continue;
      if (w !== r) this.copyLantern(r, w);
      w++;
    }
    this.lanternCount = w;
    w = 0;
    for (let r = 0; r < this.leafCount; r++) {
      if (this.leafOwner[r] === owner) continue;
      if (w !== r) this.copyLeaf(r, w);
      w++;
    }
    this.leafCount = w;
    this.stakes.count = this.lanterns.count = this.lanternCount;
    this.leaves.count = this.leafCount;
    this.leafAnimUntil = this.leafCount ? Number.MAX_SAFE_INTEGER : -1;
  }

  private copyLantern(from: number, to: number): void {
    for (let k = 0; k < 3; k++) this.lanternPos[to * 3 + k] = this.lanternPos[from * 3 + k];
    for (let k = 0; k < 4; k++) this.lanternRot[to * 4 + k] = this.lanternRot[from * 4 + k];
    this.lanternBirth[to] = this.lanternBirth[from]; this.lanternPhase[to] = this.lanternPhase[from]; this.lanternOwner[to] = this.lanternOwner[from];
    this.lanterns.getColorAt(from, this.color); this.lanterns.setColorAt(to, this.color);
  }

  private copyLeaf(from: number, to: number): void {
    for (let k = 0; k < 3; k++) this.leafPos[to * 3 + k] = this.leafPos[from * 3 + k];
    for (let k = 0; k < 4; k++) this.leafRot[to * 4 + k] = this.leafRot[from * 4 + k];
    this.leafBirth[to] = this.leafBirth[from]; this.leafSize[to] = this.leafSize[from]; this.leafOwner[to] = this.leafOwner[from];
    this.leaves.getColorAt(from, this.color); this.leaves.setColorAt(to, this.color);
  }

  /** Lanterns every ~1.1 units along a finished cord. `birthAt(distance)` gives
   * the absolute time each one pops (NEVER-ish for restored threads). */
  addLanterns(owner: number, cord: Cord, birthAt: (distance: number) => number): number {
    const length = cord.length;
    let added = 0;
    for (let d = LANTERN_FIRST, k = 0; d < length - END_MARGIN && this.lanternCount < LANTERN_MAX; d += LANTERN_SPACING, k++) {
      cord.pointAt(d, this.p, this.t);
      const i = this.lanternCount++;
      this.lanternPos[i * 3] = this.p[0]; this.lanternPos[i * 3 + 1] = this.p[1]; this.lanternPos[i * 3 + 2] = this.p[2];
      this.up.set(this.p[0], this.p[1], this.p[2]).normalize();
      this.quaternion.setFromUnitVectors(this.yAxis, this.up);
      this.spin.setFromAxisAngle(this.yAxis, hash(owner * 97 + k) * Math.PI * 2);
      this.quaternion.multiply(this.spin);
      this.lanternRot[i * 4] = this.quaternion.x; this.lanternRot[i * 4 + 1] = this.quaternion.y;
      this.lanternRot[i * 4 + 2] = this.quaternion.z; this.lanternRot[i * 4 + 3] = this.quaternion.w;
      this.lanternBirth[i] = birthAt(d);
      this.lanternPhase[i] = hash(owner * 31 + k * 7) * Math.PI * 2;
      this.lanternOwner[i] = owner;
      this.lanterns.setColorAt(i, LANTERN_PALETTE[(k + owner) % LANTERN_PALETTE.length]);
      added++;
    }
    this.stakes.count = this.lanterns.count = this.lanternCount;
    if (this.lanterns.instanceColor) this.lanterns.instanceColor.needsUpdate = true;
    return added;
  }

  /** Leaves alternating sides along a finished cord. */
  addLeaves(owner: number, cord: Cord, birthAt: (distance: number) => number): number {
    const length = cord.length;
    let added = 0;
    for (let d = LEAF_FIRST, k = 0; d < length - END_MARGIN * 0.7 && this.leafCount < LEAF_MAX; d += LEAF_SPACING * (0.85 + hash(owner * 13 + k) * 0.3), k++) {
      cord.pointAt(d, this.p, this.t);
      const i = this.leafCount++;
      this.up.set(this.p[0], this.p[1], this.p[2]).normalize();
      this.basisX.set(this.t[0], this.t[1], this.t[2]);
      const side = (k % 2 === 0 ? 1 : -1);
      // side = tangent × up (flipped per leaf); growth direction leans outward and up
      this.basisZ.crossVectors(this.basisX, this.up).normalize().multiplyScalar(side);
      this.basisY.copy(this.up).multiplyScalar(0.72).addScaledVector(this.basisZ, 0.69).normalize();
      this.basisX.addScaledVector(this.basisY, -this.basisX.dot(this.basisY)).normalize();
      this.basisZ.crossVectors(this.basisX, this.basisY).normalize();
      this.matrix.makeBasis(this.basisX, this.basisY, this.basisZ);
      this.quaternion.setFromRotationMatrix(this.matrix);
      // Slight random roll so the leaves do not look stamped.
      this.spin.setFromAxisAngle(this.yAxis, (hash(owner * 53 + k) - 0.5) * 0.9);
      this.quaternion.multiply(this.spin);
      this.leafPos[i * 3] = this.p[0] + this.up.x * 0.012; this.leafPos[i * 3 + 1] = this.p[1] + this.up.y * 0.012; this.leafPos[i * 3 + 2] = this.p[2] + this.up.z * 0.012;
      this.leafRot[i * 4] = this.quaternion.x; this.leafRot[i * 4 + 1] = this.quaternion.y;
      this.leafRot[i * 4 + 2] = this.quaternion.z; this.leafRot[i * 4 + 3] = this.quaternion.w;
      this.leafBirth[i] = birthAt(d) + hash(owner * 7 + k * 3) * 0.35;
      this.leafSize[i] = 1.1 + hash(owner * 29 + k) * 0.6;
      this.leafOwner[i] = owner;
      this.leaves.setColorAt(i, LEAF_PALETTE[(k * 3 + owner) % LEAF_PALETTE.length]);
      added++;
    }
    this.leaves.count = this.leafCount;
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    this.leafAnimUntil = Number.MAX_SAFE_INTEGER;
    return added;
  }

  update(now: number): void {
    if (this.lanternCount) {
      for (let i = 0; i < this.lanternCount; i++) {
        const u = (now - this.lanternBirth[i]) / 0.5;
        const grow = u <= 0 ? 0.0001 : u >= 1 ? 1 : Math.max(0.0001, easeOutBack(u));
        this.position.set(this.lanternPos[i * 3], this.lanternPos[i * 3 + 1], this.lanternPos[i * 3 + 2]);
        this.quaternion.set(this.lanternRot[i * 4], this.lanternRot[i * 4 + 1], this.lanternRot[i * 4 + 2], this.lanternRot[i * 4 + 3]);
        const phase = this.lanternPhase[i];
        // The stake leans a hair in the breeze; the lantern bobs on it.
        this.tilt.setFromAxisAngle(this.xAxis, Math.sin(now * 1.25 + phase) * 0.05 * grow);
        this.quaternion.multiply(this.tilt);
        this.scale.setScalar(grow);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.stakes.setMatrixAt(i, this.matrix);
        const bob = Math.sin(now * 1.7 + phase) * 0.03 * grow;
        this.up.set(0, bob, 0).applyQuaternion(this.quaternion);
        this.position.add(this.up);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.lanterns.setMatrixAt(i, this.matrix);
      }
      this.stakes.instanceMatrix.needsUpdate = true;
      this.lanterns.instanceMatrix.needsUpdate = true;
    }
    if (this.leafCount && now < this.leafAnimUntil) {
      let animating = false;
      for (let i = 0; i < this.leafCount; i++) {
        const u = (now - this.leafBirth[i]) / 0.55;
        if (u < 1) animating = true;
        const grow = (u <= 0 ? 0.0001 : u >= 1 ? 1 : Math.max(0.0001, easeOutBack(u))) * this.leafSize[i];
        this.position.set(this.leafPos[i * 3], this.leafPos[i * 3 + 1], this.leafPos[i * 3 + 2]);
        this.quaternion.set(this.leafRot[i * 4], this.leafRot[i * 4 + 1], this.leafRot[i * 4 + 2], this.leafRot[i * 4 + 3]);
        this.scale.setScalar(grow);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.leaves.setMatrixAt(i, this.matrix);
      }
      this.leaves.instanceMatrix.needsUpdate = true;
      if (!animating) this.leafAnimUntil = -1;
    }
  }
}

/** Birth time for props that are already grown (restored threads). */
export const GROWN = NEVER;

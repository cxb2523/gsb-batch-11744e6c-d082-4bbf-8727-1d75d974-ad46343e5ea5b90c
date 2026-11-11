import {
  BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Euler, Matrix3, Matrix4, Mesh, Quaternion, Sphere, Vector3,
  type ShaderMaterial,
} from 'three';

/** Rig + rigid CPU skinning.
 *
 * Every character is a hierarchy of `Bone`s (pivots with a rest offset and an
 * animated rotation/scale/offset). All geometry of a character is authored in
 * bone-local space, merged once, and rewritten on the CPU every frame by the
 * bones' matrices (each vertex follows exactly one bone: "segmented" rigid
 * parts, no weights). A whole character therefore costs only a handful of draw
 * calls (one per material channel) instead of one per limb, which matters
 * because the ink renderer draws every mesh again for depth and shadows. */

export type EulerOrder = 'XZY' | 'YXZ' | 'XYZ' | 'ZXY';

export class Bone {
  readonly children: Bone[] = [];
  /** Current local translation (rest + pose offset). */
  readonly pos = new Vector3();
  rx = 0; ry = 0; rz = 0;
  sx = 1; sy = 1; sz = 1;
  readonly local = new Matrix4();
  /** Matrix from this bone's local space to the character root space. */
  readonly world = new Matrix4();
  /** Procedural override of `world`, run after the hierarchy (strings, links). */
  solve?: (rig: Rig) => void;
  private readonly euler = new Euler();
  private readonly quaternion = new Quaternion();
  private readonly scaleVector = new Vector3();
  constructor(
    readonly name: string,
    readonly index: number,
    readonly parent: Bone | null,
    readonly rest: Vector3,
    readonly order: EulerOrder,
  ) {
    this.pos.copy(rest);
  }
  /** Rebuild local/world from the current channel values. */
  update(): void {
    this.euler.set(this.rx, this.ry, this.rz, this.order);
    this.quaternion.setFromEuler(this.euler);
    this.scaleVector.set(this.sx, this.sy, this.sz);
    this.local.compose(this.pos, this.quaternion, this.scaleVector);
    if (this.parent) this.world.multiplyMatrices(this.parent.world, this.local);
    else this.world.copy(this.local);
  }
}

/** Flat pose storage: per bone [px,py,pz, rx,ry,rz, sx,sy,sz]. Position is an
 * offset from the bone's rest position; rotation is absolute; scale is absolute. */
export const POSE_STRIDE = 9;

export class Pose {
  readonly d: Float32Array;
  constructor(readonly count: number) {
    this.d = new Float32Array(count * POSE_STRIDE);
    this.reset();
  }
  reset(): this {
    this.d.fill(0);
    for (let i = 0; i < this.count; i++) { const o = i * POSE_STRIDE; this.d[o + 6] = this.d[o + 7] = this.d[o + 8] = 1; }
    return this;
  }
  copy(other: Pose): this { this.d.set(other.d); return this; }
  rot(bone: number, x: number, y: number, z: number): this { const o = bone * POSE_STRIDE; this.d[o + 3] = x; this.d[o + 4] = y; this.d[o + 5] = z; return this; }
  rotX(bone: number, x: number): this { this.d[bone * POSE_STRIDE + 3] = x; return this; }
  rotY(bone: number, y: number): this { this.d[bone * POSE_STRIDE + 4] = y; return this; }
  rotZ(bone: number, z: number): this { this.d[bone * POSE_STRIDE + 5] = z; return this; }
  /** Move the rotation toward (x, y, z) by `weight`. */
  mixRot(bone: number, x: number, y: number, z: number, weight: number): this {
    const o = bone * POSE_STRIDE + 3;
    this.d[o] += (x - this.d[o]) * weight; this.d[o + 1] += (y - this.d[o + 1]) * weight; this.d[o + 2] += (z - this.d[o + 2]) * weight;
    return this;
  }
  addRot(bone: number, x: number, y: number, z: number): this { const o = bone * POSE_STRIDE; this.d[o + 3] += x; this.d[o + 4] += y; this.d[o + 5] += z; return this; }
  pos(bone: number, x: number, y: number, z: number): this { const o = bone * POSE_STRIDE; this.d[o] = x; this.d[o + 1] = y; this.d[o + 2] = z; return this; }
  addPos(bone: number, x: number, y: number, z: number): this { const o = bone * POSE_STRIDE; this.d[o] += x; this.d[o + 1] += y; this.d[o + 2] += z; return this; }
  scale(bone: number, x: number, y: number, z: number): this { const o = bone * POSE_STRIDE; this.d[o + 6] = x; this.d[o + 7] = y; this.d[o + 8] = z; return this; }
  getRotX(bone: number): number { return this.d[bone * POSE_STRIDE + 3]; }
  getRotZ(bone: number): number { return this.d[bone * POSE_STRIDE + 5]; }
  /** this += weight * (target - base). Additive-delta blending of a full pose. */
  blendDelta(target: Pose, base: Pose, weight: number): this {
    if (weight <= 1e-4) return this;
    const d = this.d, t = target.d, b = base.d;
    for (let i = 0; i < d.length; i++) d[i] += weight * (t[i] - b[i]);
    return this;
  }
}

export class Rig {
  readonly bones: Bone[] = [];
  readonly ix: Record<string, number> = {};
  add(name: string, parent: Bone | null, rest: readonly [number, number, number] = [0, 0, 0], order: EulerOrder = 'XZY'): Bone {
    if (this.ix[name] !== undefined) throw new Error(`Duplicate bone ${name}`);
    const bone = new Bone(name, this.bones.length, parent, new Vector3(...rest), order);
    this.bones.push(bone);
    this.ix[name] = bone.index;
    parent?.children.push(bone);
    return bone;
  }
  bone(name: string): Bone {
    const index = this.ix[name];
    if (index === undefined) throw new Error(`Unknown bone ${name}`);
    return this.bones[index];
  }
  makePose(): Pose { return new Pose(this.bones.length); }
  /** Apply a pose to the bones and recompute every world matrix. */
  apply(pose: Pose): void {
    const d = pose.d;
    for (const bone of this.bones) {
      const o = bone.index * POSE_STRIDE;
      bone.pos.set(bone.rest.x + d[o], bone.rest.y + d[o + 1], bone.rest.z + d[o + 2]);
      bone.rx = d[o + 3]; bone.ry = d[o + 4]; bone.rz = d[o + 5];
      bone.sx = d[o + 6]; bone.sy = d[o + 7]; bone.sz = d[o + 8];
      bone.update();
      bone.solve?.(this);
    }
  }
}

export interface Raw {
  /** Positions xyz. */
  p: number[];
  /** Normals xyz. */
  n: number[];
  /** Triangle indices. */
  i: number[];
  /** Optional per-vertex linear rgb (multiplied with the part color). */
  c?: number[];
}

export type ChannelName = 'body' | 'ink' | 'thread';

class Channel {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly c: number[] = [];
  readonly b: number[] = [];
  readonly i: number[] = [];
}

const tmpPosition = new Vector3();
const tmpNormal = new Vector3();
const tmpMatrix = new Matrix4();
const tmpNormalMatrix = new Matrix3();
const tmpColor = new Color();

export interface Place {
  at?: readonly [number, number, number];
  rot?: readonly [number, number, number];
  scale?: readonly [number, number, number] | number;
}

export function placeMatrix(place: Place = {}, out = new Matrix4()): Matrix4 {
  const euler = new Euler(...(place.rot ?? [0, 0, 0]), 'YXZ');
  const scale = typeof place.scale === 'number' ? new Vector3(place.scale, place.scale, place.scale) : new Vector3(...(place.scale ?? [1, 1, 1]));
  return out.compose(new Vector3(...(place.at ?? [0, 0, 0])), new Quaternion().setFromEuler(euler), scale);
}

/** Collects parts (geometry bound to one bone) and bakes them into meshes. */
export class SkinBuilder {
  private readonly channels = new Map<ChannelName, Channel>();
  constructor(readonly rig: Rig) {}

  private channel(name: ChannelName): Channel {
    let channel = this.channels.get(name);
    if (!channel) { channel = new Channel(); this.channels.set(name, channel); }
    return channel;
  }

  /** Append raw geometry (bone-local space) to a channel. */
  add(channel: ChannelName, bone: Bone | string, raw: Raw, color: string | number | Color, place?: Place): void {
    const target = this.channel(channel);
    const boneIndex = typeof bone === 'string' ? this.rig.ix[bone] : bone.index;
    if (boneIndex === undefined) throw new Error(`Unknown bone ${String(bone)}`);
    const matrix = placeMatrix(place, tmpMatrix);
    tmpNormalMatrix.getNormalMatrix(matrix);
    const base = target.p.length / 3;
    tmpColor.set(color as Color);
    for (let v = 0; v < raw.p.length; v += 3) {
      tmpPosition.set(raw.p[v], raw.p[v + 1], raw.p[v + 2]).applyMatrix4(matrix);
      target.p.push(tmpPosition.x, tmpPosition.y, tmpPosition.z);
      tmpNormal.set(raw.n[v], raw.n[v + 1], raw.n[v + 2]).applyMatrix3(tmpNormalMatrix).normalize();
      target.n.push(tmpNormal.x, tmpNormal.y, tmpNormal.z);
      if (raw.c) target.c.push(tmpColor.r * raw.c[v], tmpColor.g * raw.c[v + 1], tmpColor.b * raw.c[v + 2]);
      else target.c.push(tmpColor.r, tmpColor.g, tmpColor.b);
      target.b.push(boneIndex);
    }
    for (const index of raw.i) target.i.push(base + index);
  }

  /** Bake every channel into a skinned mesh. */
  build(materials: Partial<Record<ChannelName, ShaderMaterial>>, bounds: Sphere): SkinMesh[] {
    const meshes: SkinMesh[] = [];
    for (const [name, channel] of this.channels) {
      const material = materials[name];
      if (!material || !channel.p.length) continue;
      meshes.push(new SkinMesh(name, channel, material, this.rig, bounds));
    }
    return meshes;
  }
}

/** One draw call whose vertices are rigidly bound to bones. */
export class SkinMesh {
  readonly mesh: Mesh;
  private readonly rest: Float32Array;
  private readonly restNormal: Float32Array;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  /** vertex ranges per bone index: [start, count] */
  private readonly ranges: Int32Array;
  private readonly previous: Float32Array;
  private first = true;
  readonly vertexCount: number;
  readonly triangleCount: number;

  constructor(readonly channel: ChannelName, source: Channel, material: ShaderMaterial, private readonly rig: Rig, bounds: Sphere) {
    const count = source.p.length / 3;
    this.vertexCount = count;
    this.triangleCount = source.i.length / 3;
    const boneCount = rig.bones.length;
    // Sort vertices by bone so each bone's matrix is loaded once per frame.
    const counts = new Int32Array(boneCount);
    for (const bone of source.b) counts[bone]++;
    const starts = new Int32Array(boneCount);
    let acc = 0;
    for (let b = 0; b < boneCount; b++) { starts[b] = acc; acc += counts[b]; }
    this.ranges = new Int32Array(boneCount * 2);
    for (let b = 0; b < boneCount; b++) { this.ranges[b * 2] = starts[b]; this.ranges[b * 2 + 1] = counts[b]; }
    const cursor = starts.slice();
    const remap = new Uint32Array(count);
    this.rest = new Float32Array(count * 3);
    this.restNormal = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      const target = cursor[source.b[v]]++;
      remap[v] = target;
      this.rest.set([source.p[v * 3], source.p[v * 3 + 1], source.p[v * 3 + 2]], target * 3);
      this.restNormal.set([source.n[v * 3], source.n[v * 3 + 1], source.n[v * 3 + 2]], target * 3);
      colors.set([source.c[v * 3], source.c[v * 3 + 1], source.c[v * 3 + 2]], target * 3);
    }
    const IndexArray = count > 65535 ? Uint32Array : Uint16Array;
    const index = new IndexArray(source.i.length);
    for (let k = 0; k < source.i.length; k++) index[k] = remap[source.i[k]];
    this.positions = this.rest.slice();
    this.normals = this.restNormal.slice();
    this.previous = new Float32Array(boneCount * 12).fill(Number.NaN);
    const geometry = new BufferGeometry();
    const position = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    const normal = new BufferAttribute(this.normals, 3).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('normal', normal);
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.boundingSphere = bounds.clone();
    geometry.boundingBox = null;
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = `Skin:${channel}`;
    this.mesh.matrixAutoUpdate = false;
  }

  /** Re-skin from the rig's current world matrices; skips bones that did not move. */
  update(): void {
    const { rest, restNormal, positions, normals, ranges, previous } = this;
    let changed = false;
    for (let b = 0; b < this.rig.bones.length; b++) {
      const count = ranges[b * 2 + 1];
      if (!count) continue;
      const m = this.rig.bones[b].world.elements;
      const o = b * 12;
      if (!this.first && previous[o] === m[0] && previous[o + 1] === m[1] && previous[o + 2] === m[2] && previous[o + 3] === m[4] &&
        previous[o + 4] === m[5] && previous[o + 5] === m[6] && previous[o + 6] === m[8] && previous[o + 7] === m[9] &&
        previous[o + 8] === m[10] && previous[o + 9] === m[12] && previous[o + 10] === m[13] && previous[o + 11] === m[14]) continue;
      previous[o] = m[0]; previous[o + 1] = m[1]; previous[o + 2] = m[2]; previous[o + 3] = m[4]; previous[o + 4] = m[5]; previous[o + 5] = m[6];
      previous[o + 6] = m[8]; previous[o + 7] = m[9]; previous[o + 8] = m[10]; previous[o + 9] = m[12]; previous[o + 10] = m[13]; previous[o + 11] = m[14];
      changed = true;
      const m0 = m[0], m1 = m[1], m2 = m[2], m4 = m[4], m5 = m[5], m6 = m[6], m8 = m[8], m9 = m[9], m10 = m[10], m12 = m[12], m13 = m[13], m14 = m[14];
      const start = ranges[b * 2];
      const end = start + count;
      for (let v = start; v < end; v++) {
        const i = v * 3;
        const x = rest[i], y = rest[i + 1], z = rest[i + 2];
        positions[i] = m0 * x + m4 * y + m8 * z + m12;
        positions[i + 1] = m1 * x + m5 * y + m9 * z + m13;
        positions[i + 2] = m2 * x + m6 * y + m10 * z + m14;
        const nx = restNormal[i], ny = restNormal[i + 1], nz = restNormal[i + 2];
        const ax = m0 * nx + m4 * ny + m8 * nz, ay = m1 * nx + m5 * ny + m9 * nz, az = m2 * nx + m6 * ny + m10 * nz;
        const inv = 1 / (Math.hypot(ax, ay, az) || 1);
        normals[i] = ax * inv; normals[i + 1] = ay * inv; normals[i + 2] = az * inv;
      }
    }
    this.first = false;
    if (changed) {
      const geometry = this.mesh.geometry;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.normal.needsUpdate = true;
    }
  }

  dispose(): void { this.mesh.geometry.dispose(); }
}

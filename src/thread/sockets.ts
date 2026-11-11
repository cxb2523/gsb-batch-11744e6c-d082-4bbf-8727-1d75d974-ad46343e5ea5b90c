import {
  Color, ConeGeometry, CylinderGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4,
  Quaternion, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createToonMaterial } from '../art/toon';
import type { SurfaceAnchor } from '../contracts';
import { createBeamMaterial } from './shaders';
import { easeOutCubic } from './path';

/** Highlight visuals at socket anchors (the world draws the fixture itself):
 * a halo ring, a floating arrow and a soft light column per socket, all
 * instanced (3 draw calls for every socket). */

export const SocketMode = { dim: 0, source: 1, target: 2, connected: 3, held: 4 } as const;

const BEAM_HEIGHT = 2.6;
const DIM = new Color('#8d8fa0');
const REJECT = new Color('#e8505b');

interface Look { tint: number; arrow: number; beam: number; ring: number; bright: number }
const LOOKS: Look[] = [
  /* dim */ { tint: 0, arrow: 0, beam: 0, ring: 0.62, bright: 0.5 },
  /* source */ { tint: 1, arrow: 1, beam: 0.42, ring: 1, bright: 1 },
  /* target */ { tint: 1, arrow: 1.3, beam: 1, ring: 1.2, bright: 1.25 },
  /* connected */ { tint: 1, arrow: 0, beam: 0.16, ring: 0.92, bright: 1 },
  /* held */ { tint: 1, arrow: 0, beam: 0, ring: 0.8, bright: 0.9 },
];

export class SocketHighlights {
  readonly group = new Group();
  /** One mode per socket (index = order of `ids`); set by the thread system. */
  readonly modes: Uint8Array;
  private readonly rings: InstancedMesh;
  private readonly arrows: InstancedMesh;
  private readonly beams: InstancedMesh;
  private readonly levels: InstancedBufferAttribute;
  private readonly count: number;
  private readonly base: Vector3[];
  private readonly up: Vector3[];
  private readonly orientation: Quaternion[];
  private readonly tints: Color[];
  private readonly phase: Float32Array;
  private readonly tint: Float32Array;
  private readonly arrow: Float32Array;
  private readonly beam: Float32Array;
  private readonly ring: Float32Array;
  private readonly bright: Float32Array;
  private readonly popAt: Float32Array;
  private readonly rejectAt: Float32Array;
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly yAxis = new Vector3(0, 1, 0);

  constructor(anchors: readonly SurfaceAnchor[], tints: readonly string[]) {
    this.count = anchors.length;
    this.modes = new Uint8Array(this.count);
    this.base = anchors.map(anchor => anchor.position.clone());
    this.up = anchors.map(anchor => (anchor.normal.lengthSq() > 0.5 ? anchor.normal : anchor.position).clone().normalize());
    this.orientation = this.up.map(normal => new Quaternion().setFromUnitVectors(this.yAxis, normal));
    this.tints = tints.map(hex => new Color(hex));
    this.phase = Float32Array.from({ length: this.count }, (_, i) => (i * 2.399) % (Math.PI * 2));
    this.tint = new Float32Array(this.count);
    this.arrow = new Float32Array(this.count);
    this.beam = new Float32Array(this.count);
    this.ring = new Float32Array(this.count);
    this.bright = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.applyLook(i, LOOKS[0], 1);
    this.popAt = new Float32Array(this.count).fill(-10);
    this.rejectAt = new Float32Array(this.count).fill(-10);

    const arrowHead = new ConeGeometry(0.1, 0.2, 5).rotateX(Math.PI).translate(0, 0.1, 0);
    const arrowShaft = new CylinderGeometry(0.036, 0.036, 0.17, 5).translate(0, 0.285, 0);
    const arrowParts = [arrowHead, arrowShaft].map(part => { const flat = part.toNonIndexed(); flat.deleteAttribute('uv'); return flat; });
    this.rings = new InstancedMesh(
      new TorusGeometry(0.3, 0.034, 5, 22).rotateX(Math.PI / 2),
      createToonMaterial({ alwaysAlive: true, emissive: 0.55, castShadow: false, name: 'SocketRing' }), this.count);
    this.arrows = new InstancedMesh(
      mergeGeometries(arrowParts)!,
      createToonMaterial({ alwaysAlive: true, emissive: 0.5, castShadow: false, name: 'SocketArrow' }), this.count);
    this.beams = new InstancedMesh(
      new CylinderGeometry(0.07, 0.2, BEAM_HEIGHT, 10, 1, true).translate(0, BEAM_HEIGHT / 2, 0),
      createBeamMaterial(BEAM_HEIGHT), this.count);
    this.levels = new InstancedBufferAttribute(new Float32Array(this.count), 1);
    this.beams.geometry.setAttribute('aLevel', this.levels);
    this.beams.geometry.setAttribute('aPhase', new InstancedBufferAttribute(this.phase.slice(), 1));
    for (const mesh of [this.rings, this.arrows, this.beams]) {
      mesh.frustumCulled = false;
      mesh.userData.ignoreDepthPrepass = true;
      mesh.setColorAt(0, this.color.set('#ffffff'));
      this.group.add(mesh);
    }
    this.rings.name = 'SocketRings'; this.arrows.name = 'SocketArrows'; this.beams.name = 'SocketBeams';
    this.update(0, 1);
  }

  private applyLook(i: number, look: Look, k: number): void {
    this.tint[i] += (look.tint - this.tint[i]) * k;
    this.arrow[i] += (look.arrow - this.arrow[i]) * k;
    this.beam[i] += (look.beam - this.beam[i]) * k;
    this.ring[i] += (look.ring - this.ring[i]) * k;
    this.bright[i] += (look.bright - this.bright[i]) * k;
  }

  /** A burst ring at the socket (thread pickup / snap). */
  pop(index: number, now: number): void { this.popAt[index] = now; }
  /** A red wobble: the thread does not go here. */
  reject(index: number, now: number): void { this.rejectAt[index] = now; }

  update(now: number, dt: number): void {
    const ease = 1 - Math.exp(-Math.min(dt, 0.1) * 7);
    for (let i = 0; i < this.count; i++) {
      const mode = this.modes[i];
      this.applyLook(i, LOOKS[mode], dt >= 1 ? 1 : ease);
      let ringScale = this.ring[i], bright = this.bright[i], beam = this.beam[i];
      let bob = 0.34;
      if (mode === SocketMode.source) {
        const s = Math.sin(now * 2.3 + this.phase[i]);
        ringScale *= 1 + 0.09 * s; bright *= 0.86 + 0.14 * s; beam *= 0.8 + 0.2 * s; bob += 0.06 * Math.sin(now * 3.1 + this.phase[i]);
      } else if (mode === SocketMode.target) {
        const s = Math.sin(now * 6 + this.phase[i]);
        ringScale *= 1 + 0.2 * s; bright *= 0.82 + 0.18 * s; beam *= 0.82 + 0.18 * s; bob += 0.1 * Math.sin(now * 5.5 + this.phase[i]);
      }
      const pop = (now - this.popAt[i]) / 0.38;
      if (pop >= 0 && pop < 1) { ringScale *= 1 + 1.1 * easeOutCubic(pop); bright *= 1.5 * (1 - pop) + pop * 0.6; }
      const reject = (now - this.rejectAt[i]) / 0.55;
      let flash = 0;
      if (reject >= 0 && reject < 1) { ringScale *= 1 + 0.24 * Math.sin(reject * 30) * (1 - reject); flash = 1 - reject; }

      this.position.copy(this.base[i]);
      this.scale.setScalar(Math.max(1e-4, ringScale));
      this.matrix.compose(this.position, this.orientation[i], this.scale);
      this.rings.setMatrixAt(i, this.matrix);
      this.color.copy(DIM).lerp(this.tints[i], this.tint[i]);
      if (flash > 0) this.color.lerp(REJECT, flash);
      this.color.multiplyScalar(bright);
      this.rings.setColorAt(i, this.color);
      this.arrows.setColorAt(i, this.color.copy(this.tints[i]).multiplyScalar(Math.max(1, bright)));

      this.position.copy(this.base[i]).addScaledVector(this.up[i], bob);
      this.scale.setScalar(Math.max(1e-4, this.arrow[i]));
      this.matrix.compose(this.position, this.orientation[i], this.scale);
      this.arrows.setMatrixAt(i, this.matrix);

      this.position.copy(this.base[i]).addScaledVector(this.up[i], 0.08);
      this.scale.setScalar(1);
      this.matrix.compose(this.position, this.orientation[i], this.scale);
      this.beams.setMatrixAt(i, this.matrix);
      this.beams.setColorAt(i, this.tints[i]);
      this.levels.setX(i, beam);
    }
    this.rings.instanceMatrix.needsUpdate = this.arrows.instanceMatrix.needsUpdate = this.beams.instanceMatrix.needsUpdate = true;
    this.rings.instanceColor!.needsUpdate = this.arrows.instanceColor!.needsUpdate = this.beams.instanceColor!.needsUpdate = true;
    this.levels.needsUpdate = true;
  }
}

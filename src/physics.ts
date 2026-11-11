import {
  Box3, BufferAttribute, BufferGeometry, DoubleSide, Line3, Mesh, MeshBasicMaterial, Raycaster, Vector3,
} from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { parallelTransport, sphereTangent } from './sphere';

const FIXED_DT = 1 / 60;
const SKIN = 0.0003;
// A resting capsule still touches a floor without penetrating it.
const CONTACT_SLOP = 0.002;
const FLOOR_INCLINATION = 0.7;

export interface CourierMotion {
  direction: Vector3;
  amount: number;
  sprint: boolean;
  /** A queued edge, rather than a held key. */
  jump: boolean;
}

export interface Support {
  point: Vector3;
  normal: Vector3;
  distance: number;
}

/** One world-space BVH, including all floors, bridges, walls and ceilings.
 * No surface is classified by radius before the character reaches it. */
export class CollisionWorld {
  readonly mesh: Mesh;
  readonly tree: MeshBVH;
  private readonly raycaster = new Raycaster();
  private readonly segment = new Line3();
  private readonly bounds = new Box3();
  private readonly trianglePoint = new Vector3();
  private readonly capsulePoint = new Vector3();
  private readonly correction = new Vector3();
  private readonly faceNormal = new Vector3();

  constructor(meshes: Mesh[]) {
    const positions: number[] = [];
    const indices: number[] = [];
    const vertex = new Vector3();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const position = mesh.geometry.getAttribute('position');
      const offset = positions.length / 3;
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
      const index = mesh.geometry.index;
      const count = index?.count ?? position.count;
      for (let i = 0; i < count; i++) indices.push(offset + (index ? index.getX(i) : i));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(indices);
    this.tree = new MeshBVH(geometry, { targetLeafSize: 12 });
    geometry.boundsTree = this.tree;
    this.mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
    this.mesh.raycast = acceleratedRaycast;
    this.mesh.updateMatrixWorld();
    this.raycaster.firstHitOnly = true;
  }

  /** Interaction must see the other character, including across vertically stacked floors. */
  hasLineOfSight(from: Vector3, to: Vector3, margin = 0.08): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= margin) return true;
    this.raycaster.set(from, direction.multiplyScalar(1 / distance));
    this.raycaster.near = 0.01;
    this.raycaster.far = Math.max(0, distance - margin);
    return this.raycaster.intersectObject(this.mesh, false).length === 0;
  }

  supportAt(origin: Vector3, up: Vector3, maxDistance: number): Support | null {
    this.raycaster.set(origin, up.clone().negate());
    this.raycaster.near = 0;
    this.raycaster.far = maxDistance;
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!hit?.face) return null;
    return { point: hit.point, normal: hit.face.normal.clone(), distance: hit.distance };
  }

  /** Full 3D depenetration: moving only tangentially would discard floor/ceiling contact. */
  resolve(position: Vector3, up: Vector3, height: number, radius: number, velocity: Vector3): Vector3 | null {
    let floor: Vector3 | null = null;
    for (let iteration = 0; iteration < 5; iteration++) {
      this.segment.start.copy(position).addScaledVector(up, radius);
      this.segment.end.copy(position).addScaledVector(up, height - radius);
      this.bounds.makeEmpty().expandByPoint(this.segment.start).expandByPoint(this.segment.end).expandByScalar(radius + SKIN + CONTACT_SLOP);
      const original = this.segment.start.clone();
      this.tree.shapecast({
        intersectsBounds: box => box.intersectsBox(this.bounds),
        intersectsTriangle: triangle => {
          const separation = triangle.closestPointToSegment(this.segment, this.trianglePoint, this.capsulePoint);
          if (separation > radius + SKIN + CONTACT_SLOP) return false;
          const bottom = this.capsulePoint.distanceToSquared(this.segment.start) < 1e-8;
          this.correction.subVectors(this.capsulePoint, this.trianglePoint);
          if (this.correction.lengthSq() < 1e-14) {
            triangle.getNormal(this.correction);
            const center = this.segment.getCenter(new Vector3()).sub(triangle.a);
            if (this.correction.dot(center) < 0) this.correction.negate();
          }
          this.correction.normalize();
          triangle.getNormal(this.faceNormal);
          if (bottom && this.correction.dot(up) > 0 && this.faceNormal.dot(up) > FLOOR_INCLINATION) {
            floor = this.faceNormal.clone();
          }
          // Preserve contact state independently of depenetration. Otherwise a
          // stationary capsule loses its floor every other tick and gravity
          // repeatedly injects downhill speed on ordinary streets.
          if (separation >= radius + SKIN) return false;
          // Only remove incoming speed; preserve speed that already moves away from a contact.
          const inward = velocity.dot(this.correction);
          if (inward < 0) velocity.addScaledVector(this.correction, -inward);
          const depth = radius + SKIN - separation;
          this.segment.start.addScaledVector(this.correction, depth);
          this.segment.end.addScaledVector(this.correction, depth);
          return false;
        },
      });
      const delta = this.segment.start.clone().sub(original);
      position.add(delta);
      if (delta.lengthSq() < 1e-14) break;
    }
    return floor;
  }

  /** Independent penetration measurement used by acceptance stress tests. */
  penetration(position: Vector3, up: Vector3, height: number, radius: number): number {
    const segment = new Line3(position.clone().addScaledVector(up, radius), position.clone().addScaledVector(up, height - radius));
    const bounds = new Box3().expandByPoint(segment.start).expandByPoint(segment.end).expandByScalar(radius);
    const trianglePoint = new Vector3(), capsulePoint = new Vector3();
    let depth = 0;
    this.tree.shapecast({
      intersectsBounds: box => box.intersectsBox(bounds),
      intersectsTriangle: triangle => {
        depth = Math.max(depth, radius - triangle.closestPointToSegment(segment, trianglePoint, capsulePoint));
        return false;
      },
    });
    return depth;
  }
}

/** Fixed-tick capsule physics with local (radial) gravity. Tuning values are
 * per-tick constants at this world's scale. */
export class CourierPhysics {
  readonly position = new Vector3();
  /** Last completed tick's start pose. Rendering may interpolate it without
   * moving the collision capsule or changing gameplay queries. */
  readonly previousPosition = new Vector3();
  readonly velocity = new Vector3();
  readonly up = new Vector3(0, 1, 0);
  readonly radius: number;
  grounded = false;
  jumpHeight = 0;
  traveled = 0;
  support: Support | null = null;
  private accumulator = 0;
  private jumpPending = false;
  private readonly groundNormal = new Vector3(0, 1, 0);
  private readonly direction = new Vector3();
  private coyote = 0;

  constructor(readonly collision: CollisionWorld, readonly height = 1.54) {
    this.radius = height * 0.2;
  }

  get interpolationAlpha(): number { return Math.min(1, this.accumulator / FIXED_DT); }

  reset(position: Vector3): void {
    this.position.copy(position);
    this.up.copy(position).normalize();
    this.velocity.setScalar(0);
    this.accumulator = 0;
    this.jumpPending = false;
    this.jumpHeight = 0;
    this.traveled = 0;
    const floor = this.collision.resolve(this.position, this.up, this.height, this.radius, this.velocity);
    this.grounded = !!floor;
    if (floor) this.groundNormal.copy(floor);
    this.findSupport(true);
    this.coyote = this.grounded ? 0.075 : 0;
    this.previousPosition.copy(this.position);
  }

  update(dt: number, motion: CourierMotion): void {
    this.traveled = 0;
    this.jumpPending ||= motion.jump;
    this.accumulator += Math.min(0.25, Math.max(0, dt));
    const inputUp = this.up.clone();
    while (this.accumulator + 1e-12 >= FIXED_DT) {
      this.accumulator = Math.max(0, this.accumulator - FIXED_DT);
      this.previousPosition.copy(this.position);
      this.direction.copy(parallelTransport(motion.direction, inputUp, this.up));
      this.tick(motion);
    }
  }

  private tick(motion: CourierMotion): void {
    const oldPosition = this.position.clone();
    const oldUp = this.up.clone();
    this.up.copy(this.position).normalize();
    // Gravity's frame changes over the sphere; carry lateral momentum with that frame.
    const radialSpeed = this.velocity.dot(oldUp);
    const tangentSpeed = this.velocity.clone().addScaledVector(oldUp, -radialSpeed).length();
    const tangent = tangentSpeed > 1e-9 ? parallelTransport(this.velocity, oldUp, this.up).multiplyScalar(tangentSpeed) : new Vector3();
    this.velocity.copy(tangent).addScaledVector(this.up, radialSpeed);
    this.coyote = this.grounded ? 0.075 : Math.max(0, this.coyote - FIXED_DT);
    if (this.jumpPending) {
      if (this.coyote > 0) {
        this.velocity.addScaledVector(this.up, 6.3 - this.velocity.dot(this.up));
        this.grounded = false;
        this.coyote = 0;
      }
      this.jumpPending = false;
    }

    const amount = Math.max(0, Math.min(1, motion.amount));
    let autoStepping = false;
    if (amount > 0) {
      const accelerationDirection = sphereTangent(this.up, this.direction);
      if (this.grounded) autoStepping = this.autoStepDirection(accelerationDirection);
      this.velocity.addScaledVector(accelerationDirection, 12.6 * FIXED_DT * amount * (motion.sprint ? 1.3 : 1));
    }
    if (!this.grounded) this.velocity.addScaledVector(this.up, -24.7212 * FIXED_DT);
    this.velocity.multiplyScalar(amount > 0 || !this.grounded ? 0.92 : 0.65);
    this.velocity.clampLength(0, this.radius * 0.9 * 3 / FIXED_DT);
    const steps = Math.max(3, Math.ceil(this.velocity.length() * FIXED_DT / (this.radius * 0.35)));
    this.grounded = autoStepping;
    for (let i = 0; i < steps; i++) {
      this.up.copy(this.position).normalize();
      this.position.addScaledVector(this.velocity, FIXED_DT / steps);
      const floor = this.collision.resolve(this.position, this.up, this.height, this.radius, this.velocity);
      if (floor) {
        this.grounded = true;
        this.groundNormal.copy(floor);
      }
    }
    this.up.copy(this.position).normalize();
    this.findSupport(false);
    const displacement = this.position.clone().sub(oldPosition);
    displacement.addScaledVector(oldUp, -displacement.dot(oldUp));
    this.traveled += displacement.length();
  }

  private autoStepDirection(direction: Vector3): boolean {
    // Three short probes above the feet, exactly bounded below roofs and overhangs.
    for (let i = 1; i <= 3; i++) {
      const origin = this.position.clone().addScaledVector(direction, i / 3 * this.radius * 2).addScaledVector(this.up, this.radius * 2);
      const support = this.collision.supportAt(origin, this.up, this.radius * 4);
      if (!support || support.normal.dot(this.up) <= FLOOR_INCLINATION) continue;
      const rise = support.point.clone().sub(this.position).dot(this.up);
      if (rise > this.radius * 0.1 && rise < this.radius * 1.5) {
        direction.copy(support.point).addScaledVector(this.up, rise * 0.5).sub(this.position).normalize();
        return true;
      }
    }
    return false;
  }

  private findSupport(initial: boolean): void {
    const lift = initial ? this.radius : 0.025;
    const hit = this.collision.supportAt(this.position.clone().addScaledVector(this.up, lift), this.up, Math.max(8, this.height * 4));
    this.support = hit;
    this.jumpHeight = this.grounded ? 0 : hit ? Math.max(0, hit.distance - lift - SKIN) : this.jumpHeight;
    // Tiny contact tolerance bridges numeric noise; it cannot select another floor or pull a jumping character down.
    if (hit && hit.normal.dot(this.up) > FLOOR_INCLINATION && this.velocity.dot(this.up) <= 0.02 && hit.distance - lift < (initial ? 0.03 : 0.004)) {
      // The capsule's spherical bottom sits above a sloping plane even while
      // touching it. A radial feet ray may classify support, but must never
      // snap feet to that hit: doing so injects tangential depenetration on
      // every idle tick and slowly walks the courier down the slope.
      this.grounded = true;
      this.groundNormal.copy(hit.normal);
      this.jumpHeight = 0;
    }
  }
}

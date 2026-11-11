import { Group, Mesh, Vector3 } from 'three';
import { createCharacter } from './character';
import type { Character, CharacterPose } from './contracts';
import { CollisionWorld, CourierPhysics } from './physics';
import { parallelTransport, sphereOrientation, sphereTangent, turnHeading } from './sphere';

export interface PlayerWorld {
  radius: number;
  sampleRadius(normal: Vector3): number;
  obstacleMeshes: Mesh[];
  colliderMeshes?: Mesh[];
}

export interface PlayerInput {
  x: number;
  /** Positive means toward the camera's screen-forward tangent (W / arrow up). */
  y: number;
  sprint: boolean;
  jump: boolean;
}

export class Player {
  readonly group: Group;
  readonly normal = new Vector3(0, 1, 0);
  readonly forward = new Vector3(0, 0, -1);
  readonly position = new Vector3();
  /** Shared visual pose for the skinned character and follow camera. Physics,
   * interaction and quest distances continue to use the authoritative pose. */
  readonly renderPosition = new Vector3();
  readonly renderNormal = new Vector3(0, 1, 0);
  readonly renderForward = new Vector3(0, 0, -1);
  grounded = false;
  moving = 0;
  speed = 0;
  jumpHeight = 0;
  readonly height = 1.155;
  readonly physics: CourierPhysics;
  readonly character: Character;
  private readonly movementDirection = new Vector3();
  private elapsed = 0;
  private jumpWasDown = false;
  /** 0..1 movement scale along a direction (thread tension). */
  movementLimiter: (direction: Vector3) => number = () => 1;
  /** Extra presentation inputs for the avatar (spool, held thread, gestures). */
  readonly presentation: Pick<CharacterPose, 'spoolTurns' | 'spoolFill' | 'heldThread' | 'gesture' | 'lookAt' | 'talking'> = {};

  constructor(private readonly world: PlayerWorld, spawnNormal: Vector3) {
    this.character = createCharacter('player');
    this.group = this.character.group;
    this.physics = new CourierPhysics(new CollisionWorld(world.colliderMeshes ?? world.obstacleMeshes), this.height);
    this.reset(spawnNormal);
  }

  reset(normal: Vector3): void {
    this.normal.copy(normal).normalize();
    this.forward.copy(sphereTangent(this.normal));
    const sampled = this.world.sampleRadius(this.normal);
    const radius = Number.isFinite(sampled) && sampled > 0 ? sampled : this.world.radius;
    this.physics.reset(this.normal.clone().multiplyScalar(radius + 0.025));
    this.movementDirection.copy(this.forward);
    this.jumpWasDown = false;
    this.speed = 0;
    this.moving = 0;
    this.syncTransform();
  }

  /** Restore a collision-checked saved pose without a planet-center floor ray:
   * saved bridge/cave positions must remain on their authored floor level. */
  restorePose(position: Vector3, heading: Vector3): void {
    this.physics.reset(position);
    this.normal.copy(position).normalize();
    this.forward.copy(sphereTangent(this.normal,heading));
    this.movementDirection.copy(this.forward);
    this.speed=0;this.moving=0;this.jumpWasDown=false;
    this.syncTransform();
  }

  update(dt: number, input: PlayerInput, cameraForward?: Vector3): void {
    const delta = Math.min(0.25, Math.max(0, dt));
    if (!delta) return;
    this.elapsed += delta;
    let magnitude = Math.min(1, Math.hypot(input.x, input.y));
    if (magnitude > 0.01) {
      const screenForward = sphereTangent(this.normal, cameraForward ?? this.forward);
      const screenRight = new Vector3().crossVectors(screenForward, this.normal).normalize();
      this.movementDirection.copy(screenForward).multiplyScalar(input.y).addScaledVector(screenRight, input.x).normalize();
      magnitude *= Math.min(1, Math.max(0, this.movementLimiter(this.movementDirection)));
    }
    const oldNormal = this.normal.clone();
    this.physics.update(delta, {
      direction: this.movementDirection, amount: magnitude, sprint: input.sprint,
      jump: input.jump && !this.jumpWasDown,
    });
    this.jumpWasDown = input.jump;
    this.normal.copy(this.physics.up);
    this.forward.copy(parallelTransport(this.forward, oldNormal, this.normal));
    this.movementDirection.copy(parallelTransport(this.movementDirection, oldNormal, this.normal));
    this.speed = this.physics.velocity.clone().addScaledVector(this.normal, -this.physics.velocity.dot(this.normal)).length();
    // Physics runs at 60 Hz. Higher refresh rates have render frames without
    // a physics tick; retained resolved speed keeps walk animation continuous.
    this.moving = Math.min(1.35, this.speed / 2.4);
    if (magnitude > 0.01 && this.speed > 0.001) {
      this.forward.copy(turnHeading(this.forward, this.movementDirection, this.normal, 1 - Math.exp(-delta * 15)));
    }
    this.syncTransform();
    this.character.update({
      elapsed: this.elapsed, dt: delta, moving: this.moving, airborne: !this.grounded,
      verticalSpeed: this.physics.velocity.dot(this.normal), ...this.presentation,
    });
    const shadow = this.group.userData.shadow as Mesh | undefined;
    if (shadow) {
      shadow.position.y = -this.jumpHeight + 0.012;
      shadow.scale.setScalar(Math.max(0.55, 1 - this.jumpHeight * 0.18));
    }
  }

  private syncTransform(): void {
    this.position.copy(this.physics.position);
    this.normal.copy(this.physics.up);
    this.grounded = this.physics.grounded;
    this.jumpHeight = this.physics.jumpHeight;
    // The capsule advances at 60 Hz, but the skeleton and camera render at
    // the display rate. Holding a physics pose between ticks makes the body
    // stutter even while the legs animate smoothly at 120/144 Hz. Interpolate
    // the two resolved poses with at most one physics tick of visual latency.
    this.renderPosition.lerpVectors(this.physics.previousPosition, this.position, this.physics.interpolationAlpha);
    this.renderNormal.copy(this.renderPosition).normalize();
    this.renderForward.copy(parallelTransport(this.forward, this.normal, this.renderNormal));
    this.group.position.copy(this.renderPosition);
    this.group.quaternion.copy(sphereOrientation(this.renderNormal, this.renderForward));
    this.group.up.copy(this.renderNormal);
  }
}

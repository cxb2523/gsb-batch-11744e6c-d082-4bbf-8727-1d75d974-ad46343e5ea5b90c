import { Group, Quaternion, Vector3, type Mesh } from 'three';
import { NPC_PLACEMENTS, dir, type NpcId, type NpcPlacement } from '../chapter/data';
import type { Character, CharacterPose, Gesture, Resident, ResidentsContext, SurfaceAnchor, World } from '../contracts';
import { createCharacter } from '../character';
import { Random, clamp, damp } from '../character/animator';
import { revival } from '../art/revival';
import { advanceOnSphere, sphereOrientation, sphereTangent, turnHeading } from '../sphere';
import { createMarker } from './marker';
import { PROFILES, WALKERS, type Profile } from './profiles';
import { blocked, groundRadius } from './ground';

/** Residents: placement, ground contact, per-character idles that depend on
 * whether their corner of the planet is alive yet, gaze and body turning toward
 * the player, conversation reactions, a pop-in entrance, a speech-bubble marker,
 * and two walkers (Button the cat; Wick strolls to his lighthouse). */

const brains = new WeakMap<Resident, Brain>();
const toPlayer = new Vector3();
const tmp = new Vector3();
const tmp2 = new Vector3();
const inverse = new Quaternion();

/** Beyond this chord distance (the far side of the planet) nobody is on screen. */
const AWAKE_DISTANCE = 18;

function fallbackAnchor(world: World, placement: NpcPlacement): SurfaceAnchor {
  const normal = dir(placement.lat, placement.lon);
  const sampled = world.sampleRadius(normal);
  const radius = Number.isFinite(sampled) && sampled > 0 ? sampled : world.radius;
  const toward = dir(placement.faceLat, placement.faceLon).sub(normal);
  return { position: normal.clone().multiplyScalar(radius), normal, forward: sphereTangent(normal, toward) };
}

type CycleState = { on: boolean; until: number };

class Brain {
  readonly group = new Group();
  readonly resident: Resident;
  readonly character: Character;
  readonly profile: Profile;
  readonly marker: Mesh;
  readonly normal = new Vector3();
  readonly position = new Vector3();
  readonly forward = new Vector3();
  readonly baseForward = new Vector3();
  private readonly home = new Vector3();
  private readonly pose: CharacterPose = { elapsed: 0, dt: 0, moving: 0, airborne: false, verticalSpeed: 0 };
  private readonly look = new Vector3();
  private readonly rng: Random;
  private readonly cycles = new Map<string, CycleState>();
  private readonly cycle = (key: string, on: readonly [number, number], off: readonly [number, number]) => this.cycleAt(key, on, off);
  private readonly lastForward = new Vector3();
  private readonly lastNormal = new Vector3();
  private clock = 0;
  private alive = 0;
  private aliveClock = 0;
  private joy = 0;
  private joyReady = false;
  private override: { gesture: Gesture; until: number } | null = null;
  private popT = 1;
  private afterPop: Gesture | null = null;
  private wasTalking = false;
  private near = false;
  private lastGreet = -99;
  private sitK = 0;
  private speed = 0;
  // cat
  private catState: 'walk' | 'rest' = 'rest';
  private restUntil = 0;
  private pathIndex = 0;
  private pathReady = false;
  private pathDir = 1;
  private wanderTarget: Vector3 | null = null;
  private stuck = 0;
  // wick
  private strollDone = false;
  private strollBlocked = 0;

  constructor(private readonly world: World, readonly placement: NpcPlacement, anchor: SurfaceAnchor) {
    const id = placement.id;
    this.profile = PROFILES[id];
    this.character = createCharacter(id);
    this.rng = new Random(0.17 + NPC_PLACEMENTS.findIndex(p => p.id === id) * 0.09);
    this.group.name = `Resident:${id}`;
    this.group.add(this.character.group);
    this.position.copy(anchor.position);
    this.normal.copy(anchor.normal).normalize();
    // Glue to the terrain when the anchor is within a hair of it; anchors authored on
    // floors, piers or window sills (clearly above/below the terrain) are trusted as given.
    const terrain = world.sampleRadius(this.normal);
    const authored = this.position.length();
    if (Number.isFinite(terrain) && terrain > 0 && Math.abs(terrain - authored) < 0.12) this.position.setLength(terrain);
    this.forward.copy(sphereTangent(this.normal, anchor.forward));
    this.baseForward.copy(this.forward);
    this.home.copy(this.position);
    this.marker = createMarker();
    this.marker.visible = false;
    this.group.add(this.marker);
    this.syncTransform(true);
    const brain = this;
    this.resident = {
      id, group: this.group, character: this.character,
      position: this.position, normal: this.normal,
      height: this.character.height,
      focusPosition: this.position.clone().addScaledVector(this.normal, this.character.height * 0.82),
      talkDistance: this.profile.talkDistance,
      present: !placement.appearsAfter,
      talkEnabled: true,
      marker: this.marker,
      appear: instant => brain.appear(instant),
      perform: (gesture, seconds = 2) => brain.perform(gesture, seconds),
    };
    this.group.visible = this.resident.present;
    // Settle the rig once so the very first frame shows a relaxed pose.
    this.character.update({ elapsed: 0, dt: 0.016, moving: 0, airborne: false, verticalSpeed: 0, stance: this.profile.idle({ joy: 0, near: false, talking: false, t: 0, cycle: () => false }).stance });
  }

  private cycleAt(key: string, on: readonly [number, number], off: readonly [number, number]): boolean {
    let state = this.cycles.get(key);
    if (!state) { state = { on: false, until: this.clock + this.rng.range(off[0] * 0.3, off[1]) }; this.cycles.set(key, state); }
    if (this.clock >= state.until) {
      state.on = !state.on;
      const [a, b] = state.on ? on : off;
      state.until = this.clock + this.rng.range(a, b);
    }
    return state.on;
  }

  appear(instant: boolean): void {
    const was = this.resident.present;
    this.resident.present = true;
    this.group.visible = true;
    if (instant || was) { this.popT = 1; this.applyPop(1); return; }
    this.popT = 0;
    this.applyPop(0);
    this.afterPop = this.placement.id === 'pim' ? 'cheer' : this.placement.id === 'cat' ? null : 'wave';
  }

  perform(gesture: Gesture, seconds: number): void {
    this.override = gesture === 'none' ? null : { gesture, until: this.clock + Math.max(0.1, seconds) };
  }

  private local(gesture: Gesture, seconds: number): void {
    if (this.override && this.override.until > this.clock + seconds) return;
    this.override = { gesture, until: this.clock + seconds };
  }

  private applyPop(t: number): void {
    const c1 = 1.70158, c3 = c1 + 1;
    const scale = t >= 1 ? 1 : Math.max(0.001, 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
    this.character.group.scale.setScalar(scale);
    this.character.group.position.y = t >= 1 ? 0 : 0.22 * Math.sin(Math.PI * t);
  }

  /** Keep the group on its anchor and orientation. */
  private syncTransform(force = false): void {
    this.group.position.copy(this.position);
    if (force || this.lastForward.distanceToSquared(this.forward) > 1e-10 || this.lastNormal.distanceToSquared(this.normal) > 1e-10) {
      this.group.quaternion.copy(sphereOrientation(this.normal, this.forward));
      this.lastForward.copy(this.forward);
      this.lastNormal.copy(this.normal);
    }
  }

  private updateJoy(ctx: ResidentsContext, dt: number): void {
    const completed = ctx.completed;
    let target: number;
    if (this.profile.joyAfter && completed) target = completed.has(this.profile.joyAfter) ? 1 : 0;
    else target = clamp((this.alive - 0.3) / 0.5);
    this.joy = this.joyReady ? damp(this.joy, target, 1.3, dt) : target;
    this.joyReady = true;
  }

  tick(ctx: ResidentsContext): void {
    const r = this.resident;
    this.group.visible = r.present;
    if (!r.present) return;
    const dt = clamp(ctx.dt, 0, 0.1);
    this.clock += dt;
    const profile = this.profile;
    const id = r.id;
    toPlayer.subVectors(ctx.playerPosition, r.position);
    const distance = toPlayer.length();
    const talking = ctx.talkingId === id;

    this.aliveClock -= dt;
    if (this.aliveClock <= 0) { this.alive = revival.amountAt(r.position); this.aliveClock = 0.2; }
    this.updateJoy(ctx, dt);

    // conversation + greeting reactions
    if (talking && !this.wasTalking && this.sitK < 0.5) this.local('nod', 0.9);
    if (!talking && this.wasTalking && profile.farewell && distance < 4) this.local('wave', 1.5);
    this.wasTalking = talking;
    if (this.near && distance > 5) this.near = false;
    if (!this.near && distance < 3.4) {
      this.near = true;
      const wants = profile.greets === 'always' || (profile.greets === 'happy' && this.joy > 0.6);
      if (wants && !talking && this.clock - this.lastGreet > 14 && this.popT >= 1 && this.sitK < 0.5) { this.lastGreet = this.clock; this.local('wave', 1.6); }
    }

    // pop-in entrance
    if (this.popT < 1) {
      this.popT = Math.min(1, this.popT + dt / 0.7);
      this.applyPop(this.popT);
      if (this.popT >= 1 && this.afterPop) { this.perform(this.afterPop, 1.8); this.afterPop = null; this.lastGreet = this.clock; }
    }

    // behavior
    const idle = profile.idle({ joy: this.joy, near: this.near, talking, t: this.clock, cycle: this.cycle });
    let gesture: Gesture = idle.gesture;
    if (this.override && this.override.until > this.clock) gesture = this.override.gesture;
    else this.override = null;
    if (talking && gesture === 'work') gesture = 'none';
    let moving = 0;
    if (id === 'cat') ({ moving, gesture } = this.catBrain(ctx, dt, distance, talking, gesture));
    else if (id === 'wick' && WALKERS.wickStroll) moving = this.wickBrain(ctx, dt, distance, talking);
    else this.speed = 0;

    // facing: talk > greet > rest
    this.turn(dt, distance, talking, moving > 0.02);
    this.syncTransform();
    this.sitK = damp(this.sitK, gesture === 'sit' ? 1 : 0, 4, dt);

    // gaze
    let lookAt: Vector3 | null = null;
    const head = tmp2.copy(ctx.playerPosition).normalize().multiplyScalar(0.95).add(ctx.playerPosition);
    if (talking || (distance < profile.lookRadius && toPlayer.dot(this.forward) > -0.35 * distance)) lookAt = this.look.copy(head);
    else if (profile.sulks && this.joy < 0.5 && distance < profile.lookRadius + 1.5) {
      // sulking: stare off to the side instead of at the visitor
      tmp.crossVectors(this.normal, this.forward);
      lookAt = this.look.copy(r.position).addScaledVector(tmp, 2).addScaledVector(this.normal, 0.8);
    }
    const speaking = talking && ctx.speaking;
    const mood = idle.mood + (talking ? 0.1 : 0);

    // feed the character (skip the skinning when nobody can see it)
    r.focusPosition.copy(r.position).addScaledVector(this.normal, this.character.height * (0.82 - 0.26 * this.sitK));
    if (distance < AWAKE_DISTANCE || this.popT < 1) {
      const pose = this.pose;
      pose.elapsed = ctx.time; pose.dt = dt; pose.moving = moving; pose.talking = speaking;
      pose.gesture = gesture; pose.mood = clamp(mood, -1, 1); pose.stance = idle.stance; pose.lookAt = lookAt;
      this.group.updateMatrixWorld(true);
      this.character.update(pose);
    }
    if (this.marker.visible) this.animateMarker(ctx, dt, toPlayer);
  }

  /** Turn the body: toward the player while talking or nearby (bounded), otherwise back to its resting facing. */
  private turn(dt: number, distance: number, talking: boolean, walking: boolean): void {
    if (walking) return;
    const profile = this.profile;
    let desired = this.baseForward;
    let rate = 1.6;
    if (talking) {
      desired = tmp.copy(toPlayer);
      rate = 5;
      const toward = sphereTangent(this.normal, desired);
      const limit = this.id === 'otto' || this.id === 'ike' ? 0.9 : Math.PI;
      desired = this.limited(toward, limit);
    } else if (profile.turnMax > 0 && distance < profile.turnRadius && toPlayer.lengthSq() > 0.01) {
      desired = this.limited(sphereTangent(this.normal, tmp.copy(toPlayer)), profile.turnMax);
      rate = 2.4;
    }
    const before = this.forward.dot(desired);
    if (before < 0.99999) this.forward.copy(turnHeading(this.forward, desired, this.normal, 1 - Math.exp(-dt * rate)));
  }

  private get id(): NpcId { return this.resident.id; }

  /** Clamp a facing to within `limit` radians of the resting facing. */
  private limited(target: Vector3, limit: number): Vector3 {
    const out = tmp2.copy(target);
    if (limit >= Math.PI) return out;
    const cross = tmp.crossVectors(this.baseForward, target);
    const angle = Math.atan2(cross.dot(this.normal), this.baseForward.dot(target));
    const clamped = clamp(angle, -limit, limit);
    return out.copy(this.baseForward).applyAxisAngle(this.normal, clamped);
  }

  // ---- walking ---------------------------------------------------------------

  /** Step toward a surface point. Returns 'arrived' | 'blocked' | 'moved'. */
  private walkToward(target: Vector3, speed: number, dt: number): 'arrived' | 'blocked' | 'moved' {
    const world = this.world;
    tmp.copy(target).sub(this.position);
    const distance = tmp.length();
    if (distance < 0.18) return 'arrived';
    const desired = sphereTangent(this.normal, tmp);
    this.forward.copy(turnHeading(this.forward, desired, this.normal, 1 - Math.exp(-dt * 4.5)));
    const align = Math.max(0, this.forward.dot(desired));
    this.speed = damp(this.speed, speed * align * align, 4, dt);
    const step = this.speed * dt;
    if (step < 1e-5) return 'moved';
    if (blocked(world, this.position, this.forward, this.normal, 0.3 + step)) return 'blocked';
    const radius = this.position.length();
    const next = advanceOnSphere(this.normal, this.forward, this.forward, step, radius);
    const nextRadius = groundRadius(world, next.normal, radius);
    tmp.copy(next.normal).multiplyScalar(nextRadius);
    if (world.isWater(tmp) || Math.abs(nextRadius - radius) > 0.4) return 'blocked';
    this.normal.copy(next.normal);
    this.forward.copy(next.forward);
    this.position.copy(tmp);
    return 'moved';
  }

  private catPath(): Vector3[] | undefined {
    const paths = this.world.anchors.paths ?? {};
    const direct = paths.cat ?? paths.cat_path ?? paths.catPath;
    if (direct && direct.length > 1) return direct;
    for (const [key, value] of Object.entries(paths)) if (/cat/i.test(key) && value.length > 1) return value;
    return undefined;
  }

  private catBrain(_ctx: ResidentsContext, dt: number, distance: number, talking: boolean, idleGesture: Gesture): { moving: number; gesture: Gesture } {
    const REF = 0.9;
    const wantsRest = talking || distance < 2.6;
    const overridden = this.override !== null;
    let gesture: Gesture = idleGesture;
    if (this.catState === 'rest') {
      this.speed = damp(this.speed, 0, 5, dt);
      if (!overridden) {
        // rest quietly: mostly sitting, now and then a groom or a stretch
        gesture = wantsRest ? 'sit' : this.cycle('groom', [2.4, 3.6], [6, 11]) ? 'work' : this.cycle('stretch', [2.2, 3], [18, 30]) ? 'lean' : 'sit';
      }
      if (!wantsRest && this.clock >= this.restUntil && distance > 3.4) this.catState = 'walk';
      return { moving: this.speed / REF, gesture };
    }
    if (wantsRest) {
      this.catState = 'rest';
      this.restUntil = this.clock + 1.5;
      return { moving: this.speed / REF, gesture: overridden ? gesture : 'sit' };
    }
    const path = this.catPath();
    let target: Vector3;
    if (path) {
      if (!this.pathReady) {
        let best = 0, bestDistance = Infinity;
        path.forEach((p, i) => { const d = p.distanceTo(this.position); if (d < bestDistance) { bestDistance = d; best = i; } });
        this.pathIndex = best;
        this.pathReady = true;
      }
      target = path[this.pathIndex];
    } else {
      if (!this.wanderTarget) this.wanderTarget = this.pickWander();
      target = this.wanderTarget;
    }
    const result = this.walkToward(target, WALKERS.catSpeed, dt);
    if (result === 'moved') this.stuck = 0;
    else {
      if (result === 'blocked') this.stuck += dt;
      if (result === 'arrived' || this.stuck > 0.6) {
        this.stuck = 0;
        if (path) {
          this.pathIndex += this.pathDir;
          if (this.pathIndex >= path.length) { this.pathDir = -1; this.pathIndex = path.length - 2; }
          else if (this.pathIndex < 0) { this.pathDir = 1; this.pathIndex = 1; }
          this.pathIndex = clamp(this.pathIndex, 0, path.length - 1);
        } else this.wanderTarget = null;
        this.catState = 'rest';
        this.restUntil = this.clock + this.rng.range(3.5, 9);
      }
    }
    return { moving: this.speed / REF, gesture: this.speed > 0.05 && !overridden ? 'none' : gesture };
  }

  private pickWander(): Vector3 {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const distance = this.rng.range(0.9, WALKERS.catWanderRadius);
      tmp.crossVectors(this.normal, this.forward).multiplyScalar(Math.sin(angle) * distance).addScaledVector(this.forward, Math.cos(angle) * distance);
      const point = this.home.clone().add(tmp);
      const radius = this.home.length();
      point.normalize().multiplyScalar(radius);
      const r = groundRadius(this.world, point.clone().normalize(), radius);
      point.normalize().multiplyScalar(r);
      if (!this.world.isWater(point) && Math.abs(r - radius) < 0.35) return point;
    }
    return this.home.clone();
  }

  private wickBrain(ctx: ResidentsContext, dt: number, distance: number, talking: boolean): number {
    const REF = 2.4;
    const socket = this.world.anchors.sockets.lighthouse?.position;
    if (!socket || this.strollDone || this.joy < 0.9 || this.home.distanceTo(socket) > WALKERS.wickMaxDistance) { this.speed = damp(this.speed, 0, 5, dt); return this.speed / REF; }
    if (talking || distance < 4.2) { this.speed = damp(this.speed, 0, 5, dt); return this.speed / REF; }
    const toSocket = tmp.copy(socket).sub(this.position);
    if (toSocket.length() < WALKERS.wickStopDistance) {
      // arrived: admire the lighthouse
      this.strollDone = true;
      this.baseForward.copy(sphereTangent(this.normal, toSocket));
      return 0;
    }
    const result = this.walkToward(socket, WALKERS.wickSpeed, dt);
    if (result === 'blocked') { this.strollBlocked += dt; if (this.strollBlocked > 1.2) { this.strollDone = true; this.baseForward.copy(this.forward); } }
    else this.strollBlocked = 0;
    return this.speed / REF;
  }

  // ---- marker ------------------------------------------------------------------

  private animateMarker(ctx: ResidentsContext, dt: number, toPlayerVector: Vector3): void {
    const t = ctx.time;
    const bob = Math.sin(t * 3.1) * 0.05;
    this.marker.position.set(0, this.character.height * (1 - 0.18 * this.sitK) + 0.45 + bob, 0);
    // face the visitor (local yaw)
    inverse.copy(this.group.quaternion).invert();
    tmp.copy(toPlayerVector).applyQuaternion(inverse);
    const target = Math.atan2(tmp.x, tmp.z);
    let yaw = this.marker.rotation.y;
    let delta = target - yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    yaw += delta * (1 - Math.exp(-dt * 6));
    this.marker.rotation.y = yaw;
    const pulse = 1 + 0.06 * Math.sin(t * 6.2);
    this.marker.scale.set(pulse, 1 / pulse, pulse);
  }
}

export function createResidents(world: World): Resident[] {
  const residents = NPC_PLACEMENTS.map(placement => {
    const anchor = world.anchors.npcs?.[placement.id] ?? fallbackAnchor(world, placement);
    const brain = new Brain(world, placement, anchor);
    brains.set(brain.resident, brain);
    return brain.resident;
  });
  // Dev-only handle for screenshots and playtests (never read by gameplay).
  if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __unspoolResidents: Resident[] }).__unspoolResidents = residents;
  return residents;
}

export function updateResidents(residents: readonly Resident[], context: ResidentsContext): void {
  for (const resident of residents) brains.get(resident)?.tick(context);
}

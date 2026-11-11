import { Matrix4, Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { acceleratedRaycast, computeBoundsTree, MeshBVH } from 'three-mesh-bvh';
import type { Player } from './player';
import { parallelTransport, sphereTangent } from './sphere';

export interface CameraWorld {
  obstacleMeshes: Mesh[];
  groundMeshes?: Mesh[];
  /** The complete published collider preserves tunnels, roofs and bridges. */
  colliderMeshes?: Mesh[];
}

const CAMERA_CLEARANCE = 0.35;
const MIN_BOOM = 0.18;
/** Extra elevation (radians) used to rise over low clutter instead of retracting into it. */
const OBSTACLE_LIFT = 0.5;
const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

/** A transported orbit with a retracting collision boom. Small persistent
 * obstructions can gently offset its azimuth without changing the user's orbit. */
export class FollowCamera {
  readonly forward = new Vector3(0, 0, -1);
  private readonly backward = new Vector3(0, 0, 1);
  private readonly wantedBackward = new Vector3(0, 0, 1);
  private readonly previousNormal = new Vector3(0, 1, 0);
  private readonly focus = new Vector3();
  private readonly target = new Vector3();
  private readonly direction = new Vector3();
  private readonly candidate = new Vector3();
  private readonly localPoint = new Vector3();
  private readonly scale = new Vector3();
  private readonly inverseMatrix = new Matrix4();
  private readonly raycaster = new Raycaster();
  private readonly prepared = new WeakSet<Mesh>();
  // A little farther and higher than a bare planet needs: the districts are dense.
  private distance = 5.6;
  private elevation = Math.atan2(1, 2.9);
  private wantedElevation = this.elevation;
  private boom = this.distance;
  private manualOrbitCooldown = 0;
  private initialized = false;
  private avatarVisibility = 1;
  private conversation: { position: Vector3; normal: Vector3; height: number } | undefined;
  private conversationAmount = 0;
  private readonly presentationBackward = new Vector3();
  private readonly conversationFocus = new Vector3();
  private readonly conversationBackward = new Vector3();
  private readonly conversationPlayerFocus = new Vector3();
  private readonly conversationNpcFocus = new Vector3();
  private arrivalRemaining = 0;
  private arrivalDuration = 2.5;
  private conversationNeedsView = false;
  /** Current rise over low clutter behind the courier (0..OBSTACLE_LIFT). */
  private obstacleLift = 0;
  private readonly liftDirection = new Vector3();
  /** Dialogue elevation: low by default, higher where side walls (piers, alleys) box the low views in. */
  private conversationElevation = .18;
  private readabilityYaw = 0;
  private wantedReadabilityYaw = 0;
  private readabilitySampleRemaining = 0;
  private readabilitySampleElapsed = 0;
  private readabilityBlockedFor = 0;
  private readabilityClearFor = 0;
  private readabilityBaseBlocked = 0;
  private readabilityAdjustedBlocked = 0;
  private readonly readabilityRight = new Vector3();
  private readonly readabilitySubject = new Vector3();
  private readonly readabilityEye = new Vector3();
  private readonly readabilityBackward = new Vector3();
  private readonly readabilityBaseDirection = new Vector3();
  private allowThinOcclusion = false;
  private thinOcclusion = false;
  private readonly clearanceRight = new Vector3();
  private readonly clearanceOrigin = new Vector3();

  constructor(private readonly camera: PerspectiveCamera) {}

  reset(player: Player): void {
    this.previousNormal.copy(player.normal);
    this.backward.copy(player.forward).negate();
    this.wantedBackward.copy(this.backward);
    this.forward.copy(player.forward);
    this.boom = this.distance;
    this.obstacleLift = 0;
    this.avatarVisibility = 1;
    this.conversation = undefined;
    this.conversationAmount = 0;
    this.arrivalRemaining = 0;
    this.resetReadability();
    if (player.group) player.group.userData.cameraVisibility = 1;
    this.elevation = this.wantedElevation;
    this.focus.copy(player.position).addScaledVector(player.normal, 0.84);
    this.place(player.normal);
    this.initialized = true;
  }

  orbit(deltaX: number, deltaY: number): void {
    this.wantedBackward.applyAxisAngle(this.previousNormal, -deltaX * 0.0045);
    this.wantedBackward.copy(sphereTangent(this.previousNormal, this.wantedBackward));
    this.wantedElevation = Math.max(0.06, Math.min(Math.PI / 4, this.wantedElevation + deltaY * 0.003));
    this.manualOrbitCooldown = 1.4;
    // Automatic composition must yield to a drag; return its small correction
    // smoothly rather than moving the camera directly in the input handler.
    this.wantedReadabilityYaw = 0;
    this.readabilityBlockedFor = this.readabilityClearFor = 0;
  }

  zoom(delta: number): void {
    this.distance = Math.max(2.5, Math.min(10, this.distance * Math.exp(delta * 0.001)));
  }

  /** Dialogue framing uses the same transported frame and collision boom as
   * walking. A cinematic camera must not interpolate through a wall. */
  converse(position: Vector3, normal: Vector3, height = 1.155): void {
    this.conversation = { position, normal, height };
    this.conversationNeedsView = true;
    this.manualOrbitCooldown = 1.5;
  }

  endConversation(): void { this.conversation = undefined; }

  arrive(duration = 2.5): void {
    this.arrivalDuration = Math.max(.1, duration);
    this.arrivalRemaining = this.arrivalDuration;
    this.boom = this.distance + 8;
  }

  get presenting(): boolean { return this.arrivalRemaining > 0; }

  /** Read-only acceptance data; no alternate path for controlling the player. */
  get occlusionState(): Readonly<{ offsetRadians: number; targetRadians: number; baseBlocked: number; adjustedBlocked: number; blockedSeconds: number; boomDistance: number; transientThinOcclusion: boolean }> {
    return { offsetRadians: this.readabilityYaw, targetRadians: this.wantedReadabilityYaw,
      baseBlocked: this.readabilityBaseBlocked, adjustedBlocked: this.readabilityAdjustedBlocked,
      blockedSeconds: this.readabilityBlockedFor, boomDistance: this.boom, transientThinOcclusion: this.thinOcclusion };
  }

  update(dt: number, player: Player, world?: CameraWorld): void {
    if (!this.initialized) this.reset(player);
    const delta = Math.min(0.075, Math.max(0, dt));
    // The capsule advances on fixed physics ticks, while the courier's visible
    // pose interpolates between them. Following that same pose prevents its
    // shoulders and the horizon from stepping against a smoothly moving camera.
    const position = player.renderPosition ?? player.position;
    const normal = player.renderNormal ?? player.normal;
    const forward = player.renderForward ?? player.forward;
    this.backward.copy(parallelTransport(this.backward, this.previousNormal, normal));
    this.wantedBackward.copy(parallelTransport(this.wantedBackward, this.previousNormal, normal));
    this.conversationBackward.copy(parallelTransport(this.conversationBackward, this.previousNormal, normal));
    this.previousNormal.copy(normal);
    this.manualOrbitCooldown = Math.max(0, this.manualOrbitCooldown - delta);
    // Gradual recentering resumes after direct camera input. The transported
    // heading keeps screen-relative movement continuous across the whole planet.
    if (this.manualOrbitCooldown === 0) {
      const rear = this.direction.copy(forward).negate();
      const moving = Math.min(1, Math.max(0, player.moving));
      this.turnToward(this.wantedBackward, rear, normal, ease(delta, 0.045 + moving * 1.35));
    }
    this.turnToward(this.backward, this.wantedBackward, normal, ease(delta, 18));
    this.elevation += (this.wantedElevation - this.elevation) * ease(delta, 18);
    this.forward.copy(this.backward).negate();

    this.target.copy(position).addScaledVector(normal, 0.84);
    this.conversationAmount += ((this.conversation ? 1 : 0) - this.conversationAmount) * ease(delta, 3.8);
    if (this.conversation) {
      const npcChest = this.conversation.position.clone().addScaledVector(this.conversation.normal, this.conversation.height * .65);
      this.conversationPlayerFocus.copy(this.target);
      this.conversationNpcFocus.copy(npcChest);
      this.conversationFocus.lerpVectors(this.target, npcChest, .55);
      const facing = this.conversation.position.clone().sub(position).projectOnPlane(normal).normalize();
      if (this.conversationNeedsView && facing.lengthSq() > .5) {
        // Show both profiles from the side nearest the current camera. Sampling
        // both sides also avoids locking a conversation behind a nearby wall.
        const side = facing.clone().cross(normal).normalize();
        if (side.dot(this.backward) < 0) side.negate();
        this.conversationBackward.copy(side).addScaledVector(facing, -.3).normalize();
      } else if(this.conversationNeedsView) this.conversationBackward.copy(this.backward);
    }
    this.target.lerp(this.conversationFocus, this.conversationAmount);
    this.arrivalRemaining = Math.max(0, this.arrivalRemaining - delta);
    const arrival = this.arrivalRemaining / this.arrivalDuration;
    this.target.addScaledVector(normal, arrival * arrival * 2);
    const meshes = world?.colliderMeshes ?? [...(world?.obstacleMeshes ?? []), ...(world?.groundMeshes ?? [])];
    this.allowThinOcclusion = !this.conversation && this.conversationAmount < .01 && this.arrivalRemaining === 0;
    this.prepare(meshes);
    const dialogueDistance=Math.max(3.1,2.25/Math.max(.4,this.camera.aspect));
    if(this.conversation && this.conversationNeedsView) {
      this.chooseConversationView(normal,meshes,dialogueDistance);
      this.conversationNeedsView=false;
    }
    // Ease vertical steps and jumping, while never leaving the target on the
    // far side of a wall as the courier rounds a corner.
    this.focus.lerp(this.target, ease(delta, 14));
    const focusTravel = this.direction.subVectors(this.focus, this.target);
    if (focusTravel.lengthSq() > 1e-8) {
      this.raycaster.set(this.target, focusTravel.clone().normalize());
      this.raycaster.near = 0.001;
      this.raycaster.far = focusTravel.length();
      if (this.raycaster.intersectObjects(meshes, false).length) this.focus.copy(this.target);
    }

    this.presentationBackward.copy(this.backward);
    this.turnToward(this.presentationBackward, this.conversationBackward, normal, this.conversationAmount);
    const presentationElevation = this.elevation + (this.conversationElevation - this.elevation) * this.conversationAmount;
    this.direction.copy(this.presentationBackward).multiplyScalar(Math.cos(presentationElevation))
      .addScaledVector(normal, Math.sin(presentationElevation)).normalize();
    const distance = this.distance + (dialogueDistance - this.distance) * this.conversationAmount + arrival * arrival * 8;
    this.updateReadability(delta, position, normal, presentationElevation, distance, meshes);
    this.presentationBackward.applyAxisAngle(normal, this.readabilityYaw);
    this.direction.copy(this.presentationBackward).multiplyScalar(Math.cos(presentationElevation))
      .addScaledVector(normal, Math.sin(presentationElevation)).normalize();
    // Movement remains relative to the actual free-play camera, including its
    // small visibility correction. Dialogue keeps the established control frame.
    if (this.conversationAmount < .01) this.forward.copy(this.presentationBackward).negate();
    // Rocks, steps and crates behind the courier: rise over them instead of
    // pulling the camera down into them. If the raised view is blocked too
    // (a wall or roof), the boom retracts as before.
    let liftTarget = 0;
    if (this.conversationAmount < .01 && this.arrivalRemaining === 0 && meshes.length) {
      const base = this.clearBoom(distance, meshes);
      // Only clutter lower than about head height qualifies; a wall keeps its retracting boom.
      this.raycaster.set(this.focus, this.direction);
      this.raycaster.near = .01; this.raycaster.far = distance + CAMERA_CLEARANCE; this.raycaster.firstHitOnly = true;
      const blocker = base < distance * .7 ? this.raycaster.intersectObjects(meshes, false)[0] : undefined;
      const low = !blocker || blocker.point.clone().sub(position).dot(normal) < 1.4;
      if (base < distance * .7 && low) {
        this.liftDirection.copy(this.direction);
        // the smallest rise that clears the view, or none at all
        for (const lift of [OBSTACLE_LIFT * .6, OBSTACLE_LIFT, OBSTACLE_LIFT * 1.6]) {
          const raised = Math.min(1.25, presentationElevation + lift);
          this.direction.copy(this.presentationBackward).multiplyScalar(Math.cos(raised)).addScaledVector(normal, Math.sin(raised)).normalize();
          if (this.clearBoom(distance, meshes) > Math.max(base + .8, distance * .8)) { liftTarget = lift; break; }
        }
        this.direction.copy(this.liftDirection);
      }
    }
    // Rise quickly (the boom would otherwise snap in first), settle back slowly.
    this.obstacleLift += (liftTarget - this.obstacleLift) * ease(delta, liftTarget > this.obstacleLift ? 9 : 1.2);
    if (this.obstacleLift > .002) {
      const lifted = Math.min(1.25, presentationElevation + this.obstacleLift);
      this.direction.copy(this.presentationBackward).multiplyScalar(Math.cos(lifted)).addScaledVector(normal, Math.sin(lifted)).normalize();
    }
    const safe = this.clearBoom(distance, meshes);
    // Collision contraction cannot linger beyond a wall; recovery is deliberately
    // slower. A scalar boom avoids lerping a world-space point through buildings.
    this.boom += (safe - this.boom) * ease(delta, safe < this.boom ? 24 : 2.5);
    this.boom = Math.min(this.boom, safe);
    // The desired endpoint may be clear while a slowly recovering, shorter
    // boom passes the edge of a pole or roof. Validate the displayed endpoint
    // against the whole near plane, but do not reapply preferred .35 spacing:
    // a narrow yet physically safe corridor could otherwise trap the recovery
    // beside the player's head forever, even after orbiting back to open space.
    const nearHalfHeight = this.camera.near * Math.tan(this.camera.fov * Math.PI / 360);
    const nearClearance = Math.min(CAMERA_CLEARANCE,
      Math.hypot(this.camera.near, nearHalfHeight, nearHalfHeight * this.camera.aspect) + .02);
    this.boom = Math.min(this.boom, this.clearBoom(this.boom, meshes, nearClearance));
    this.camera.position.copy(this.focus).addScaledVector(this.direction, this.boom);
    this.camera.up.copy(normal);
    this.camera.lookAt(this.focus);
    this.updateAvatarVisibility(delta, player);
  }

  private resetReadability(): void {
    this.readabilityYaw = this.wantedReadabilityYaw = 0;
    this.readabilitySampleRemaining = this.readabilitySampleElapsed = this.readabilityBlockedFor = this.readabilityClearFor = 0;
    this.readabilityBaseBlocked = this.readabilityAdjustedBlocked = 0;
  }

  /** A center boom ray can clear a pole while its edge covers the courier's
   * face or shoulders. Wait before choosing the nearest clear side, and wait
   * again before returning, so walking past thin props does not pump the boom. */
  private updateReadability(dt: number, position: Vector3, up: Vector3, elevation: number, distance: number, meshes: Mesh[]): void {
    const enabled = meshes.length > 0 && this.manualOrbitCooldown === 0 && this.arrivalRemaining === 0
      && this.conversationAmount < .01 && !this.conversation && this.boom > 1.75;
    if (!enabled) {
      this.wantedReadabilityYaw = 0;
      this.readabilityBlockedFor = this.readabilityClearFor = 0;
      this.readabilitySampleRemaining = 0;
      this.readabilitySampleElapsed = 0;
      this.readabilityBaseBlocked = this.readabilityAdjustedBlocked = 0;
    } else {
      this.readabilitySampleRemaining -= dt;
      this.readabilitySampleElapsed += dt;
      if (this.readabilitySampleRemaining <= 0) {
        // Bound BVH work independently of display refresh rate. Accumulating
        // real time here also gives 60 and 144 Hz the same persistence gate.
        const sampleTime = this.readabilitySampleElapsed;
        this.readabilitySampleElapsed = 0;
        this.readabilitySampleRemaining += .1;
        this.readabilityBaseDirection.copy(this.direction);
        const baseSafe = this.clearBoom(distance, meshes);
        const probeDistance = Math.min(this.boom, baseSafe);
        this.readabilityEye.copy(this.focus).addScaledVector(this.direction, probeDistance);
        const baseBlocked = this.blockedSubjects(this.readabilityEye, position, up, this.presentationBackward, meshes);
        this.readabilityBaseBlocked = baseBlocked;
        if (baseBlocked === 0) {
          this.readabilityBlockedFor = 0;
          this.readabilityClearFor += sampleTime;
          if (this.readabilityClearFor >= .5) this.wantedReadabilityYaw = 0;
        } else {
          this.readabilityClearFor = 0;
          this.readabilityBlockedFor += sampleTime;
          if (this.readabilityBlockedFor >= .3) {
            this.chooseReadableSide(position, up, elevation, distance, probeDistance, meshes);
          }
        }
        this.readabilityBackward.copy(this.presentationBackward).applyAxisAngle(up, this.readabilityYaw);
        this.direction.copy(this.readabilityBackward).multiplyScalar(Math.cos(elevation)).addScaledVector(up, Math.sin(elevation)).normalize();
        this.readabilityEye.copy(this.focus).addScaledVector(this.direction, Math.min(probeDistance, this.clearBoom(distance, meshes)));
        this.readabilityAdjustedBlocked = this.blockedSubjects(this.readabilityEye, position, up, this.readabilityBackward, meshes);
        this.direction.copy(this.readabilityBaseDirection);
      }
    }
    const change = (this.wantedReadabilityYaw - this.readabilityYaw) * ease(dt, 3.5);
    this.readabilityYaw += Math.max(-dt * .8, Math.min(dt * .8, change));
  }

  private chooseReadableSide(position: Vector3, up: Vector3, elevation: number, distance: number, probeDistance: number, meshes: Mesh[]): void {
    let bestYaw = this.wantedReadabilityYaw;
    let bestScore = Infinity;
    // Prefer the current correction when both sides work. Crossing between
    // equally good sides of a narrow pole would otherwise make the view sway.
    const angles = [this.wantedReadabilityYaw, 0, .105, -.105, .21, -.21, .315, -.315, .42, -.42];
    for (const yaw of angles) {
      this.readabilityBackward.copy(this.presentationBackward).applyAxisAngle(up, yaw);
      this.direction.copy(this.readabilityBackward).multiplyScalar(Math.cos(elevation))
        .addScaledVector(up, Math.sin(elevation)).normalize();
      const safe = this.clearBoom(distance, meshes);
      // A side view that exposes the face but puts the camera against another
      // wall is worse. This feature must not trigger a large distance collapse.
      if (safe < probeDistance * .9 || safe < 1.75) continue;
      this.readabilityEye.copy(this.focus).addScaledVector(this.direction, Math.min(probeDistance, safe));
      const blocked = this.blockedSubjects(this.readabilityEye, position, up, this.readabilityBackward, meshes);
      const score = blocked * 10 + Math.abs(yaw) + Math.abs(yaw - this.wantedReadabilityYaw) * .45;
      if (score < bestScore) { bestScore = score; bestYaw = yaw; }
    }
    this.wantedReadabilityYaw = bestYaw;
  }

  private blockedSubjects(eye: Vector3, position: Vector3, up: Vector3, backward: Vector3, meshes: Mesh[]): number {
    this.readabilityRight.crossVectors(up, backward).normalize();
    let blocked = 0;
    for (const [height, lateral, weight] of [[1.08, 0, 2], [.52, 0, 1.5], [.82, -.16, 1], [.82, .16, 1]]) {
      this.readabilitySubject.copy(position).addScaledVector(up, height!).addScaledVector(this.readabilityRight, lateral!);
      this.candidate.subVectors(this.readabilitySubject, eye);
      const length = this.candidate.length();
      if (length < .1) continue;
      this.raycaster.set(eye, this.candidate.multiplyScalar(1 / length));
      this.raycaster.near = .02;
      this.raycaster.far = length - .06;
      this.raycaster.firstHitOnly = true;
      if (this.raycaster.intersectObjects(meshes, false).length > 0) blocked += weight!;
    }
    return blocked;
  }

  /** A short collision boom must reveal the road instead of enlarging the
   * courier's head across the screen. This never changes collision geometry. */
  private updateAvatarVisibility(dt: number, player: Player): void {
    const height = player.height ?? 1.155;
    const amount = Math.min(1, Math.max(0, (this.boom - height * 0.8) / (height * 0.7)));
    const target = amount * amount * (3 - 2 * amount);
    // Hide promptly when a wall retracts the camera; return gradually on exit.
    this.avatarVisibility += (target - this.avatarVisibility) * ease(dt, 8);
    this.avatarVisibility = Math.min(this.avatarVisibility, target);
    if (player.group) player.group.userData.cameraVisibility = this.avatarVisibility;
  }

  private turnToward(from: Vector3, to: Vector3, up: Vector3, blend: number): void {
    const angle = Math.atan2(up.dot(this.candidate.crossVectors(from, to)), from.dot(to));
    from.applyAxisAngle(up, angle * blend);
    from.copy(sphereTangent(up, from));
  }

  private chooseConversationView(up: Vector3,meshes: Mesh[],distance: number): void {
    const previousFocus=this.focus.clone(),preferred=this.conversationBackward.clone();
    this.focus.copy(this.conversationFocus);
    let score=-Infinity;
    const chosen=preferred.clone();
    let chosenElevation=.18;
    const view=this.camera.clone();
    const subjects=[this.conversationNpcFocus,this.conversationPlayerFocus];
    // Over the courier's shoulder toward the resident: reads well in narrow places
    // (piers, alleys) where a side-on two-shot has no room.
    const toNpc=this.conversationNpcFocus.clone().sub(this.conversationPlayerFocus).projectOnPlane(up);
    if(toNpc.lengthSq()>1e-4) toNpc.normalize();
    const shoulder=toNpc.lengthSq()>.5 ? toNpc.clone().negate().applyAxisAngle(up,.38) : preferred.clone();
    const shoulderAngle=Math.atan2(up.dot(new Vector3().crossVectors(preferred,shoulder)),preferred.dot(shoulder));
    const candidates:[number,number,number][]=[[shoulderAngle,.3,-.4]];
    for(const [elevation, cost] of [[.18, 0], [.42, .35]] as const) for(const angle of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI*3/4,-Math.PI*3/4,Math.PI]) candidates.push([angle,elevation,cost]);
    for(const [angle, elevation, cost] of candidates) {
      const backward=preferred.clone().applyAxisAngle(up,angle);
      this.direction.copy(backward).multiplyScalar(Math.cos(elevation)).addScaledVector(up,Math.sin(elevation)).normalize();
      const safe=this.clearBoom(distance,meshes);
      const eye=this.focus.clone().addScaledVector(this.direction,safe);
      view.position.copy(eye);view.up.copy(up);view.lookAt(this.focus);view.updateMatrixWorld(true);
      // A boom squeezed well short of the dialogue distance gives a face-filling close-up.
      let candidateScore=safe-(cost<0?0:Math.abs(angle)*.22)-cost-(safe<distance*.6?2:0);
      // From the resident's side the camera shows the back of their head; the player wants their face.
      if(toNpc.lengthSq()>.5 && backward.dot(toNpc)>.3) candidateScore-=1.5;
      subjects.forEach((subject,index) => {
        const sight=subject.clone().sub(eye);
        this.raycaster.set(eye,sight.clone().normalize());
        this.raycaster.near=.01;this.raycaster.far=Math.max(.01,sight.length()-.06);
        if(this.raycaster.intersectObjects(meshes,false).length) candidateScore-=index===0?8:4;
        const screen=subject.clone().project(view);
        if(Math.abs(screen.x)>.82 || Math.abs(screen.y)>.75 || screen.z>1 || screen.z< -1) candidateScore-=index===0?6:3;
      });
      if(candidateScore>score) {score=candidateScore;chosen.copy(backward);chosenElevation=elevation;}
    }
    this.conversationElevation=chosenElevation;
    this.conversationBackward.copy(chosen);
    this.focus.copy(previousFocus);
  }

  private prepare(meshes: Mesh[]): void {
    for (const mesh of meshes) {
      if (this.prepared.has(mesh)) continue;
      if (!mesh.geometry.boundsTree) computeBoundsTree.call(mesh.geometry, { targetLeafSize: 12 });
      mesh.raycast = acceleratedRaycast;
      this.prepared.add(mesh);
    }
  }

  private clearBoom(wanted: number, meshes: Mesh[], clearance = CAMERA_CLEARANCE): number {
    this.thinOcclusion = false;
    if (!meshes.length) return wanted;
    this.raycaster.set(this.focus, this.direction);
    this.raycaster.near = 0.01;
    this.raycaster.far = wanted + clearance;
    this.raycaster.firstHitOnly = true;
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    // A narrow signpost can cross the view for a fraction of a second while
    // leaving the camera itself in open space. Treat that as composition, not
    // a building wall: two clear parallel shoulder rays establish its width.
    // The endpoint clearance below still prevents the eye touching the prop.
    this.thinOcclusion = !!hit && this.allowThinOcclusion && this.thinViewObstruction(wanted, meshes);
    let safe = hit && !this.thinOcclusion ? Math.max(MIN_BOOM, Math.min(wanted, hit.distance - clearance)) : wanted;
    // A center ray alone misses roof edges and the camera's near plane. Query
    // the real BVH surface around the camera and retract along the same boom.
    for (let i = 0; i < 12 && safe > MIN_BOOM; i++) {
      this.candidate.copy(this.focus).addScaledVector(this.direction, safe);
      let correction = 0;
      for (const mesh of meshes) {
        this.inverseMatrix.copy(mesh.matrixWorld).invert();
        this.localPoint.copy(this.candidate).applyMatrix4(this.inverseMatrix);
        mesh.getWorldScale(this.scale);
        const minScale = Math.max(1e-6, Math.min(this.scale.x, this.scale.y, this.scale.z));
        const nearest = (mesh.geometry.boundsTree as MeshBVH).closestPointToPoint(this.localPoint, undefined, 0, clearance / minScale);
        if (nearest) correction = Math.max(correction, clearance - nearest.distance * minScale);
      }
      if (correction <= 0.001) break;
      safe = Math.max(MIN_BOOM, safe - Math.max(0.06, correction + 0.015));
    }
    return safe;
  }

  private thinViewObstruction(wanted: number, meshes: Mesh[]): boolean {
    this.clearanceRight.crossVectors(this.previousNormal, this.direction).normalize();
    if (this.clearanceRight.lengthSq() < .5) return false;
    for (const side of [-1, 1]) {
      this.clearanceOrigin.copy(this.focus).addScaledVector(this.clearanceRight, side * .24);
      this.raycaster.set(this.clearanceOrigin, this.direction);
      this.raycaster.near = .01;
      this.raycaster.far = wanted + CAMERA_CLEARANCE;
      if (this.raycaster.intersectObjects(meshes, false).length) return false;
    }
    return true;
  }

  private place(up: Vector3): void {
    this.direction.copy(this.backward).multiplyScalar(Math.cos(this.elevation))
      .addScaledVector(up, Math.sin(this.elevation));
    this.camera.position.copy(this.focus).addScaledVector(this.direction, this.boom);
    this.camera.up.copy(up);
    this.camera.lookAt(this.focus);
  }
}

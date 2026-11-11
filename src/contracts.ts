import type { Group, Mesh, Object3D, Vector3 } from 'three';
import type { ConnectionId, DistrictId, NpcId, SocketId, ThreadKind } from './chapter/data';

/** Module boundaries shared by every workstream. Implementations live in
 * src/world, src/character, src/residents, src/thread, src/fx, src/audio and
 * src/ui; the chapter director in src/chapter wires them together in main.ts.
 * Extend an interface only additively and update every implementation. */

export interface SurfaceAnchor {
  /** World-space point on the walkable/standing surface (or the socket tip). */
  position: Vector3;
  /** Local up (normally position.normalize()). */
  normal: Vector3;
  /** Unit tangent the object faces. */
  forward: Vector3;
}

export interface WorldAnchors {
  spawn: SurfaceAnchor;
  sockets: Record<SocketId, SurfaceAnchor>;
  npcs: Record<NpcId, SurfaceAnchor>;
  farHouseDoor: SurfaceAnchor;
  greatTree: SurfaceAnchor;
  /** Optional named spots for ambient wandering (cat, birds, boat route...). */
  paths: Record<string, Vector3[]>;
}

export interface World {
  group: Group;
  /** Nominal land radius used for distances and the title camera. */
  radius: number;
  groundMeshes: Mesh[];
  obstacleMeshes: Mesh[];
  /** The complete collision set, including floors, walls, roofs and props. */
  colliderMeshes: Mesh[];
  spawnNormal: Vector3;
  anchors: WorldAnchors;
  sampleRadius(normal: Vector3): number;
  isWater(position: Vector3): boolean;
  setView(position?: Vector3): void;
  update(time: number, dt: number): void;
  /** A connection finished (instant = restoring a save, skip transitions).
   * World-owned machinery reacts: lighthouse lamp/beam, crane, waterwheel,
   * flowers, lanterns, windows, great tree blossoms, boat arrival... */
  activate(id: ConnectionId, instant: boolean): void;
  /** Chapter finale: dusk lanterns, far-house window silhouette. */
  setFinale(amount: number): void;
  stats(): Record<string, number>;
}

export type Gesture = 'none' | 'wave' | 'cheer' | 'talk' | 'nod' | 'shrug' | 'work' | 'sit' | 'lean';

/** Resting arm posture while standing still (blended away when walking or
 * performing an arm gesture). 'sill' rests the forearms on a window sill. */
export type Stance = 'default' | 'fold' | 'hips' | 'clasp' | 'sill';

export interface CharacterPose {
  elapsed: number;
  dt: number;
  /** 0 idle, 1 walking, ~1.3 sprinting (retained physics speed / 2.4). */
  moving: number;
  airborne: boolean;
  verticalSpeed: number;
  /** Mouth/hand animation while dialogue text is revealing. */
  talking?: boolean;
  gesture?: Gesture;
  /** Mood -1 (glum: frown, droop) .. 0 neutral .. +1 (happy: wide smile, perky). Residents
   * ease it with the revival wave. Optional; defaults to a friendly 0.45. */
  mood?: number;
  /** Resting arm posture while standing. Optional; defaults to 'default'. */
  stance?: Stance;
  /** World-space point to turn the head toward, if any. */
  lookAt?: Vector3 | null;
  /** Player only: accumulated thread laid (world units) to spin the spool. */
  spoolTurns?: number;
  /** Player only: 0..1 remaining thread on the spool (changes its bulk). */
  spoolFill?: number;
  /** Player only: color of the thread currently held, if any. */
  heldThread?: string | null;
}

export interface Character {
  group: Group;
  /** Feet-to-top height in world units. */
  height: number;
  update(pose: CharacterPose): void;
  /** Optional attachment points (children of `group`). The thread system reads
   * `spoolTip` world position for the live thread end; `hand` holds props. */
  attachments?: { spoolTip?: Object3D; hand?: Object3D; head?: Object3D };
}

export interface Resident {
  id: NpcId;
  group: Group;
  character: Character;
  position: Vector3;
  normal: Vector3;
  height: number;
  /** Head-height point used for line of sight and camera framing. */
  focusPosition: Vector3;
  talkDistance: number;
  /** False while hidden (not yet arrived) — not drawn, not interactable. */
  present: boolean;
  talkEnabled: boolean;
  /** Small floating "!" style marker the director toggles for objectives. */
  marker: Object3D;
  /** Make the resident appear (walk out / arrive). instant skips animation. */
  appear(instant: boolean): void;
  /** One-shot or looping gesture chosen by the director (cheer after a connection...). */
  perform(gesture: Gesture, seconds?: number): void;
}

export interface ResidentsContext {
  time: number;
  dt: number;
  playerPosition: Vector3;
  talkingId?: NpcId;
  speaking: boolean;
  /** Optional: completed connections, so residents can switch mood/behavior on story
   * progress (Bram after w1, Sprout after w2, Otto/Ike after o2...). When omitted they
   * fall back to the revival wave at their feet. */
  completed?: ReadonlySet<ConnectionId>;
}

export type ThreadPrompt =
  | { kind: 'pickup'; socket: SocketId; connection: ConnectionId; position: Vector3 }
  | { kind: 'connect'; socket: SocketId; connection: ConnectionId; position: Vector3 }
  | { kind: 'mismatch' | 'inactive'; socket: SocketId; position: Vector3 };

export interface ThreadFrame {
  time: number;
  dt: number;
  playerPosition: Vector3;
  playerNormal: Vector3;
  grounded: boolean;
  /** World position where the thread leaves the player's spool (render pose). */
  spoolTip?: Vector3;
}

export interface ThreadSave {
  version: 1;
  /** Completed threads with their laid paths, quantized to 0.01 units. */
  threads: { id: ConnectionId; points: number[] }[];
}

export interface ThreadSystem {
  readonly group: Object3D;
  /** Connection whose thread is in hand, if any. */
  readonly carrying: ConnectionId | null;
  readonly carryingKind: ThreadKind | null;
  /** 0..1 thread left on the spool. */
  readonly remaining: number;
  /** True while the spool is empty and the line holds the player back. */
  readonly taut: boolean;
  /** Connection whose end has snapped into its socket and whose light pulse is
   * still travelling (not in hand any more, not yet connected). Additive. */
  readonly connecting?: ConnectionId | null;
  /** Total thread laid since boot (spool spin + music-box notes). */
  readonly laidDistance: number;
  /** Connections that may be started (prerequisites met, not completed). */
  setAvailable(ids: ReadonlySet<ConnectionId>): void;
  /** Nearest actionable socket within reach of the player, if any. */
  prompt(playerPosition: Vector3): ThreadPrompt | null;
  /** Act on a prompt: pick up a thread end or connect it. Returns true on success. */
  interact(prompt: ThreadPrompt): boolean;
  /** Reel the held thread back to its source. */
  reel(): void;
  /** Movement limiter while taut: 0..1 scale for moving along `direction`. */
  movementScale(playerPosition: Vector3, direction: Vector3): number;
  update(frame: ThreadFrame): void;
  /** Fired when the light pulse reaches the far end (not on restore). */
  onConnected: (id: ConnectionId, end: Vector3) => void;
  /** Fired roughly every musical step of laid thread (index increases). */
  onStep: (index: number, kind: ThreadKind) => void;
  /** Optional: the thread end clicked into its target socket (before the pulse). */
  onSnap?: (id: ConnectionId, position: Vector3) => void;
  /** Rebuild completed threads from a save without pulses. */
  restore(save: ThreadSave | null): void;
  serialize(): ThreadSave;
  reset(): void;
}

export interface FxFrame {
  time: number;
  dt: number;
  playerPosition?: Vector3;
  playerNormal?: Vector3;
  playerSpeed: number;
  /** Fraction of chapter connections completed, 0..1. */
  life: number;
}

export interface EnvironmentFx {
  group: Group;
  update(frame: FxFrame): void;
  /** Sparkle/confetti burst where a thread connects. */
  burst(position: Vector3, normal: Vector3, color: string): void;
  /** 0 day … 1 dusk (finale). */
  setDusk(amount: number): void;
  stats(): Record<string, number>;
}

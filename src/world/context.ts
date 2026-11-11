import { Group, Matrix4, Mesh, Vector3, type Object3D, type ShaderMaterial } from 'three';
import { dir, type NpcId, type SocketId } from '../chapter/data';
import type { SurfaceAnchor } from '../contracts';
import { sphereTangent } from '../sphere';
import {
  Collector, CollectorSink, ColliderSink, ColliderStore, Layer, mulberry32, type ColorLike, type PartOptions,
} from './kit';
import { DEG, frameAtBearing, makeFrame, type Frame } from './frame';
import { groundPoint } from './terrain';
import type { Ground } from './ground';
import type { WorldMaterials } from './materials';
import type { PaintHook } from './terrainMesh';

/** Shared state while the planet is authored: per-zone geometry collectors,
 * the collision store, anchors and activation hooks. Districts receive this
 * object and place things through `Kit`s bound to local frames. */

export interface ZoneDef { id: string; lat: number; lon: number }
export const ZONES: ZoneDef[] = [
  { id: 'harbor', lat: 10, lon: 0 }, { id: 'workshop', lat: 18, lon: 112 }, { id: 'oldstreet', lat: 15, lon: -118 },
  { id: 'grove', lat: 72, lon: 0 }, { id: 'far', lat: -58, lon: 180 },
  { id: 'wild-ne', lat: 45, lon: 55 }, { id: 'wild-nw', lat: 42, lon: -60 }, { id: 'wild-n2', lat: 40, lon: 180 },
  { id: 'wild-s1', lat: -28, lon: 70 }, { id: 'wild-s2', lat: -35, lon: 118 }, { id: 'wild-s3', lat: -35, lon: -108 },
  { id: 'wild-s4', lat: -72, lon: 10 }, { id: 'wild-s5', lat: -62, lon: 75 }, { id: 'wild-s6', lat: -60, lon: -75 },
  { id: 'wild-e', lat: -8, lon: 152 }, { id: 'wild-w', lat: -12, lon: -158 }, { id: 'wild-mid', lat: 20, lon: -45 },
  { id: 'wild-bay', lat: -50, lon: 0 },
];

export interface Zone {
  id: string;
  dir: Vector3;
  solid: Collector;
  detail: Collector;
  foliage: Collector;
  /** Ground cover (grass, flowers, mushrooms): sways like foliage but casts no shadows. */
  small: Collector;
}

/** Drawing handles bound to one frame: solid / detail(glow) / foliage(sway) / collider. */
export class Kit {
  constructor(readonly frame: Frame, readonly s: Layer, readonly d: Layer, readonly f: Layer, readonly g: Layer, readonly c: Layer) {}
  at(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): Kit {
    return new Kit(this.frame, this.s.at(x, y, z, yaw, pitch, roll), this.d.at(x, y, z, yaw, pitch, roll), this.f.at(x, y, z, yaw, pitch, roll), this.g.at(x, y, z, yaw, pitch, roll), this.c.at(x, y, z, yaw, pitch, roll));
  }
  /** World position of a local point. */
  p(x: number, y: number, z: number): Vector3 {
    const m = this.s.base ? new Matrix4().multiplyMatrices(this.s.root, this.s.base) : this.s.root;
    return new Vector3(x, y, z).applyMatrix4(m);
  }
  /** Surface anchor at a local point; `forward` is a local direction. */
  anchor(x: number, y: number, z: number, fx = 0, fz = 1): SurfaceAnchor {
    const position = this.p(x, y, z);
    const normal = position.clone().normalize();
    const m = this.s.base ? new Matrix4().multiplyMatrices(this.s.root, this.s.base) : this.s.root;
    const forward = sphereTangent(normal, new Vector3(fx, 0, fz).transformDirection(m));
    return { position, normal, forward };
  }
}

export interface Hooks {
  activate: Partial<Record<string, ((instant: boolean) => void)[]>>;
  updaters: ((time: number, dt: number) => void)[];
  finale: ((amount: number) => void)[];
}

export class Builder {
  readonly zones: Zone[];
  readonly structures = new ColliderStore();
  readonly sockets: Partial<Record<SocketId, SurfaceAnchor>> = {};
  readonly npcs: Partial<Record<NpcId, SurfaceAnchor>> = {};
  readonly paths: Record<string, Vector3[]> = {};
  spawn?: SurfaceAnchor;
  farDoor?: SurfaceAnchor;
  greatTree?: SurfaceAnchor;
  readonly hooks: Hooks = { activate: {}, updaters: [], finale: [] };
  /** Rectangles/discs where the sea wall must stay open (piers, quays). */
  readonly openings: ((p: Vector3) => boolean)[] = [];
  readonly random: () => number;
  triangles = 0;

  constructor(seed = 11) {
    this.random = mulberry32(seed);
    this.zones = ZONES.map((z, i) => ({
      id: z.id, dir: dir(z.lat, z.lon),
      solid: new Collector('plain', mulberry32(100 + i)),
      detail: new Collector('glow', mulberry32(200 + i)),
      foliage: new Collector('sway', mulberry32(300 + i)),
      small: new Collector('sway', mulberry32(400 + i)),
    }));
  }

  zoneOf(position: Vector3): Zone {
    const n = position.clone().normalize();
    let best = this.zones[0], score = -2;
    for (const zone of this.zones) {
      const d = zone.dir.dot(n);
      if (d > score) { score = d; best = zone; }
    }
    return best;
  }

  /** A frame standing on the ground at lat/lon with its +Z toward `bearingDeg` (0 = north, 90 = east). */
  place(lat: number, lon: number, bearingDeg = 0, lift = 0): Frame {
    const n = dir(lat, lon);
    const origin = groundPoint(n).addScaledVector(n, lift);
    return frameAtBearing(origin, bearingDeg * DEG);
  }
  /** Frame floating at a fixed radius (decks, piers) rather than on the terrain. */
  placeRadius(normal: Vector3, bearingRad: number, radius: number): Frame {
    const n = normal.clone().normalize();
    return frameAtBearing(n.clone().multiplyScalar(radius), bearingRad);
  }
  /** Frame at an arbitrary world direction. */
  placeAt(normal: Vector3, bearingRad = 0, lift = 0): Frame {
    const n = normal.clone().normalize();
    return frameAtBearing(groundPoint(n).addScaledVector(n, lift), bearingRad);
  }

  kit(frame: Frame, zoneId?: string): Kit {
    const zone = zoneId ? this.zones.find(z => z.id === zoneId)! : this.zoneOf(frame.origin);
    const root = frame.matrix;
    return new Kit(frame, new Layer(new CollectorSink(zone.solid), root), new Layer(new CollectorSink(zone.detail), root),
      new Layer(new CollectorSink(zone.foliage), root), new Layer(new CollectorSink(zone.small), root), new Layer(new ColliderSink(this.structures), root));
  }

  /** Kit drawing directly in world coordinates (wires, fences, ropes, scatter). */
  worldKit(zoneId: string): Kit {
    const zone = this.zones.find(z => z.id === zoneId)!;
    const identity = new Matrix4();
    return new Kit(makeFrame(new Vector3(0, 14, 0), new Vector3(0, 0, 1)), new Layer(new CollectorSink(zone.solid), identity), new Layer(new CollectorSink(zone.detail), identity),
      new Layer(new CollectorSink(zone.foliage), identity), new Layer(new CollectorSink(zone.small), identity), new Layer(new ColliderSink(this.structures), identity));
  }

  /** Kit with frame and zone decided from a ground point and a tangent heading. */
  kitAtPoint(point: Vector3, forward: Vector3): Kit {
    return this.kit(makeFrame(point, forward));
  }

  onActivate(id: string, run: (instant: boolean) => void): void {
    (this.hooks.activate[id] ??= []).push(run);
  }
  onUpdate(run: (time: number, dt: number) => void): void { this.hooks.updaters.push(run); }
  onFinale(run: (amount: number) => void): void { this.hooks.finale.push(run); }

  /** Register a sea-wall opening (world-space predicate). */
  open(test: (p: Vector3) => boolean): void { this.openings.push(test); }
}

export type Colors = { [key: string]: ColorLike };
export type { PartOptions };

/** Everything a district needs while it is being authored. */
export interface Ctx {
  b: Builder;
  ground: Ground;
  mats: WorldMaterials;
  group: Group;
  paint: PaintHook[];
}

/** A separately drawn, animatable piece (waterwheel, crane arm, awning...).
 * Geometry is authored in the parent's axes relative to `group`'s origin; the
 * caller rotates/moves `group`. Parts nest: pass another part's group as parent. */
export class Part {
  readonly group = new Group();
  readonly kit: Kit;
  private readonly solid: Collector;
  private readonly detail: Collector;
  private readonly foliage: Collector;
  readonly meshes: Mesh[] = [];
  constructor(private readonly ctx: Ctx, parent: Object3D, readonly frame: Frame, position = new Vector3(), seed = 1) {
    const identity = new Matrix4();
    this.solid = new Collector('plain', mulberry32(900 + seed));
    this.detail = new Collector('glow', mulberry32(950 + seed));
    this.foliage = new Collector('sway', mulberry32(970 + seed));
    this.kit = new Kit(frame, new Layer(new CollectorSink(this.solid), identity), new Layer(new CollectorSink(this.detail), identity),
      new Layer(new CollectorSink(this.foliage), identity), new Layer(new CollectorSink(this.foliage), identity), new Layer(new ColliderSink(ctx.b.structures), frame.matrix));
    this.group.position.copy(position);
    parent.add(this.group);
  }
  /** Build the meshes (call once after authoring). */
  mount(): this {
    const make = (collector: Collector, material: ShaderMaterial, name: string) => {
      const geometry = collector.build();
      if (!geometry) return;
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
      this.group.add(mesh);
      this.meshes.push(mesh);
    };
    make(this.solid, this.ctx.mats.solid, 'PartSolid');
    make(this.detail, this.ctx.mats.detail, 'PartDetail');
    make(this.foliage, this.ctx.mats.foliage, 'PartFoliage');
    return this;
  }
}

/** A group placed at a frame (origin + orientation) in the world. */
export function frameRoot(ctx: Ctx, frame: Frame): Group {
  const root = new Group();
  root.matrixAutoUpdate = false;
  root.matrix.copy(frame.matrix);
  root.matrixWorldNeedsUpdate = true;
  ctx.group.add(root);
  return root;
}

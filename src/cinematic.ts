import { Vector3, type PerspectiveCamera } from 'three';
import { sphereTangent } from './sphere';

/** Keyframed camera shots around the planet. Positions interpolate on
 * spheres around the planet center (direction slerp + radius lerp) so a
 * move from one side to the other never passes through the ground. */
export interface CameraKey {
  /** Seconds from the start of the shot list. */
  at: number;
  direction: Vector3;
  radius: number;
  look: Vector3;
  up: Vector3;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function slerpDirections(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const angle = Math.acos(dot);
  if (angle < 1e-4) return out.copy(a).lerp(b, t).normalize();
  if (Math.PI - angle < 1e-3) {
    // Antipodal: rotate around any perpendicular axis.
    const axis = sphereTangent(a);
    return out.copy(a).applyAxisAngle(axis, angle * t);
  }
  const s = Math.sin(angle);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * angle) / s).addScaledVector(b, Math.sin(t * angle) / s).normalize();
}

export class CinematicCamera {
  private keys: CameraKey[] = [];
  private time = 0;
  private onDone: (() => void) | undefined;
  private holding = false;
  private readonly direction = new Vector3();
  private readonly look = new Vector3();
  private readonly up = new Vector3();

  get active(): boolean { return this.keys.length > 0; }

  /** Start from the camera's current pose, then visit the keys in order.
   * The last key holds until `release()`. */
  play(camera: PerspectiveCamera, keys: Omit<CameraKey, 'at'>[], durations: number[], onDone?: () => void): void {
    const start: CameraKey = {
      at: 0,
      direction: camera.position.clone().normalize(),
      radius: camera.position.length(),
      look: camera.position.clone().add(camera.getWorldDirection(new Vector3()).multiplyScalar(4)),
      up: camera.up.clone(),
    };
    let at = 0;
    this.keys = [start, ...keys.map((key, i) => ({ ...key, at: (at += durations[i] ?? 3) }))];
    this.time = 0;
    this.holding = false;
    this.onDone = onDone;
  }

  release(): void { this.keys = []; this.onDone = undefined; }

  update(dt: number, camera: PerspectiveCamera): void {
    if (!this.keys.length) return;
    this.time += dt;
    const last = this.keys[this.keys.length - 1];
    if (this.time >= last.at && !this.holding) {
      this.holding = true;
      const done = this.onDone;
      this.onDone = undefined;
      done?.();
    }
    let index = 1;
    while (index < this.keys.length - 1 && this.time > this.keys[index].at) index++;
    const a = this.keys[index - 1], b = this.keys[index];
    const t = smooth(Math.min(1, Math.max(0, (this.time - a.at) / Math.max(1e-3, b.at - a.at))));
    slerpDirections(a.direction, b.direction, t, this.direction);
    const radius = a.radius + (b.radius - a.radius) * t;
    camera.position.copy(this.direction).multiplyScalar(radius);
    this.look.lerpVectors(a.look, b.look, t);
    this.up.lerpVectors(a.up, b.up, t).normalize();
    camera.up.copy(this.up);
    camera.lookAt(this.look);
  }
}

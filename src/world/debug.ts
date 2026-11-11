import { Mesh, PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three';
import { dir, PLANET_RADIUS } from '../chapter/data';
import { headingFromBearing } from './frame';
import { terrainHeight } from './terrain';

/** Development-only free camera for screenshots. The follow camera still runs;
 * this overrides its pose right before rendering when a view is set.
 *   __worldDebug.look(lat, lon, alt, targetLat, targetLon, targetAlt, fov?)
 *   __worldDebug.off() */
export function installDebugCamera(carrier: Object3D): (() => void) | undefined {
  const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  if (!dev || typeof window === 'undefined') return undefined;
  let camera: Camera | undefined;
  let view: { position: Vector3; target: Vector3; fov?: number } | null = null;
  carrier.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.isMesh) {
      const previous = mesh.onBeforeRender;
      mesh.onBeforeRender = function (r, sc, c, g, m, gr) { camera = c; previous.call(this, r, sc, c, g, m, gr); };
    }
  });
  const api = {
    look(lat: number, lon: number, alt: number, tlat: number, tlon: number, talt: number, fov?: number) {
      view = {
        position: dir(lat, lon).multiplyScalar(PLANET_RADIUS + alt),
        target: dir(tlat, tlon).multiplyScalar(PLANET_RADIUS + talt),
        fov,
      };
    },
    /** Orbit-style shot: camera at (bearing, distance, elevation) around a ground point. */
    orbit(lat: number, lon: number, bearingDeg: number, distance: number, elevationDeg: number, targetHeight = 1, fov?: number) {
      const n = dir(lat, lon);
      const target = n.clone().multiplyScalar(terrainHeight(n) + targetHeight);
      const heading = headingFromBearing(n, bearingDeg * Math.PI / 180);
      const e = elevationDeg * Math.PI / 180;
      const position = target.clone().addScaledVector(heading, Math.cos(e) * distance).addScaledVector(n, Math.sin(e) * distance);
      view = { position, target, fov };
    },
    raw(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov?: number) {
      view = { position: new Vector3(px, py, pz), target: new Vector3(tx, ty, tz), fov };
    },
    off() { view = null; },
    /** Hide/show the whole world (to measure what everything else costs). */
    visible(on: boolean) { carrier.visible = on; },
  };
  (window as unknown as { __worldDebug: unknown }).__worldDebug = api;
  return () => {
    if (!view || !camera) return;
    camera.position.copy(view.position);
    camera.up.copy(view.target).normalize();
    camera.lookAt(view.target);
    if (view.fov && (camera as PerspectiveCamera).isPerspectiveCamera) {
      const p = camera as PerspectiveCamera;
      if (p.fov !== view.fov) { p.fov = view.fov; p.updateProjectionMatrix(); }
    }
    camera.updateMatrixWorld(true);
  };
}

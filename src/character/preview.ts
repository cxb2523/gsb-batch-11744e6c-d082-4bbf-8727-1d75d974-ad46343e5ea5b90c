import { Color, DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer, CylinderGeometry } from 'three';
import { createCharacter } from './index';
import { createInkRenderer } from '../render';
import { createPlanetShadows } from '../shadows';
import { createToonMaterial, PALETTE, toonShared } from '../art/toon';
import { revival } from '../art/revival';
import type { Character, CharacterPose } from '../contracts';
import type { NpcId } from '../chapter/data';

/** Dev-only character gallery (character-preview.html). Drives characters with
 * deterministic fixed-step updates so screenshots are repeatable:
 *   window.preview.spawn(['player','wick'], 1.5); preview.set('wick', {gesture:'wave'});
 *   preview.advance(1.2); preview.cam({...}); preview.render(); */

type Patch = Partial<Omit<CharacterPose, 'lookAt'>> & { lookAt?: [number, number, number] | null; x?: number; z?: number; yaw?: number };

const BASE_Y = 14;

async function boot() {
  const scene = new Scene();
  scene.background = new Color('#e9e4d8');
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = 'srgb';
  document.querySelector('#world')!.appendChild(renderer.domElement);
  const camera = new PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
  scene.add(new HemisphereLight('#fff5df', '#537d76', 2));
  const sun = new DirectionalLight('#fff0d5', 2.1);
  sun.position.copy(toonShared.uLightPosition.value);
  scene.add(sun);
  const ground = new Mesh(new CylinderGeometry(5, 5, 1, 48).translate(0, -0.5, 0), createToonMaterial({ color: PALETTE.grass }));
  ground.position.y = BASE_Y;
  scene.add(ground);
  const shadows = createPlanetShadows(renderer, scene, sun);
  const ink = await createInkRenderer(renderer, scene, camera);

  const entries = new Map<string, { character: Character; pose: CharacterPose; look: Vector3 | null; x: number; z: number; yaw: number }>();
  let elapsed = 0;
  const target = new Vector3(0, BASE_Y + 0.6, 0);
  const placeCamera = (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 32) => {
    camera.position.set(x, BASE_Y + y, z);
    camera.fov = fov; camera.updateProjectionMatrix();
    target.set(tx, BASE_Y + ty, tz);
    camera.lookAt(target);
  };
  placeCamera(0, 0.9, 6, 0, 0.6, 0);

  const api = {
    ready: true,
    spawn(ids: string[], spacing = 1.4, yaw = 0) {
      for (const entry of entries.values()) scene.remove(entry.character.group);
      entries.clear();
      ids.forEach((id, i) => {
        const character = createCharacter(id.split('#')[0] as NpcId | 'player');
        const x = (i - (ids.length - 1) / 2) * spacing;
        character.group.position.set(x, BASE_Y, 0);
        character.group.rotation.y = yaw;
        scene.add(character.group);
        entries.set(id, { character, pose: { elapsed: 0, dt: 1 / 60, moving: 0, airborne: false, verticalSpeed: 0 }, look: null, x, z: 0, yaw });
      });
      shadows.refresh(); ink.refresh();
      return [...entries.values()].map(entry => entry.character.height);
    },
    set(id: string, patch: Patch) {
      const entry = entries.get(id)!;
      const { lookAt, x, z, yaw, ...rest } = patch;
      Object.assign(entry.pose, rest);
      if (lookAt !== undefined) entry.look = lookAt ? new Vector3(lookAt[0], BASE_Y + lookAt[1], lookAt[2]) : null;
      if (x !== undefined) entry.x = x;
      if (z !== undefined) entry.z = z;
      if (yaw !== undefined) entry.yaw = yaw;
      entry.character.group.position.set(entry.x, BASE_Y, entry.z);
      entry.character.group.rotation.y = entry.yaw;
    },
    /** Step every character forward with a fixed dt. */
    advance(seconds: number, dt = 1 / 60) {
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) {
        elapsed += dt;
        for (const entry of entries.values()) {
          entry.pose.elapsed = elapsed; entry.pose.dt = dt; entry.pose.lookAt = entry.look;
          entry.character.group.updateMatrixWorld(true);
          entry.character.update(entry.pose);
        }
      }
    },
    advanceOne(id: string, seconds: number, dt = 1 / 60) {
      const entry = entries.get(id)!;
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) {
        elapsed += dt;
        entry.pose.elapsed = elapsed; entry.pose.dt = dt; entry.pose.lookAt = entry.look;
        entry.character.group.updateMatrixWorld(true);
        entry.character.update(entry.pose);
      }
    },
    cam: placeCamera,
    revive(on: boolean) {
      revival.reset();
      if (on) revival.addWave(new Vector3(0, BASE_Y, 0), 60, { instant: true });
    },
    render() {
      scene.updateMatrixWorld(true);
      shadows.refresh(); ink.refresh();
      ink.render(1 / 60);
    },
    stats: () => ink.stats(),
    entries,
    attachments(id: string) {
      const a = entries.get(id)!.character.attachments ?? {};
      return Object.fromEntries(Object.entries(a).map(([k, o]) => [k, o!.getWorldPosition(new Vector3()).toArray()]));
    },
  };
  (window as unknown as { preview: typeof api }).preview = api;
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); ink.resize(innerWidth, innerHeight); });
}
boot();

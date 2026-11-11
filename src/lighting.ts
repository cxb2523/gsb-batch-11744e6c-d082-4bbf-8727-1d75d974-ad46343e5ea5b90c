import { Vector3, type Scene, type Mesh, type ShaderMaterial, type DirectionalLight } from 'three';
import { parallelTransport, sphereTangent } from './sphere';
import { toonShared } from './art/toon';

/** Keep the same local sunlight direction on both sides of the planet. A fixed
 * world-space light makes the palette turn dark halfway through exploration. */
export function createPlanetLighting(scene: Scene, sunlight?: DirectionalLight) {
  const lights = new Set<Vector3>();
  scene.traverse(object => {
    const mesh=object as Mesh;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
      if(!(material as ShaderMaterial)?.isShaderMaterial) continue;
      const uniforms=(material as ShaderMaterial).uniforms;
      for(const name of ['uLightPosition','lightPosition']) {
        const value=uniforms[name]?.value;
        if(value?.isVector3) lights.add(value);
      }
    }
  });
  // The real shadow camera uses precisely the same independent sun journey as
  // the palette shaders. Camera orbit and character yaw cannot rotate its map.
  if (sunlight) lights.add(sunlight.position);
  const right=new Vector3(),target=new Vector3(),heading=new Vector3(),previousNormal=new Vector3();
  let initialized=false;
  const seedFrame = (normal: Vector3,forward: Vector3) => {
    heading.copy(sphereTangent(normal,forward));
    previousNormal.copy(normal);
    initialized=true;
  };
  const aim = (position: Vector3,normal: Vector3) => {
    right.crossVectors(heading,normal).normalize();
    // At dusk the sun sinks toward the horizon: lower light, longer shadows (uDusk peaks around .65).
    const dusk = Math.min(1,Math.max(0,toonShared.uDusk.value/.65));
    target.copy(position).addScaledVector(normal,56-26*dusk).addScaledVector(right,-29).addScaledVector(heading,29+8*dusk);
  };
  return {
    /** Restart and pose restore discard the previous journey's transported
     * orientation and light position before the first visible gameplay frame. */
    reset(position: Vector3,normal: Vector3,forward: Vector3) {
      seedFrame(normal,forward);aim(position,normal);
      for(const light of lights) light.copy(target);
      if (sunlight) {
        sunlight.target.position.copy(position);
        sunlight.shadow.camera.up.copy(normal);
        sunlight.target.updateMatrixWorld();
      }
    },
    update(position: Vector3,normal: Vector3,forward: Vector3,dt: number) {
      // Seed once, then transport the sun's own frame. Camera orbit and avatar
      // turning must not slide every building's light/dark boundary around.
      if (!initialized) seedFrame(normal,forward);
      else heading.copy(parallelTransport(heading,previousNormal,normal));
      previousNormal.copy(normal);
      aim(position,normal);
      const amount = 1-Math.exp(-Math.max(0,dt)*3);
      for(const light of lights) light.lerp(target,amount);
      if (sunlight) {
        sunlight.target.position.lerp(position,amount);
        sunlight.shadow.camera.up.copy(normal);
        sunlight.target.updateMatrixWorld();
      }
    },
  };
}

import {
  DirectionalLight, PCFShadowMap, ShaderMaterial, UniformsLib, UniformsUtils,
  type Mesh, type Object3D, type Scene, type WebGLRenderer,
} from 'three';

export { shadowVertexDeclarations, shadowVertexPosition, shadowFragmentDeclarations } from './shadow-glsl';

export const PLANET_SHADOW_HALF_SIZE = 16.8;

/** Shadow setup for the planet sun. Toon materials opt in through
 * `material.userData.planetShadowReceiver` and `castShadow`. Objects added
 * later are configured by `refresh()` (the ink renderer calls it lazily). */
export function createPlanetShadows(renderer: WebGLRenderer, scene: Scene, sunlight: DirectionalLight) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  sunlight.castShadow = true;
  sunlight.name = 'UnspoolPlanetSun';
  const mobile = typeof navigator !== 'undefined' && (
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory! <= 4 ||
    (navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) < 640)
  );
  const resolution = Math.min(mobile ? 1024 : 2048, renderer.capabilities.maxTextureSize);
  sunlight.shadow.mapSize.set(resolution, resolution);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -PLANET_SHADOW_HALF_SIZE;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = PLANET_SHADOW_HALF_SIZE;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 145;
  sunlight.shadow.camera.updateProjectionMatrix();
  sunlight.shadow.normalBias = .049;
  sunlight.shadow.bias = -.0001;
  sunlight.shadow.radius = 1;
  scene.add(sunlight.target);

  const configured = new WeakSet<Object3D>();
  let receivers = 0, casters = 0;
  const refresh = () => scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.material || configured.has(mesh)) return;
    configured.add(mesh);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const shader = material as ShaderMaterial;
      if (!shader.isShaderMaterial || !shader.userData.planetShadowReceiver) continue;
      if (!shader.lights) {
        shader.uniforms = { ...UniformsUtils.clone(UniformsLib.lights), ...shader.uniforms };
        shader.lights = true;
        shader.needsUpdate = true;
      }
      mesh.receiveShadow = true;
      receivers++;
      if (shader.userData.castShadow !== false && !mesh.userData.noShadowCast) { mesh.castShadow = true; casters++; }
    }
  });
  refresh();
  return {
    sunlight,
    refresh,
    stats() {
      let visibleCasterMeshes = 0;
      scene.traverseVisible(object => { if ((object as Mesh).isMesh && object.castShadow) visibleCasterMeshes++; });
      return {
        enabled: renderer.shadowMap.enabled, resolution: sunlight.shadow.mapSize.x,
        halfSize: PLANET_SHADOW_HALF_SIZE, receivers, casters,
        allocated: !!sunlight.shadow.map, actualResolution: sunlight.shadow.map?.width ?? 0,
        visibleCasterMeshes,
      };
    },
  };
}

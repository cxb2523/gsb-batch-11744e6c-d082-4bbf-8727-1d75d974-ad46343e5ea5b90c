# Shader patches

Patch built-in materials with `onBeforeCompile` instead of writing `ShaderMaterial`s: the patched material keeps physically based lighting, shadows, fog, tone mapping and instancing. Every patch reads the shared uniforms in `env.js` (`U.uTime`, `U.uWind`, `U.uNight`, `U.uSunDir`), so a light-preset blend or a recording drives all of them at once.

Two rules:

1. **Vertex patches need a matching depth material** for shadows: `mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })` with the same `onBeforeCompile`. Otherwise the shadow is drawn from the unmoved geometry.
2. **Patches with different code need different cache keys.** Three.js reuses compiled programs by material type; if two materials of the same type get different patches, set `material.customProgramCacheKey = () => 'leaves-evergreen'`.

## Wind sway (instanced foliage)

```js
const sway = `
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float ph = dot(wp.xz, vec2(0.13, 0.17));                       // phase varies across the scene
  transformed.x += sin(uTime * 1.7 + ph) * 0.06 * uWind * (position.y + 1.0);
  transformed.z += cos(uTime * 1.3 + ph * 1.3) * 0.05 * uWind * (position.y + 1.0);`;
const patch = (sh) => {
  Object.assign(sh.uniforms, { uTime: U.uTime, uWind: U.uWind });
  sh.vertexShader = 'uniform float uTime, uWind;\n' +
    sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + sway);
};
leafMaterial.onBeforeCompile = patch;
leafDepth.onBeforeCompile = patch;     // same patch on the depth material
```

Scale the motion with height (`position.y`) so trunks stay planted and crowns move.

## Snow on upward faces

```js
mat.onBeforeCompile = (sh) => {
  sh.uniforms.uSnow = U.uSnow;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uSnow;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 wn = inverseTransformDirection(normal, viewMatrix);
        float s = smoothstep(0.55, 0.85, wn.y) * uSnow;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), s);
        roughnessFactor = mix(roughnessFactor, 0.7, s); }`);
};
```

Snow collects where the world-space normal points up. Add noise to the threshold for patchy cover; fade `uSnow` in over a few seconds.

## Season tint (foliage)

Blend four tints with a `vec4 uSeason` holding spring, summer, autumn and winter weights; tween the vector to change season. Multiply by a per-instance random (`vRand`, from `instanceMatrix` or an instanced attribute) so neighbouring trees differ. For winter, also shrink foliage (`uLeaf` from 1 to 0) in the vertex shader rather than recolouring it brown.

## Windows that light at night

```js
mat.onBeforeCompile = (sh) => {
  sh.uniforms.uNight = U.uNight;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uNight;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float h = fract(sin(dot(floor(vMapUv * vec2(24.0, 6.0)), vec2(12.9898, 78.233))) * 43758.5453);
        float lit = step(0.35, h) * uNight;                         // about two thirds of rooms lit
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * lit * (0.6 + 0.6 * h); }`);
};
```

The hash picks a stable random set of lit windows per window cell. Warm, uneven light reads as rooms; uniform light reads as a texture.

## Water

A plane with a normal map scrolled in two directions at different speeds, `roughness` around 0.08, `metalness` 0, and the environment map doing the reflection. A fountain is particles (`Points` with a small shader for falling droplets) plus a ripple patch on the basin; mark the particles `userData.noAO`.

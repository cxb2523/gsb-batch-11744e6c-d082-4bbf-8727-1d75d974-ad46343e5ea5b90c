import { Color, ShaderMaterial, Vector2 } from 'three';
import { dir } from '../chapter/data';
import { noiseGlsl } from './glsl';
import { revivalGlsl, revivalUniforms } from './revival';
import { PALETTE, toonShared } from './toon';

const WAVE_AXIS = dir(-38, 0);

/** Stylized ocean shell. Keeps the ink renderer's scene-depth contract
 * (`tSceneDepth`, `uUseSceneDepth`, `uResolution`, `uCameraNear/Far`) so the
 * renderer can feed it opaque depth for shoreline foam.
 *
 * Revived: toon depth bands, a ragged foam edge, foam lines that roll toward the
 * shore, bright wave dashes and sun sparkles. Paper: pencil wave strokes that get
 * denser with depth, plus a hand-drawn shoreline. */
export function createWaterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'UnspoolWater',
    transparent: false,
    uniforms: {
      ...revivalUniforms,
      ...toonShared,
      uDeep: { value: new Color('#3a9fb8') },
      uShallow: { value: new Color(PALETTE.water) },
      uFoam: { value: new Color('#f4fbf6') },
      tSceneDepth: { value: null },
      uUseSceneDepth: { value: 0 },
      uResolution: { value: new Vector2(1, 1) },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 200 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying float vViewDepth;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 up = normalize(world.xyz);
        float wave = sin(dot(world.xyz, vec3(1.3, 0.9, 1.1)) + uTime * 1.2) * 0.025
          + sin(dot(world.xyz, vec3(-0.7, 1.6, 0.4)) * 1.7 - uTime * 0.9) * 0.018;
        world.xyz += up * wave;
        vWorldPosition = world.xyz;
        vec4 view = viewMatrix * world;
        vViewDepth = -view.z;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <packing>
      ${revivalGlsl}
      uniform vec3 uDeep, uShallow, uFoam, uPaper, uFringe, uLightPosition;
      uniform sampler2D tSceneDepth;
      uniform float uUseSceneDepth, uCameraNear, uCameraFar, uTime, uDusk, uNight;
      uniform vec2 uResolution;
      varying vec3 vWorldPosition;
      varying float vViewDepth;
      const vec3 WAVE_AXIS = vec3(${WAVE_AXIS.x.toFixed(5)}, ${WAVE_AXIS.y.toFixed(5)}, ${WAVE_AXIS.z.toFixed(5)});

      float softBands(float t, float n, float softness) {
        float x = clamp(t, 0.0, 0.9999) * n;
        float b = floor(x);
        return (b + smoothstep(0.5 - softness * 0.5, 0.5 + softness * 0.5, fract(x))) / n;
      }

      // Pencil strokes: little wavy dashes along latitude circles of the planet.
      float pencilWave(vec3 p, float tone) {
        float h = length(p);
        float lat = acos(clamp(dot(p / h, WAVE_AXIS), -1.0, 1.0)) * uPlanetRadius;
        float s = lat * 6.5 + sin(dot(p, vec3(0.62, 0.21, 0.77)) * 4.2 + uTime * 0.7) * 0.22
          + unSine3(p * 1.3 + uTime * 0.05) * 0.2;
        float id = floor(s);
        float f = abs(fract(s) - 0.5);
        float cyclesPerPixel = fwidth(s);
        float aa = clamp(cyclesPerPixel * 0.8, 0.012, 0.3);
        float halfWidth = mix(0.035, 0.1, tone);
        float stroke = 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, f);
        float along = unNoise3(p * vec3(2.2, 2.2, 2.2) + vec3(id * 3.1, id * 1.3, uTime * 0.04));
        float covered = stroke * smoothstep(0.62 - tone * 0.45, 0.7 - tone * 0.45, along);
        // far away the strokes shrink below a pixel: settle to their average tone
        float average = halfWidth * 2.0 * (0.4 + tone * 0.4);
        return mix(average, covered, 1.0 - smoothstep(0.14, 0.34, cyclesPerPixel));
      }

      void main() {
        vec3 up = normalize(vWorldPosition);
        vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
        // Vertical water depth from the opaque depth the renderer feeds us.
        float dv = 6.0;
        if (uUseSceneDepth > 0.5) {
          float depth = texture2D(tSceneDepth, gl_FragCoord.xy / uResolution).r;
          float sceneView = perspectiveDepthToViewZ(depth, uCameraNear, uCameraFar);
          float thickness = max(-sceneView - vViewDepth, 0.0);
          dv = depth > 0.9999 ? 6.0 : thickness * clamp(abs(dot(viewDirection, up)), 0.3, 1.0);
        }
        float px = clamp(fwidth(dv), 0.003, 0.12);
        float aa = min(px, 0.05);
        float edgeNoise = unNoise3(vWorldPosition * 2.6 + vec3(0.0, uTime * 0.12, 0.0));
        float fineNoise = unNoise3(vWorldPosition * 7.0 - uTime * 0.2);
        vec3 life3 = revivalDetail(vWorldPosition);
        vec2 life = life3.xy;

        // ---- revived water ----
        // Analytic wave normal (matches the vertex displacement) for glints.
        float pa = dot(vWorldPosition, vec3(1.3, 0.9, 1.1)) + uTime * 1.2;
        float pb = dot(vWorldPosition, vec3(-0.7, 1.6, 0.4)) * 1.7 - uTime * 0.9;
        vec3 gradient = cos(pa) * 0.025 * vec3(1.3, 0.9, 1.1) + cos(pb) * 0.018 * 1.7 * vec3(-0.7, 1.6, 0.4);
        gradient += (vec3(unNoise3(vWorldPosition * 9.0 + uTime * 0.6), unNoise3(vWorldPosition * 9.0 + 17.0 - uTime * 0.5),
          unNoise3(vWorldPosition * 9.0 + 31.0)) - 0.5) * 0.35;
        vec3 normal = normalize(up - (gradient - up * dot(gradient, up)));
        vec3 toLight = normalize(uLightPosition - vWorldPosition);

        float depthT = softBands(smoothstep(0.0, 1.5, dv), 4.0, 0.45);
        vec3 lagoon = vec3(0.19, 0.74, 0.7);
        vec3 shallow = mix(lagoon, uShallow, smoothstep(0.0, 0.34, depthT));
        vec3 color = mix(shallow, uDeep, smoothstep(0.34, 1.0, depthT));
        color *= mix(0.94, 1.06, smoothstep(-0.2, 0.9, dot(normal, toLight)));
        // toon wave dashes: thin bright ridges that drift
        float ridge = sin(dot(vWorldPosition, vec3(2.1, 1.3, 1.7)) * 2.3 + uTime * 1.5 + fineNoise * 3.0)
          * sin(dot(vWorldPosition, vec3(-1.2, 2.2, 0.8)) * 1.9 - uTime * 1.1 + edgeNoise * 4.0);
        color = mix(color, color * 1.18 + vec3(0.04, 0.06, 0.06), smoothstep(0.7, 0.78, ridge) * 0.7);
        // foam: a solid ragged edge, plus lines that roll toward the shore
        float foamEdge = 0.05 + 0.035 * sin(uTime * 1.3 + edgeNoise * 9.0) + (edgeNoise - 0.5) * 0.06;
        float foam = 1.0 - smoothstep(foamEdge - aa, foamEdge + aa, dv);
        float rolling = dv * 3.4 + uTime * 0.28 + edgeNoise * 0.8;
        float rollId = floor(rolling);
        float line = smoothstep(0.86, 0.92, fract(rolling)) * (1.0 - smoothstep(0.93, 0.99, fract(rolling)));
        line *= (1.0 - smoothstep(0.55, 1.15, dv)) * smoothstep(0.1, 0.3, dv) * step(0.34, unNoise3(vWorldPosition * 3.2 + rollId * 5.7));
        foam = max(foam, line * 0.9);
        color = mix(color, uFoam, foam);
        // sun sparkles: facet glints in the reflection plus little four-point stars
        vec3 reflected = reflect(viewDirection, normal);
        float glint = max(dot(reflected, toLight), 0.0);
        float sunSide = smoothstep(0.5, 0.97, glint);
        vec3 cellP = vWorldPosition * 11.0;
        vec3 cell = floor(cellP);
        float h = unHash13(cell);
        float pulse = 0.5 + 0.5 * sin(uTime * (1.2 + h * 2.5) + h * 40.0);
        float sparkle = step(0.9, h) * smoothstep(0.35, 1.0, pulse) * (1.0 - smoothstep(0.1, 0.46, length(fract(cellP) - 0.5)));
        color += mix(vec3(1.0, 0.97, 0.85), vec3(1.0, 0.72, 0.45), uDusk) * (sparkle * sunSide * 1.6 + step(0.965, glint) * 0.35) * (1.0 - foam);
        // dusk tint
        color *= mix(vec3(1.0), vec3(0.92, 0.82, 1.0), uDusk * 0.7);

        // ---- paper water ----
        float tone = smoothstep(0.25, 1.6, dv);
        vec3 paper = uPaper * mix(0.97, 0.9, tone * 0.7);
        float strokes = pencilWave(vWorldPosition, tone);
        paper = mix(paper, vec3(0.11, 0.115, 0.15), strokes * mix(0.35, 0.75, tone));
        // hand-drawn shoreline: a graphite line at the waterline and a dashed echo
        float shoreLine = 1.0 - smoothstep(px * 0.6, px * 1.4, abs(dv - 0.05 - (edgeNoise - 0.5) * 0.04));
        float echo = (1.0 - smoothstep(px * 0.6, px * 1.5, abs(dv - 0.2 - (fineNoise - 0.5) * 0.06))) * step(0.5, edgeNoise);
        paper = mix(paper, vec3(0.1, 0.105, 0.14), clamp(shoreLine * 0.6 + echo * 0.35, 0.0, 0.7));
        paper = mix(paper, vec3(1.0), foam * 0.25 * step(dv, 0.12));

        color = mix(paper, color, life.x);
        color = mix(color, uFringe, life.y * 0.45) + uFringe * life.y * 0.08;
        color *= mix(vec3(1.0), vec3(0.3, 0.36, 0.62), uNight);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

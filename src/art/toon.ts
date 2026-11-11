import { Color, DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type Side } from 'three';
import { dir } from '../chapter/data';
import { revivalGlsl, revivalUniforms } from './revival';
import { shadowFragmentDeclarations, shadowVertexDeclarations, shadowVertexPosition } from '../shadow-glsl';

/** Shared art-direction constants. Colors are authored in sRGB hex. */
export const PALETTE = {
  ink: '#2a2c3a',
  paper: '#ece6d8',
  shadowTint: '#8d8fd0',
  grass: '#8cc66b', grassLight: '#a6d17a', sand: '#f0d9a0', path: '#e6c690', rock: '#a3a8b5',
  water: '#4fb8c9', roofTerracotta: '#e0705a', roofTeal: '#4aa39a', roofMustard: '#e8b84a',
  wallCream: '#f6ead2', wallPink: '#f2b8a8', wallBlue: '#9fd0e6', wood: '#b07a4f',
  leaf: '#5fae6a', leafLight: '#79c27a', blossom: '#f5a9c0', lantern: '#ff8a5c',
} as const;

/** One sun position object shared by every toon material; lighting.ts moves it. */
export const toonShared = {
  uLightPosition: { value: new Vector3(-32, 55, 38) },
  uShadowTint: { value: new Color(PALETTE.shadowTint) },
  uPaper: { value: new Color(PALETTE.paper) },
  uFringe: { value: new Color('#ffd27a') },
  /** 0 day … 1 dusk; sky.setDusk() drives it so toon materials and the grade follow. */
  uDusk: { value: 0 },
  /** PROTOTYPE (proto/woven): moonlit night for the woven title. */
  uNight: { value: 0 },
};

/** Stripes per world unit and the wall slope factor of the pencil hatch field. */
const HATCH_FREQUENCY = 12;
const HATCH_SLOPE = 0.9;

export interface ToonOptions {
  /** Base color multiplied with vertex/instance colors. Default white. */
  color?: string | Color;
  /** Use the geometry's `color` attribute (sRGB values converted to linear when authored with Color). */
  vertexColors?: boolean;
  /** Never desaturate to paper: player, threads, sockets, pickups. */
  alwaysAlive?: boolean;
  /** Self-lit amount (lamps, windows at night, socket glow). */
  emissive?: number;
  /** Requires a float `aSway` attribute (0 = rigid, 1 = tip): foliage/flags wind. */
  sway?: boolean;
  side?: Side;
  /** Skip outline contribution (soft effects). */
  noOutline?: boolean;
  name?: string;
  /** Casts shadows (applied by shadows.ts). Default true. */
  castShadow?: boolean;
  /** Pencil hatching strength in the paper state: 0 disables (tiny props), 1 default. */
  hatch?: number;
}

/** Hatching axes: pencil stripes are small circles around these two points of the
 * planet (plus a slope term for walls). The points sit in open sea and on the
 * unimportant back side, where the bull's-eye pattern would not be noticed. */
const HATCH_AXES = [dir(-38, 0), dir(-55, -80)];
const glslVec3 = (v: Vector3) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

const vertexShader = /* glsl */ `
  #include <common>
  ${shadowVertexDeclarations}
  uniform float uTime;
  uniform float uPlanetRadius;
  #ifdef USE_SWAY
    attribute float aSway;
  #endif
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vHatch;
  varying vec2 vHatchOrigin;
  const vec3 HATCH_AXIS_A = ${glslVec3(HATCH_AXES[0])};
  const vec3 HATCH_AXIS_B = ${glslVec3(HATCH_AXES[1])};
  float hatchField(vec3 p, vec3 axis) {
    float h = length(p);
    float ang = acos(clamp(dot(p / max(h, 1e-3), axis), -1.0, 1.0));
    return (ang * uPlanetRadius + (h - uPlanetRadius) * ${HATCH_SLOPE.toFixed(2)}) * ${HATCH_FREQUENCY.toFixed(2)};
  }
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 objectNormal = normal;
    vColor = vec3(1.0);
    #ifdef USE_COLOR
      vColor *= color.rgb;
    #endif
    vec3 origin = modelMatrix[3].xyz;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      objectNormal = mat3(instanceMatrix) * objectNormal;
      origin = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor *= instanceColor.rgb;
    #endif
    vec4 world = modelMatrix * local;
    // Pencil strokes are a world-space field whose phase is zero at the object's
    // origin: stable under camera motion, and they travel with props and characters
    // (translation) instead of sliding over them. World-fixed meshes use origin 0.
    vHatch = world.xyz - origin;
    vHatchOrigin = length(origin) > 0.5 ? vec2(hatchField(origin, HATCH_AXIS_A), hatchField(origin, HATCH_AXIS_B)) : vec2(0.0);
    #ifdef USE_SWAY
      vec3 up = normalize(world.xyz);
      vec3 side = normalize(cross(up, vec3(0.31, 0.83, 0.47)));
      float phase = dot(world.xyz, vec3(0.7, 0.4, 0.6)) + uTime * 1.7;
      world.xyz += (side * sin(phase) + cross(up, side) * cos(phase * 0.8)) * aSway * 0.06;
    #endif
    vWorldPosition = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * objectNormal);
    ${shadowVertexPosition}
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  ${shadowFragmentDeclarations}
  ${revivalGlsl}
  uniform vec3 uColor;
  uniform vec3 uLightPosition;
  uniform vec3 uShadowTint;
  uniform vec3 uPaper;
  uniform vec3 uFringe;
  uniform float uAlwaysAlive;
  uniform float uEmissive;
  uniform float uFlatten;
  uniform float uHatch;
  uniform float uDusk;
  uniform float uNight;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vHatch;
  varying vec2 vHatchOrigin;
  const vec3 HATCH_AXIS_A = ${glslVec3(HATCH_AXES[0])};
  const vec3 HATCH_AXIS_B = ${glslVec3(HATCH_AXES[1])};
  float hatchField(vec3 p, vec3 axis) {
    float h = length(p);
    float ang = acos(clamp(dot(p / max(h, 1e-3), axis), -1.0, 1.0));
    return (ang * uPlanetRadius + (h - uPlanetRadius) * ${HATCH_SLOPE.toFixed(2)}) * ${HATCH_FREQUENCY.toFixed(2)};
  }

  // Pencil coverage 0..1 of one stripe family. Strokes fatten with tone (pencil
  // pressure), wander a little, vary per stroke and break up along their length.
  float pencilFamily(float phase, vec3 hp, float tone, float seed, float aa) {
    float s = phase + unSine3(hp * 1.3 + seed) * 0.22;
    float id = floor(s);
    float f = fract(s) - 0.5;
    float r = unHash12(vec2(id, seed));
    float halfWidth = mix(0.04, 0.15, tone) * mix(0.7, 1.2, r);
    float stroke = 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(f));
    float along = unSine3(hp * 3.4 + vec3(id * 1.37, seed * 3.1, id * 0.61));
    float keep = smoothstep(mix(0.0, -0.9, tone), mix(0.45, -0.45, tone), along);
    return stroke * keep * mix(0.6, 1.0, r);
  }

  vec3 sketchColor(vec3 base, float lightAmt, float halfLight, float skyFill, vec3 hp,
      vec2 phase, vec2 fw, float pixelWorld) {
    float value = sqrt(max(unLuma(base), 0.0));
    float dark = 1.0 - smoothstep(0.25, 1.0, value);
    // 0 = fully lit paper, 1 = deepest shade (self shadow + cast shadow).
    float shade = clamp((1.0 - lightAmt) * 0.55 + (1.0 - halfLight) * 0.45, 0.0, 1.0);
    vec3 paper = uPaper * (1.0 - 0.07 * dark);
    paper *= mix(1.0, 0.9, shade);
    paper *= mix(vec3(1.0), vec3(0.95, 0.95, 1.03), shade);
    paper *= 1.0 + 0.03 * unSine3(hp * 0.55) + 0.018 * unSine3(hp * 1.7 + 4.0);
    float tone = clamp((shade - 0.18) * 1.25 * (0.55 + 0.6 * dark + (1.0 - skyFill) * 0.25), 0.0, 1.0) * uHatch;
    if (tone > 0.02) {
      // Screen-stable pencil: pick the stripe octave so strokes stay ~6–12 px
      // apart at any distance (close-ups double the frequency instead of
      // drawing fat bars), and cross-fade between neighbouring octaves.
      vec2 spacing = 1.0 / max(fw, vec2(1e-4));
      vec2 level = clamp(log2(spacing / 7.0), vec2(0.0), vec2(5.0));
      vec2 k = floor(level), t = fract(level);
      vec2 resolved = 1.0 - smoothstep(vec2(0.16), vec2(0.34), fw);
      float coverage = 0.0;
      float a0 = pencilFamily(phase.x * exp2(k.x), hp, tone, 1.0, clamp(fw.x * exp2(k.x) * 0.8, 0.02, 0.3));
      float a1 = pencilFamily(phase.x * exp2(k.x + 1.0), hp, tone, 1.0, clamp(fw.x * exp2(k.x + 1.0) * 0.8, 0.02, 0.3));
      coverage = mix(a0, a1, t.x) * resolved.x;
      float crossAmount = smoothstep(0.6, 0.9, tone);
      if (crossAmount > 0.0) {
        float b0 = pencilFamily(phase.y * exp2(k.y), hp, tone, 7.0, clamp(fw.y * exp2(k.y) * 0.8, 0.02, 0.3));
        float b1 = pencilFamily(phase.y * exp2(k.y + 1.0), hp, tone, 7.0, clamp(fw.y * exp2(k.y + 1.0) * 0.8, 0.02, 0.3));
        coverage = max(coverage, mix(b0, b1, t.y) * resolved.y * crossAmount);
      }
      float average = mix(0.035, 0.14, tone) * 1.2;
      coverage = mix(average, coverage, resolved.x);
      vec3 graphite = vec3(0.16, 0.165, 0.2);
      paper = mix(paper, graphite, clamp(coverage * 0.55, 0.0, 0.6));
    }
    return paper;
  }

  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 toLight = normalize(uLightPosition - vWorldPosition);
    float diffuse = dot(n, toLight);
    float shadow = sunShadow();
    float lightAmt = smoothstep(-0.02, 0.06, diffuse) * shadow;
    float halfLight = smoothstep(-0.32, -0.04, diffuse);
    // A soft sky fill keeps the dark side readable on both planet halves.
    vec3 radial = normalize(vWorldPosition);
    float skyFill = 0.5 + 0.5 * dot(n, radial);
    // uFlatten keeps only the vertex colors' brightness pattern (dyed yarn).
    vec3 base = uColor * mix(vColor, vec3(dot(vColor, vec3(0.299, 0.587, 0.114)) * 1.25), uFlatten);
    float pixelWorld = max(length(dFdx(vHatch)), length(dFdy(vHatch)));
    vec2 phase = vec2(hatchField(vWorldPosition, HATCH_AXIS_A), hatchField(vWorldPosition, HATCH_AXIS_B)) - vHatchOrigin;
    vec2 fw = vec2(fwidth(phase.x), fwidth(phase.y));

    vec3 life = uAlwaysAlive > 0.5 ? vec3(1.0, 0.0, 0.0) : revivalDetail(vWorldPosition);
    float alive = max(life.x, uAlwaysAlive);

    // Revived: clean flat toon colors, cool violet shade, a soft sky-colored rim.
    vec3 shadeTint = mix(vec3(1.0), uShadowTint, 0.9);
    vec3 deep = base * mix(shadeTint * 0.86, shadeTint, skyFill);
    vec3 mid = mix(deep, base, 0.42);
    vec3 colored = mix(mix(deep, mid, halfLight), base, lightAmt);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - clamp(dot(n, viewDirection), 0.0, 1.0), 3.0) * skyFill;
    colored += base * rim * vec3(0.08, 0.13, 0.16);
    // Dusk warms the light side and deepens the shade.
    colored *= mix(vec3(1.0), mix(vec3(0.84, 0.78, 1.02), vec3(1.0, 0.8, 0.68), lightAmt), uDusk);

    vec3 color = colored;
    if (alive < 0.995) {
      vec3 sketch = sketchColor(base, lightAmt, halfLight, skyFill, vHatch, phase, fw, pixelWorld);
      color = mix(sketch, colored, alive);
    }
    color *= mix(vec3(1.0), vec3(0.34, 0.38, 0.62), uNight);
    color += base * uEmissive * alive;
    float fringe = life.y * (1.0 - uAlwaysAlive);
    color = mix(color, uFringe, fringe * 0.42) + uFringe * fringe * 0.16;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The single surface material used by world, characters and props. All
 * instances share sun, palette and revival uniforms by reference. */
export function createToonMaterial(options: ToonOptions = {}): ShaderMaterial {
  const material = new ShaderMaterial({
    name: options.name ?? 'UnspoolToon',
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.lights),
      ...revivalUniforms,
      ...toonShared,
      uColor: { value: new Color(options.color ?? '#ffffff') },
      uAlwaysAlive: { value: options.alwaysAlive ? 1 : 0 },
      uEmissive: { value: options.emissive ?? 0 },
      uFlatten: { value: 0 },
      uHatch: { value: options.hatch ?? 1 },
    },
    vertexShader,
    fragmentShader,
    lights: true,
    vertexColors: !!options.vertexColors,
  });
  const side = options.side ?? (options.sway ? DoubleSide : undefined);
  if (side !== undefined) material.side = side;
  if (options.sway) material.defines = { ...material.defines, USE_SWAY: '' };
  material.userData.planetShadowReceiver = true;
  material.userData.castShadow = options.castShadow ?? true;
  material.userData.noOutline = !!options.noOutline;
  return material;
}

/** Linear-space color for vertex/instance color attributes. */
export function linearColor(hex: string): Color {
  return new Color(hex);
}

import {
  AddEquation, Color, CustomBlending, DoubleSide, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial,
  SrcAlphaFactor, UniformsLib, UniformsUtils, ZeroFactor,
} from 'three';
import { THREAD_COLORS, type ThreadKind } from '../chapter/data';
import { toonShared } from '../art/toon';
import { shadowFragmentDeclarations, shadowVertexDeclarations, shadowVertexPosition } from '../shadow-glsl';

/** One clock for every thread shader; the system advances it from frame.time. */
export const threadClock = { value: 0 };

export const KIND_INDEX: Record<ThreadKind, number> = { power: 0, water: 1, lights: 2, voice: 3, root: 4 };

const cordVertex = /* glsl */ `
  #include <common>
  ${shadowVertexDeclarations}
  uniform float uTime;
  uniform float uKind;
  uniform float uPulse;
  attribute float aAlong;
  attribute float aAngle;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vAlong;
  varying float vAngle;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Voice threads hum: a soft travelling wobble, always on.
    if (uKind > 2.5 && uKind < 3.5) {
      vec3 up = normalize(world.xyz);
      world.xyz += up * (sin(aAlong * 4.2 - uTime * 9.0) * 0.011 + sin(aAlong * 9.0 + uTime * 15.0) * 0.005);
    }
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    // The light pulse swells the cord as it passes.
    if (uPulse >= 0.0) {
      float d = aAlong - uPulse;
      world.xyz += worldNormal * 0.032 * exp(-d * d * 2.2);
    }
    vWorldPosition = world.xyz;
    vNormal = worldNormal;
    vAlong = aAlong;
    vAngle = aAngle;
    ${shadowVertexPosition}
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const cordFragment = /* glsl */ `
  ${shadowFragmentDeclarations}
  uniform vec3 uColor;
  uniform vec3 uLightPosition;
  uniform vec3 uShadowTint;
  uniform float uTime;
  uniform float uKind;
  uniform float uPulse;
  uniform float uFlash;
  uniform float uClip;
  uniform float uReel;
  uniform float uSeed;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vAlong;
  varying float vAngle;
  float hash11(float p) { return fract(sin(p * 127.1 + uSeed) * 43758.5453); }
  void main() {
    if (vAlong > uClip) discard;
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 toLight = normalize(uLightPosition - vWorldPosition);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float facing = clamp(dot(n, viewDir), 0.0, 1.0);
    float edge = 1.0 - facing;

    vec3 base = uColor;
    vec3 glow = vec3(0.0);
    float spec = 0.0;
    // Twisted stripe: a diagonal band winding once around every ~0.6 units.
    float flowing = (uKind > 0.5 && uKind < 1.5) ? uTime * 0.9 : 0.0;
    float twist = fract(vAngle + vAlong * 1.7 - flowing);
    float stripe = smoothstep(0.0, 0.07, twist) * (1.0 - smoothstep(0.24, 0.31, twist));

    if (uKind < 0.5) {
      // power: warm cord, occasional sparks racing along it
      base = mix(base, mix(base, vec3(1.0), 0.36), stripe);
      float sp = vAlong * 0.5 - uTime * 2.4;
      float cell = floor(sp);
      float f = fract(sp);
      float on = step(0.8, hash11(cell));
      float spark = on * smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(0.05, 0.26, f));
      glow += vec3(1.0, 0.93, 0.55) * spark * 1.6;
    } else if (uKind < 1.5) {
      // water: translucent-looking hose, deep edges, light core, flowing bubbles
      vec3 deep = uColor * 0.58;
      vec3 light = mix(uColor, vec3(0.84, 0.97, 1.0), 0.62);
      base = mix(light, deep, smoothstep(0.1, 0.95, edge));
      base = mix(base, vec3(0.9, 0.99, 1.0), stripe * 0.5);
      float flow = fract(vAlong * 0.75 - uTime * 0.8);
      float band = smoothstep(0.0, 0.08, flow) * (1.0 - smoothstep(0.08, 0.42, flow));
      base = mix(base, light * 1.06, band * (1.0 - edge) * 0.55);
      vec3 h = normalize(toLight + viewDir);
      spec = smoothstep(0.94, 0.975, dot(n, h)) * 0.6;
    } else if (uKind < 2.5) {
      // lights: coral cord with a warm ribbon
      base = mix(base, mix(base, vec3(1.0, 0.92, 0.6), 0.5), stripe);
    } else if (uKind < 3.5) {
      // voice: red cord, soft pulses of sound travelling toward the far end
      base = mix(base, mix(base, vec3(1.0, 0.8, 0.82), 0.4), stripe);
      float rip = fract(vAlong * 0.4 - uTime * 0.75);
      float ring = smoothstep(0.0, 0.04, rip) * (1.0 - smoothstep(0.04, 0.17, rip));
      glow += vec3(1.0, 0.55, 0.6) * ring * 0.38;
    } else {
      // root: green cord with darker twist and little lighter knots
      base = mix(base, base * 0.68, stripe);
      float knot = step(0.9, fract(vAlong * 1.9)) * smoothstep(0.45, 0.0, abs(vAngle - 0.5));
      base = mix(base, mix(base, vec3(1.0), 0.28), knot);
    }

    float diffuse = dot(n, toLight);
    float lit = smoothstep(-0.02, 0.06, diffuse) * sunShadow();
    float skyFill = 0.5 + 0.5 * dot(n, normalize(vWorldPosition));
    vec3 shade = base * mix(uShadowTint * 0.82, uShadowTint, skyFill);
    vec3 color = mix(shade, base, lit);
    color += base * 0.1 + glow + vec3(spec);

    if (uPulse >= 0.0) {
      float dd = vAlong - uPulse;
      float core = exp(-dd * dd * 2.4);
      float trail = dd < 0.0 ? exp(dd * 0.7) * 0.6 : 0.0;
      vec3 hot = mix(uColor * 1.5, vec3(1.0, 0.97, 0.88), core);
      color += hot * (core * 2.4 + trail * 0.9);
    }
    color += uColor * uFlash * 0.5;
    float zip = exp(-(uClip - vAlong) * (uClip - vAlong) * 5.0) * uReel;
    color = mix(color, vec3(1.0, 0.98, 0.9), clamp(zip, 0.0, 1.0) * 0.85);
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Cord material: toon-lit like everything else but never paper. The ink
 * renderer keys its program/surface id on `name` + `.color`, so we expose a
 * color (sharing one program across threads of the same kind). */
export function createCordMaterial(kind: ThreadKind, seed = 0): ShaderMaterial {
  const color = new Color(THREAD_COLORS[kind]);
  const material = new ShaderMaterial({
    name: `UnspoolThread:${kind}`,
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.lights),
      ...toonShared,
      uTime: threadClock,
      uColor: { value: color },
      uKind: { value: KIND_INDEX[kind] },
      uPulse: { value: -1 },
      uFlash: { value: 0 },
      uClip: { value: 1e5 },
      uReel: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: cordVertex,
    fragmentShader: cordFragment,
    lights: true,
  });
  (material as unknown as { color: Color }).color = color;
  material.userData.planetShadowReceiver = true;
  // A 7 cm cord casts a sliver of shadow at best; skip the extra shadow-pass draw per thread.
  material.userData.castShadow = false;
  return material;
}

const beamVertex = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  attribute float aLevel;
  attribute float aPhase;
  varying float vY;
  varying float vLevel;
  varying vec3 vTint;
  varying float vPhase;
  void main() {
    vec4 local = instanceMatrix * vec4(position, 1.0);
    vY = clamp(position.y / uHeight, 0.0, 1.0);
    vLevel = aLevel;
    vPhase = aPhase;
    vTint = instanceColor;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * local;
  }
`;

const beamFragment = /* glsl */ `
  uniform float uTime;
  varying float vY;
  varying float vLevel;
  varying vec3 vTint;
  varying float vPhase;
  void main() {
    float fade = (1.0 - vY);
    fade *= fade;
    float shimmer = 0.82 + 0.18 * sin(vY * 9.0 - uTime * 3.2 + vPhase);
    gl_FragColor = vec4(mix(vTint, vec3(1.0), 0.25), fade * vLevel * shimmer * 0.5);
  }
`;

/** Soft vertical light column above an active socket. Transparent, so the ink
 * pass ignores it; alpha-channel writes are blocked to keep the surface ids intact. */
export function createBeamMaterial(height: number): ShaderMaterial {
  const material = new ShaderMaterial({
    name: 'UnspoolSocketBeam',
    uniforms: { uTime: threadClock, uHeight: { value: height } },
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendEquationAlpha: AddEquation,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
  material.userData.noOutline = true;
  return material;
}

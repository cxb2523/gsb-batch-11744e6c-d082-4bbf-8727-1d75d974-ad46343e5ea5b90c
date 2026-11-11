/** Shared GLSL snippets for the look workstream. Everything is procedural; no
 * textures. All helpers are prefixed `un` and wrapped in an include guard, so
 * toon, revival, water, sky and fx shaders can each include them (or include
 * several modules that already do) without redefinition errors. */
export const noiseGlsl = /* glsl */ `
#ifndef UN_NOISE_GLSL
#define UN_NOISE_GLSL
// Hashes: "Hash without Sine" by David Hoskins, MIT license (shadertoy.com/view/4djSRW).
float unHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float unHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 unHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 unHash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float unNoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(unHash12(i), unHash12(i + vec2(1.0, 0.0)), f.x),
             mix(unHash12(i + vec2(0.0, 1.0)), unHash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float unNoise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(unHash13(i), unHash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(unHash13(i + vec3(0.0, 1.0, 0.0)), unHash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(unHash13(i + vec3(0.0, 0.0, 1.0)), unHash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(unHash13(i + vec3(0.0, 1.0, 1.0)), unHash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float unFbm2(vec2 p) {
  return unNoise2(p) * 0.55 + unNoise2(p * 2.03 + 11.7) * 0.3 + unNoise2(p * 4.1 + 3.1) * 0.15;
}
float unFbm3(vec3 p) {
  return unNoise3(p) * 0.6 + unNoise3(p * 2.07 + 5.3) * 0.4;
}
// Cheap smooth pseudo-noise from nested sines, roughly in [-1, 1]. Good for
// slow wobble and stroke breaks where exact statistics do not matter.
float unSine3(vec3 p) {
  return (sin(p.x + sin(p.y * 1.7 + 0.7)) + sin(p.y * 1.3 + sin(p.z * 1.9 + 1.9)) + sin(p.z * 1.1 + sin(p.x * 2.3 + 3.1))) * 0.3333;
}
float unLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Authoring helper: a literal sRGB color to the linear working space.
vec3 unSrgb(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
// Authoring helper: 0xRRGGBB sRGB literal to the linear working space.
vec3 unHex(int h) { return unSrgb(vec3(float((h >> 16) & 255), float((h >> 8) & 255), float(h & 255)) / 255.0); }
#endif
`;

/** Build-time twin of `unHex`: a literal linear-space vec3 for a 0xRRGGBB sRGB color, so shaders
 * pay nothing at run time for palette constants (call it inside the shader template string). */
export function glslColor(hex: number): string {
  const channel = (value: number) => {
    const c = value / 255;
    const linear = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return linear.toFixed(5);
  };
  return `vec3(${channel((hex >> 16) & 255)}, ${channel((hex >> 8) & 255)}, ${channel(hex & 255)})`;
}

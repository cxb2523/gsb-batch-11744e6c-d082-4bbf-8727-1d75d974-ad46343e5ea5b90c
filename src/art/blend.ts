import {
  AddEquation, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, ZeroFactor, type Material,
} from 'three';

/** Blend an overlay (particles, decals, soft sky lines) without touching the destination
 * alpha channel: the ink renderer stores the surface id there, and a plain alpha-blended
 * overlay would smear it, drawing contour-like ink lines where the id quantizes.
 * Color blends as `src.rgb * src.a + dst.rgb * (1 - src.a)`, or additively. */
export function overlayBlending(material: Material, additive = false): void {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = CustomBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = SrcAlphaFactor;
  material.blendDst = additive ? OneFactor : OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = ZeroFactor;
  material.blendDstAlpha = OneFactor;
}

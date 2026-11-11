/** Shared receiver contract: vWorldPosition and vNormal are world-space values.
 * Three owns shadow matrices, native depth textures and the skinned/batched depth
 * passes; our palette shaders only use their occlusion when choosing light/dark. */
export const shadowVertexDeclarations = /* glsl */ `
  #include <shadowmap_pars_vertex>
`;
export const shadowVertexPosition = /* glsl */ `
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
      vDirectionalShadowCoord[i] = directionalShadowMatrix[i] * vec4(
        vWorldPosition + normalize(vNormal) * directionalLightShadows[i].shadowNormalBias, 1.0
      );
    }
    #pragma unroll_loop_end
  #endif
`;
export const shadowFragmentDeclarations = /* glsl */ `
  #include <common>
  #include <packing>
  #include <shadowmap_pars_fragment>
  float sunShadow() {
    float visibility = 1.0;
    #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
      #pragma unroll_loop_start
      for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
        visibility = min(visibility, getShadow(directionalShadowMap[i],
          directionalLightShadows[i].shadowMapSize, directionalLightShadows[i].shadowIntensity,
          directionalLightShadows[i].shadowBias, directionalLightShadows[i].shadowRadius,
          vDirectionalShadowCoord[i]));
      }
      #pragma unroll_loop_end
    #endif
    return visibility;
  }
`;

// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
vec4 FvEffect(uvec4 uv4Cen, vec4 v4Color, uint activeFv, float time) {
    uint fvSplat = uv4Cen.w >> 17u;
    if (fvSplat > 0u && fvSplat == activeFv) {
        return vec4(v4Color.rgb * fnWave(1.0, 1.6, time), v4Color.a);
    }
    return v4Color;
}

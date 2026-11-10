// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
vec3 WatermarkEffect(vec3 v3Cen, bool isWatermark, bool enableEffect, float time) {
    if (isWatermark && enableEffect) {
        v3Cen.y += sin(time * 0.002 + v3Cen.x) * 0.1; // 水印动画
    }
    return v3Cen;
}

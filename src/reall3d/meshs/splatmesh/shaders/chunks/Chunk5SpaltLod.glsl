// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
#ifdef BigSceneMode
if (useLod && ! isWatermark) {
int lod = int(cen.w >> 30u);
float distance = length(v3Cen - cameraPosition);
if (distance < 50.0) {
if (lod < 2) {
vColor = vec4(0.0);
return;
}
} else if (distance > 80.0) {
if (lod > 0) {
vColor = vec4(0.0);
return;
}
}
}
#endif
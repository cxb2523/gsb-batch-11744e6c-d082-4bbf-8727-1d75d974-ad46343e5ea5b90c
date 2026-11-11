# Performance

## Measure first

`site-check` reports milliseconds per frame over 60 real frames and, when the page exposes `window.__app.renderer`, draw calls and triangles for a whole frame (all passes). Headless Chromium on a real GPU (Metal on macOS) gives repeatable numbers; compare runs against each other, not against a phone. If the reported renderer is SwiftShader or llvmpipe, the numbers are software rendering and meaningless.

In the browser, `renderer.info` after one frame with `info.autoReset = false` gives the same counts.

## Budget (laptop GPU, 1440x900, high tier)

| | Target |
| --- | --- |
| Frame time | under 10 ms (leaves headroom for 60 fps on weaker machines) |
| Draw calls | under 300 |
| Triangles | under 2 million |
| Shader programs | under 40 (each new material variant compiles one, and compiling stalls) |
| Textures | under 100 MB of GPU memory |

## Fixes, biggest first

1. **Instance repeated parts.** One `InstancedMesh` per part type. This is usually a 10x win on architecture, forests, crowds, traffic.
2. **Merge static meshes** that share a material and never move (`mergeGeometries`).
3. **Quality tiers.** Device pixel ratio is the largest single cost: `high` caps it at 2, `balanced` at 1.5, `fast` at 1. GTAO costs about as much as the rest of the frame; drop it in `balanced` or `fast` if needed. Shadow maps go from 4096 to 2048 in `fast`.
4. **Shadows.** Only things that cast visible shadows get `castShadow`: not small props, not distant buildings, not flat ground decals. Point-light shadows render six times (a cube); give at most one or two lights shadows.
5. **Hide dark lights.** A light at intensity 0 still renders its shadow map.
6. **Do not render idle frames.** When nothing animates and the camera is still, skip `composer.render()`. On a laptop this is the difference between a fan and silence.
7. **Pre-compile** with `renderer.compile(scene, camera)` behind the loader, so the first orbit does not stutter while shaders compile.
8. **Textures**: power-of-two canvas textures with mipmaps; 512 or 1024 is enough for tiling materials. Use KTX2 for large photographic textures if you have any.

## Auto tiering

The starter averages frame time over three-second windows and drops one tier when the average exceeds 25 ms. It never raises the tier again in a session (oscillating quality is worse than slightly low quality), never acts during a recording, and ignores frames longer than 250 ms (tab switches).

## Phones

- Expect a third of laptop throughput. Start phones on `balanced`.
- Touch: `OrbitControls` handles one-finger orbit and pinch; set `touch-action: none` on the canvas so the page does not scroll instead.
- Safe areas: keep UI above `env(safe-area-inset-bottom)`.

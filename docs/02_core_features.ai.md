# Core Features

## Key Advantages

### 1. Native Support for 100‑Million‑Scale 3DGS Point Clouds
- Built‑in adaptive LOD enables streaming loading of massive scenes with **100+ million points**.

### 2. Proprietary SPX Format – High Compression
- **>95% size reduction** compared to PLY, significantly faster loading.
- Natively supports streaming rendering and LOD‑aware tiling.
- Cross‑platform conversion tool: **gsbox**.

### 3. Deep Cross‑Platform Optimization (Benchmarked with 150‑Million‑Point Scene)
| Device Type | Performance |
|-------------|-------------|
| Desktop (discrete GPU) | Stable **60 FPS** |
| Thin‑and‑light laptop (iGPU) | Stable **30 FPS** |
| Modern smartphone | **25–40 FPS**, excellent thermal control |
| Older smartphone | **7–15 FPS+**, stable, no crashes |

- Configurable cache and stable memory usage, no leaks.

### 4. Extensive Format Compatibility
- **Native**: `.ply`, `.splat`, `.spx`, `.spz`, `.sog`
- **Extended**: `.glb` files with `KHR_gaussian_splatting` extension

### 5. Production‑Ready Commercial Tools – Out of the Box
- Annotation, distance & angle measurement
- Custom watermarking
- GIS basemap integration
- Per‑model independent configuration (`.meta.json`)

## Key Strengths
| Feature | Reall3dViewer |
|---------|---------------|
| Large‑scene loading | Built‑in adaptive LOD, native streaming for 100M+ points |
| Efficient compression | Proprietary **SPX** format + cross‑platform `gsbox` tool |
| Cross‑device performance | Deep mobile optimization, validated by rigorous thermal & performance tests |
| Out‑of‑box tooling | Measurement, annotation, GIS integration – production ready |
| Community & support | Continuously updated, fast issue responses, comprehensive examples |


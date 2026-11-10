# Project Overview

## 1. Project Positioning

**Reall3dViewer** is an open‑source WebGL renderer for 3D Gaussian Splatting (3DGS), built on **Three.js**. It focuses on large‑scene streaming rendering + adaptive LOD + cross‑platform high performance optimization. Released under the **MIT License** – free for commercial use.

- **GitHub**: https://github.com/reall3d-com/Reall3dViewer
- **Live Demos**:
  - [Demo 1](https://reall3d.com/reall3dviewer/examples/index.html?url=kcczt.scene.json&debug=true)
  - [Demo 2](https://reall3d.com/reall3dviewer/examples/index.html?url=hgd-lod-meta.scene.json&debug=true)
- **npm**: `@reall3d/reall3dviewer`

## 2. Core Goals

- Enable smooth interaction with **hundreds of millions of Gaussian points** directly in a browser
- Deliver **consistent rendering experience** across desktops and mobile devices
- Provide a **plug‑and‑play, lightweight embeddable** solution – no extra plugins required
- Provide production‑grade toolchains: measurement, annotation, watermarking, GIS integration

## 3. Technology Stack

- **Core engine**: Three.js
- **Proprietary technologies**: Adaptive LOD, frustum culling, efficient sorting algorithm
- **Proprietary format**: SPX (high‑compression streaming 3DGS format – **>95% size reduction** compared to PLY)
- **Language**: TypeScript / JavaScript

## 4. Target Audience

- Front‑end developers needing fast 3D integration
- 3DGS researchers who need browser‑based preview of massive scenes
- Enterprises in surveying, mapping, and reality capture
- Digital twin, smart city, and smart exhibition projects
- Industrial design, cultural tourism, and metaverse applications

## 5. Maintenance & Community Support

- Continuously active development, fast issue responses
- Chinese community support: documentation and technical assistance available in Chinese
- **License**: MIT – free for commercial use
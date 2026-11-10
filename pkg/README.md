<p align="center">
  <img style="width:128px;height:128px" src="https://gotoeasy.github.io/reall3d/logo.png"/>
</p>

# Reall3dViewer

**Reall3dViewer** is a `Three.js`-based Web renderer for **3D Gaussian Splatting (3DGS)**. It focuses on large‑scene streaming rendering, adaptive LOD, and cross‑platform high‑performance optimization, providing high‑performance Web rendering support for enterprise‑grade 3DGS applications.

<br>

<p align="center">
    <a href="https://zread.ai/reall3d-com/Reall3dViewer"><img src="https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff" alt="Ask Zread" /></a>
    <a href="https://github.com/reall3d-com/Reall3dViewer/blob/master/README_ZH.md"><img src="https://img.shields.io/badge/readme-Chinese-brightgreen.svg"></a>
    <a href="https://github.com/mrdoob/three.js"><img src="https://img.shields.io/badge/base-Threejs-brightgreen.svg"></a>
    <a href="https://github.com/reall3d-com/Reall3dViewer/releases/latest"><img src="https://img.shields.io/github/release/reall3d-com/Reall3dViewer.svg"></a>
    <a href="https://github.com/reall3d-com/Reall3dViewer/blob/master/LICENSE"><img src="https://img.shields.io/github/license/reall3d-com/Reall3dViewer"></a>
<p>
<br>

## ✨ Features

- ✅ **Multi‑format support**: `.ply`, `.splat`, `.spx`, `.spz`, `.sog`, `.glb` (with `KHR_gaussian_splatting` extension)
- ✅ **Built‑in measurement & annotation**: distance, area, flexible labeling
- ✅ **Spherical harmonics**: supports SH degree 1–3
- ✅ **Map scene rendering**: GIS basemap integration
- ✅ **Per‑model independent configuration**: via `.meta.json` files
- ✅ **Adaptive rendering quality**: multiple quality levels, auto‑optimized per device
- ✅ **Multiple sorting algorithms**: choose optimal strategy for different scenes
- ✅ **Large‑scene streaming**: preset‑based LOD, smooth loading for 100M+ points

## 🚀 Benchmarked Performance

> Tested on a 150‑million‑point scene: Desktop (discrete GPU) **60 FPS**, iGPU laptop **30 FPS**, modern smartphone **25‑40+ FPS**, older smartphone **7‑15+ FPS** – stable, no overheating, no crashes.

## 🌐 Live Demos

- [LOD large scene with debug panel](https://reall3d.com/reall3dviewer/examples/index.html?url=hgd-lod-meta.scene.json&debug=true)
- [Complete indoor exhibition LOD large scene](https://reall3d.com/reall3dviewer/examples/index.html?url=kcczt.scene.json)

> You can also load your own model via URL parameter:  
> `https://reall3d.com/reall3dviewer/examples/index.html?url=your-model.sog&debug=true`

## 🛠️ Quick Start

Install

```shell
npm i @reall3d/reall3dviewer
```

Use Reall3dViewer

```js
const viewer = new Reall3dViewer({ root: '#viewer2' });
viewer.addModel(`https://reall3d.com/demo-models/yz.spx`);
```

Use Reall3dMapViewer

```js
const mapViewer = new Reall3dMapViewer({ root: '#viewer4' });
mapViewer.addScenes('https://reall3d.com/demo-models/map/00.scenes.json');
```

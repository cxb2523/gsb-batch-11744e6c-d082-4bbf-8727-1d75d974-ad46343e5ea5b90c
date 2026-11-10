<p align="center">
  <img style="width:128px;height:128px" src="https://gotoeasy.github.io/reall3d/logo.png"/>
</p>

# Reall3dViewer

**Reall3dViewer** 是一款基于 `Three.js` 的 **3D 高斯泼溅 (3DGS)** Web 渲染器，专注于大规模场景流式渲染、自适应 LOD 及跨平台高性能优化，为企业级 3DGS 应用提供高性能 Web 渲染支持。

<br>

<p align="center">
    <a href="https://zread.ai/reall3d-com/Reall3dViewer"><img src="https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff" alt="Ask Zread" /></a>
    <a href="https://github.com/reall3d-com/Reall3dViewer/blob/master/README_ZH.md"><img src="https://img.shields.io/badge/readme-Chinese-brightgreen.svg"></a>
    <a href="https://github.com/mrdoob/three.js"><img src="https://img.shields.io/badge/base-Threejs-brightgreen.svg"></a>
    <a href="https://github.com/reall3d-com/Reall3dViewer/releases/latest"><img src="https://img.shields.io/github/release/reall3d-com/Reall3dViewer.svg"></a>
    <a href="https://github.com/reall3d-com/Reall3dViewer/blob/master/LICENSE"><img src="https://img.shields.io/github/license/reall3d-com/Reall3dViewer"></a>
<p>
<br>


## 📋 目录

- [特点](#-特点)
- [在线演示](#-在线演示)
- [关键配置参数](#%EF%B8%8F-关键配置参数)
- [SPX 高压缩格式](#-spx-高压缩格式)
- [快速开始](#%EF%B8%8F-快速开始)
- [更新日志](#-更新日志)
- [鸣谢](#-鸣谢)
- [联系与支持](#-联系与支持)

---

## ✨ 特点

- ✅ **多格式支持**：`.ply`、`.splat`、`.spx`、`.spz`、`.sog`、`.glb`（支持 `KHR_gaussian_splatting` 扩展）
- ✅ **内置测量与标注**：距离、面积等测量，灵活的标注
- ✅ **球谐系数**：支持 1~3 级 SH
- ✅ **地图场景渲染**：支持 GIS 底图融合
- ✅ **单模型独立配置**：通过 `.meta.json` 文件设置专用参数
- ✅ **渲染质量自适应**：内置多种质量级别，根据设备自动优化
- ✅ **多种排序算法**：针对不同场景选择最优排序策略
- ✅ **大场景流式渲染**：基于预设 LOD，支持亿级点云流畅加载

## 🚀 实测性能

> 实测 1.5 亿点例子场景：桌面独显 **60 FPS**，核显轻薄本 **30 FPS**，主流手机 **25-40+ FPS**，老旧手机 **7-15+ FPS** 稳定无发烫不崩溃。

## 🌐 在线演示

- [带调试面板的 LOD 大场景](https://reall3d.com/reall3dviewer/examples/index.html?url=hgd-lod-meta.scene.json&debug=true)
- [完整的室内展厅 LOD 大场景](https://reall3d.com/reall3dviewer/examples/index.html?url=kcczt.scene.json)

> 你也可以通过 URL 参数直接加载自己的模型：  
> `https://reall3d.com/reall3dviewer/examples/index.html?url=你的模型地址.sog&debug=true`


## ⚙️ 关键配置参数

| 参数名称 | 推荐默认值（移动端/PC） | 说明 |
|---------|----------------------|------|
| `maxRenderCountOfMobile` | 200万 | 移动端最大渲染点数，可按设备调整 |
| `maxRenderCountOfPc` | 300万 | PC 端最大渲染点数 |
| `qualityLevel` | 自动 | 质量级别（1~9），影响渲染精度与性能 |
| `sortType` | 自动 | 排序算法类型，不同场景可选不同策略 |

## 📦 SPX 高压缩格式

- **体积优势**：相比 PLY 格式，文件体积可减少 **95%+**，加载速度显著提升。
- **流式渲染**：原生支持 LOD 分块与流式加载。
- **转换工具**：跨平台命令行工具 `gsbox`（无需安装，开箱即用）。

```bash
# PLY 转 SPX
gsbox ply2spx -i input.ply -o output.spx
```

- [SPX 格式详细说明](https://github.com/reall3d-com/Reall3dViewer/blob/main/SPX_ZH.md)
- [gsbox 工具仓库](https://github.com/gotoeasy/gsbox)



## 🛠️ 快速开始

使用源码方式
```shell
# develop
npm run dev

# build
npm run build

# open a web browser to render your 3dgs model
# http://hostname:port/index.html?url=your-model-link-address

# .sog or .spx file can be obtained through conversion using the gsbox
gsbox ply2sog -i /path/to/input.ply -o /path/to/output.sog
gsbox sog2spx -i /path/to/input.ply -o /path/to/output.spx
```


使用 npm 包方式 [例子工程在这](https://github.com/reall3d-com/reall3dviewer-samples-use-npm-package)
```shell
# install
npm install @reall3d/reall3dviewer
```

```js
// use built-in viewer
const viewer = new Reall3dViewer({ root: '#gsviewer' });
viewer.addModel(`https://reall3d.com/demo-models/yz.spx`);
```

```js
// preset-lod rendering
const viewer = new Reall3dViewer({ root: '#gsviewer' });
viewer.addScene(`https://reall3d.com/demo-models/lod-v1/hgd/hgd-lod.scene.json`);
```

```js
// use splat mesh
const splatMesh = new SplatMesh({ renderer, scene, controls});
splatMesh.addModel({ url: 'https://reall3d.com/demo-models/yz.spx' });
scene.add(splatMesh);
```

## 📜 更新日志

查看 [Releases](https://github.com/reall3d-com/Reall3dViewer/releases) 获取版本历史。

## 🙏 鸣谢

感谢以下开源项目提供的参考实现：

- [antimatter15/splat](https://github.com/antimatter15/splat)
- [mkkellogg/GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D)
- [huggingface/gsplat.js](https://github.com/huggingface/gsplat.js)
- [playcanvas/supersplat](https://github.com/playcanvas/supersplat)
- [sxguojf/three-tile](https://github.com/sxguojf/three-tile)

## 📬 联系与支持

- **Issues**：欢迎在 GitHub 项目页提交问题和建议
- **商业服务**：提供模型格式优化、产权保护、定制化等商业服务
- **官网**：[https://reall3d.com](https://reall3d.com)


# 第三方组件声明

本项目 `lib/` 目录下的文件均为第三方开源代码，随项目一同分发，版权归原作者所有。
`js/`、`css/`、`index.html` 为本项目原创代码，以根目录 `LICENSE`（MIT）授权。

## three.js

- 文件：`lib/three.min.js`（r147）、`lib/CopyShader.js`、`lib/LuminosityHighPassShader.js`、
  `lib/FXAAShader.js`、`lib/EffectComposer.js`、`lib/RenderPass.js`、`lib/ShaderPass.js`、
  `lib/UnrealBloomPass.js`、`lib/Sky.js`
- 来源：<https://github.com/mrdoob/three.js>
- 版权：Copyright © 2010-2022 three.js authors
- 许可：MIT

以上文件为 three.js 本体及其官方 examples/js 示例代码，仅做了本地化放置（用于离线运行），未修改其内容。

### 相关算法出处

- `FXAAShader.js`：FXAA 算法由 NVIDIA 提出（<https://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf>），
  three.js 的 GLSL 移植版同为 MIT 许可。
- `Sky.js`：基于 Preetham 等人的解析式天光模型
  （*A Practical Analytic Model for Daylight*），three.js 实现版为 MIT 许可。
- `UnrealBloomPass.js`：布隆效果参考 Unreal Engine 的后处理文档实现，three.js 实现版为 MIT 许可。

## MIT 许可全文

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

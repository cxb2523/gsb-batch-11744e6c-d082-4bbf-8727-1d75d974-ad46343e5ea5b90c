# Third-party notices

Yarn Planet's own code is MIT-licensed (see [LICENSE](LICENSE)). It also uses:

| What | Where | License |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | npm dependency, bundled into the game | MIT, © three.js authors |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | npm dependency, bundled into the game | MIT, © Garrett Johnson |
| “Hash without Sine” by David Hoskins ([shadertoy.com/view/4djSRW](https://www.shadertoy.com/view/4djSRW)) | GLSL hash functions in `src/art/glsl.ts` and `src/render.ts` | MIT, © 2014 David Hoskins |

`npm run build` writes the full license texts of the bundled dependencies to `dist/licenses.md`, which is
served with the game at `/licenses.md`.

The promo video's music, “Carefree” by Kevin MacLeod ([incompetech.com](https://incompetech.com)), is
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is not part of this
repository and is not covered by the MIT license.

## Hash without Sine

```
Copyright (c) 2014 David Hoskins.

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

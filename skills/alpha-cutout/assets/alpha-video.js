// Plays a "stacked alpha" MP4 (colour in the top half, matte as grey in the bottom half) with
// real transparency on a <canvas>. Plain H.264 plus a two-line shader works in every browser,
// Safari included, where VP9 alpha does not.
//
//   import { AlphaVideo } from "./alpha-video.js";
//   const hero = new AlphaVideo(document.querySelector("canvas.hero"), "hero-1080.mp4");
//   function frame() { hero.draw(); requestAnimationFrame(frame); }   // or call draw() from your loop
//
// For scroll scrubbing, pass { loop: false, autoplay: false } and call hero.seek(seconds).
// Give the canvas its size with CSS; resize() matches the backing store to it (DPR capped at 2).

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;
const FRAG = `
precision mediump float;
uniform sampler2D tex;
varying vec2 uv;
void main() {
  vec3 c = texture2D(tex, vec2(uv.x, uv.y * 0.5)).rgb;
  float a = texture2D(tex, vec2(uv.x, 0.5 + uv.y * 0.5)).g;
  gl_FragColor = vec4(c * a, a);
}`;

export class AlphaVideo {
  constructor(canvas, src, { loop = true, autoplay = true } = {}) {
    this.canvas = canvas;
    this.ready = false;
    this.visible = true;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    this.gl = gl;
    if (!gl) return;

    const sh = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const v = document.createElement("video");
    Object.assign(v, { muted: true, loop, playsInline: true, autoplay, preload: "auto", crossOrigin: "anonymous" });
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.src = src;
    this.video = v;
    this.lastTime = -1;
    v.addEventListener("loadeddata", () => {
      this.ready = true;
      this.onready && this.onready();
    }, { once: true });
    if (autoplay) v.play().catch(() => {});

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    // a looping hero off screen still decodes every frame; pause it
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (!autoplay) return;
      this.visible ? this.play() : this.pause();
    }, { rootMargin: "100px" }).observe(canvas);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.lastTime = -1;
    }
  }

  play() { this.video && this.video.paused && this.video.play().catch(() => {}); }
  pause() { this.video && !this.video.paused && this.video.pause(); }

  // scrubbing: seconds into the clip; draw() picks the new frame up once it has decoded
  seek(t) {
    const v = this.video;
    if (!v || !v.duration) return;
    const target = Math.min(Math.max(t, 0), v.duration - 0.001);
    if (Math.abs(v.currentTime - target) > 0.001 && !v.seeking) v.currentTime = target;
  }

  draw() {
    const gl = this.gl;
    if (!gl || !this.ready || !this.visible || this.video.readyState < 2) return;
    // upload only when the video moved on: texImage2D from video is the expensive part
    if (this.video.currentTime === this.lastTime && this.video.paused) return;
    this.lastTime = this.video.currentTime;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.video);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

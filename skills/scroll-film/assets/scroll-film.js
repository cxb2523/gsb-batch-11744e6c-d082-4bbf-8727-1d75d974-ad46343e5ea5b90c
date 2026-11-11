// Scroll-scrubbed film: a tall section pins a canvas while the visitor scrolls, and scroll
// position picks the frame. Plays an image sequence (exact, recommended) or a video.
//
//   <section id="film" style="height: 500vh">
//     <div style="position: sticky; top: 0; height: 100vh"><canvas></canvas></div>
//   </section>
//
//   import { ScrollFilm } from "./scroll-film.js";
//   const film = new ScrollFilm({
//     section: document.querySelector("#film"),
//     canvas: document.querySelector("#film canvas"),
//     frames: { count: 120, src: (i) => `film/${innerWidth < 760 ? "sm" : "lg"}/${String(i).padStart(3, "0")}.webp` },
//     keys: [[0, 0], [0.25, 40], [0.4, 40], [1, 119]],   // optional: [progress, frame] with holds
//     onUpdate: ({ progress, frame, index }) => {},   // captions, counters, layer parallax
//     onReady: () => document.body.classList.add("film-ready"),   // first frame decoded
//   });
//
// Video instead of frames: video: { src: "film.mp4" }. The file is fetched whole into a blob,
// so seeks never wait on the network; encode it with prep.py --video (short GOP) or seeks lag.
//
// keys map scroll progress (0..1 through the pinned stretch) to frame numbers, piecewise
// linear. Two keys with the same frame make a hold: the film waits while text scrolls past.
// Without keys, progress maps straight onto the whole film.
//
// Reduced motion: with prefers-reduced-motion, the film steps between key frames instead of
// playing continuously (reducedMotion: "steps"), or shows one still (reducedMotion: "still").

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class ScrollFilm {
  constructor({ section, canvas, frames = null, video = null, keys = null, fit = "cover", focus = [0.5, 0.5],
                smooth = 0.18, reducedMotion = "steps", maxDpr = 2, onUpdate = null, onReady = null }) {
    if (!frames === !video) throw new Error("ScrollFilm needs frames or video");
    Object.assign(this, { section, canvas, keys, fit, focus, smooth, maxDpr, onUpdate, onReady });
    this.ctx = canvas.getContext("2d");
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches ? reducedMotion : null;
    this.progress = 0;
    this.frame = 0;
    this.shown = -1;
    this.live = true;
    this.last = 0;

    if (frames) {
      this.count = frames.count;
      this.images = new Array(this.count);
      this.srcOf = frames.src;
      this.loadFrames();
    } else {
      this.count = 0;
      this.loadVideo(video);
    }

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    new IntersectionObserver(([e]) => { this.live = e.isIntersecting; }, { rootMargin: "50% 0px" }).observe(section);
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  // frame 0 first (it is the poster), then a coarse-to-fine spread so a fast scroller always
  // finds a near frame, then the rest
  loadFrames() {
    const order = [0];
    for (let stride = 64; stride >= 1; stride >>= 1)
      for (let i = 0; i < this.count; i += stride) if (!order.includes(i)) order.push(i);
    if (!order.includes(this.count - 1)) order.splice(1, 0, this.count - 1);
    let next = 0;
    const worker = async () => {
      while (next < order.length) {
        const i = order[next++];
        const img = new Image();
        img.decoding = "async";
        img.src = this.srcOf(i);
        try { await img.decode(); this.images[i] = img; if (i === this.target()) this.shown = -1; } catch { /* skip */ }
        if (i === 0) this.onReady?.(this);
      }
    };
    for (let k = 0; k < 6; k++) worker();  // six in flight
  }

  async loadVideo({ src, fps = 24 }) {
    const v = document.createElement("video");
    Object.assign(v, { muted: true, playsInline: true, preload: "auto" });
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    try {
      const blob = await (await fetch(src)).blob();
      v.src = URL.createObjectURL(blob);
    } catch {
      v.src = src;
    }
    await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    this.video = v;
    this.fps = fps;
    this.count = Math.max(1, Math.round(v.duration * fps));
    v.addEventListener("seeked", () => { this.shown = -1; });
    this.shown = -1;
    this.onReady?.(this);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.shown = -1;
    }
  }

  scrollProgress() {
    const r = this.section.getBoundingClientRect();
    const run = r.height - innerHeight;
    return run > 0 ? clamp(-r.top / run, 0, 1) : 0;
  }

  frameAt(p) {
    const last = this.count - 1;
    if (!this.keys) return p * last;
    const k = this.keys;
    if (p <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (p <= k[i][0]) {
        const [p0, f0] = k[i - 1], [p1, f1] = k[i];
        return f0 + (f1 - f0) * (p1 > p0 ? (p - p0) / (p1 - p0) : 1);
      }
    }
    return k[k.length - 1][1];
  }

  target() { return clamp(Math.round(this.frame), 0, Math.max(0, this.count - 1)); }

  tick(now) {
    requestAnimationFrame(this.tick);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    if (!this.live || !this.count) return;
    this.progress = this.scrollProgress();
    let want = this.frameAt(this.progress);
    if (this.reduced === "still") want = this.keys ? this.keys[this.keys.length - 1][1] : 0;
    else if (this.reduced === "steps" && this.keys) {
      want = this.keys.reduce((best, [, f]) => (Math.abs(f - want) < Math.abs(best - want) ? f : best), this.keys[0][1]);
    }
    // ease toward the scroll target, frame-rate independent: wheel steps become motion, not jumps
    const s = this.reduced ? 1 : this.smooth;
    this.frame += (want - this.frame) * (s >= 1 ? 1 : 1 - Math.pow(1 - s, dt * 60));
    if (Math.abs(want - this.frame) < 0.02) this.frame = want;
    const i = this.target();
    if (this.video) this.seekVideo(i);
    if (i !== this.shown) this.draw(i);
    this.onUpdate?.({ progress: this.progress, frame: this.frame, index: i });
  }

  seekVideo(i) {
    const v = this.video, t = Math.min(i / this.fps, v.duration - 0.001);
    if (!v.seeking && Math.abs(v.currentTime - t) > 0.5 / this.fps) v.currentTime = t;
  }

  nearest(i) {
    for (let d = 0; d < this.count; d++) {
      if (this.images[i - d]) return this.images[i - d];
      if (this.images[i + d]) return this.images[i + d];
    }
    return null;
  }

  draw(i) {
    const src = this.video || this.nearest(i);
    if (!src) return;
    const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
    const { width: cw, height: ch } = this.canvas;
    const scale = this.fit === "cover" ? Math.max(cw / sw, ch / sh) : Math.min(cw / sw, ch / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = (cw - dw) * this.focus[0], dy = (ch - dh) * this.focus[1];
    this.ctx.clearRect(0, 0, cw, ch);
    this.ctx.drawImage(src, dx, dy, dw, dh);
    if (this.video ? !this.video.seeking : this.images[i]) this.shown = i;
  }
}

// Minimal 2d-canvas stand-in for jsdom test files. jsdom has no canvas
// implementation; the engine only needs a context object that swallows draw
// calls and measures text deterministically.
// Applied only when a DOM (jsdom environment) is present.

if (typeof window !== 'undefined') {
  class FakeCtx2D {
    constructor(canvas) {
      this.canvas = canvas
      this.font = '500 16px sans-serif'
      this.lineWidth = 1
      this.globalAlpha = 1
      this.fillStyle = '#000'
      this.strokeStyle = '#000'
    }
    measureText(text) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font)
      const size = m ? parseFloat(m[1]) : 16
      return {
        width: String(text).length * size * 0.55,
        fontBoundingBoxAscent: size * 0.8,
        fontBoundingBoxDescent: size * 0.2,
      }
    }
    createPattern() { return {} }
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } }
  }
  for (const fn of [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'bezierCurveTo', 'arc', 'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip',
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage',
    'setTransform', 'transform', 'translate', 'rotate', 'scale', 'setLineDash',
  ]) {
    FakeCtx2D.prototype[fn] = function () {}
  }

  window.HTMLCanvasElement.prototype.getContext = function () {
    this.__ctx ||= new FakeCtx2D(this)
    return this.__ctx
  }
  window.HTMLCanvasElement.prototype.toBlob = function (cb, type = 'image/png') {
    setTimeout(() => cb(new Blob(['fake-png'], { type })), 0)
  }
  window.HTMLCanvasElement.prototype.toDataURL = function (type = 'image/png') {
    return `data:${type};base64,ZmFrZQ==`
  }

  globalThis.OffscreenCanvas = class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() { this.__ctx ||= new FakeCtx2D(this); return this.__ctx }
  }

  globalThis.Path2D = class Path2D {
    constructor() { this.ops = [] }
  }
  for (const fn of ['moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'ellipse', 'arc', 'rect', 'roundRect']) {
    globalThis.Path2D.prototype[fn] = function (...a) { this.ops.push([fn, a]) }
  }

  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

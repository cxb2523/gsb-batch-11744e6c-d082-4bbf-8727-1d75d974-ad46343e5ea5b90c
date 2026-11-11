// @vitest-environment jsdom
//
// Hardening coverage for hitShape(): the extraTol parameter, the coarse
// page-bounds prefilter's safety under rotation, and degenerate geometries.
// The shape-specific hit semantics themselves live in shapes.test.js.
import { describe, it, expect } from 'vitest'
import { hitShape, localBounds, pageBounds, toLocal } from '../src/shapes.js'
import { boundsContain } from '../src/geometry.js'
import { SIZES } from '../src/palette.js'
import { Store } from '../src/store.js'

const store = new Store()
const TOL = 4

// page-space counterpart of a shape-local point, matching pageBounds/toLocal's
// own rotation convention (rotate about the local-bounds center)
function pageOf(shape, lx, ly) {
  const lb = localBounds(shape)
  const cx = shape.x + lb.x + lb.w / 2
  const cy = shape.y + lb.y + lb.h / 2
  const a = shape.rot || 0
  const s = Math.sin(a), c = Math.cos(a)
  const dx = shape.x + lx - cx
  const dy = shape.y + ly - cy
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }
}

// standalone copy of hitShape's coarse filter, so a test fails if the local
// verdict ever disagrees with what the prefilter lets through
function coarseAccepts(shape, px, py, tol, extraTol = 0) {
  const b = pageBounds(shape)
  const wide = tol + extraTol + SIZES[shape.props.size || 'm'] * 2
  return boundsContain({ x: b.x - wide, y: b.y - wide, w: b.w + wide * 2, h: b.h + wide * 2 }, px, py)
}

const rect = (over = {}, props = {}) => ({
  id: 'g1', typeName: 'shape', type: 'geo', x: 10, y: 10, rot: 0, z: 1,
  props: { geo: 'rectangle', w: 100, h: 50, color: 'black', size: 'm', dash: 'solid', fill: 'none', font: 'draw', ...props },
  ...over,
})

describe('hitShape extraTol', () => {
  it('defaults to 0: omitting it is identical to passing 0', () => {
    const s = rect()
    for (const [px, py] of [[10, 10], [60, 35], [12, 14], [500, 500]]) {
      expect(hitShape(s, px, py, TOL, store)).toBe(hitShape(s, px, py, TOL, store, 0))
    }
  })

  it('widens the precise local test for every shape family', () => {
    // unfilled geo edge: local radius tol + SIZES.m = 8
    const g = rect()
    expect(hitShape(g, 60, 10 + 9, TOL, store)).toBe(false)
    expect(hitShape(g, 60, 10 + 9, TOL, store, 2)).toBe(true)

    // line: local radius tol + SIZES.m = 8
    const line = { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0, z: 1, props: { dx: 100, dy: 0, size: 'm', color: 'black' } }
    expect(hitShape(line, 50, 10, TOL, store)).toBe(false)
    expect(hitShape(line, 50, 10, TOL, store, 3)).toBe(true)

    // draw ink: local radius tol + inkReach = 4 + (4.6 + 1) = 9.6
    const draw = {
      id: 'd', typeName: 'shape', type: 'draw', x: 0, y: 0, rot: 0, z: 1,
      props: { pts: [0, 0, 0.5, 100, 0, 0.5], size: 'm', color: 'black', done: true },
    }
    expect(hitShape(draw, 50, 11, TOL, store)).toBe(false)
    expect(hitShape(draw, 50, 11, TOL, store, 2)).toBe(true)

    // text local box
    const text = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { text: 'hello', size: 'm' } }
    const lb = localBounds(text)
    const outsideY = lb.y + lb.h + TOL + 3
    expect(hitShape(text, 5, outsideY, TOL, store)).toBe(false)
    expect(hitShape(text, 5, outsideY, TOL, store, 4)).toBe(true)
  })

  it('also widens the coarse page-bounds prefilter', () => {
    // point far enough past the line's page bounds that the base prefilter
    // rejects it, but within reach once extraTol opens both filter and test
    const line = { id: 'l', typeName: 'shape', type: 'line', x: 100, y: 100, rot: 0, z: 1, props: { dx: 0, dy: 0, size: 'm', color: 'black' } }
    const pb = pageBounds(line)
    // base prefilter margin = tol + SIZES.m*2 = 12; sit just beyond it
    const px = pb.x + pb.w / 2
    const py = pb.y - 14
    expect(coarseAccepts(line, px, py, TOL, 0)).toBe(false)
    expect(hitShape(line, px, py, TOL, store)).toBe(false)
    expect(coarseAccepts(line, px, py, TOL, 6)).toBe(true)
    // local radius with extraTol 6 = 14, distance 14 -> hit, and the widened
    // prefilter no longer swallows it
    expect(hitShape(line, px, py, TOL, store, 6)).toBe(true)
  })

  it('extraTol 0 never changes a verdict (sampled grid over several shapes)', () => {
    const shapes = [
      rect(),
      rect({ rot: Math.PI / 7 }, { fill: 'solid' }),
      { id: 'e', typeName: 'shape', type: 'geo', x: 30, y: 40, rot: 0.4, z: 1, props: { geo: 'ellipse', w: 120, h: 70, size: 'm', fill: 'none' } },
      { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0.2, z: 1, props: { dx: 140, dy: 60, bend: 18, size: 'm', color: 'black' } },
    ]
    for (const s of shapes) {
      const b = pageBounds(s)
      for (let gx = b.x - 20; gx <= b.x + b.w + 20; gx += 6) {
        for (let gy = b.y - 20; gy <= b.y + b.h + 20; gy += 6) {
          expect(hitShape(s, gx, gy, TOL, store, 0)).toBe(hitShape(s, gx, gy, TOL, store))
        }
      }
    }
  })
})

describe('coarse filter safety under rotation', () => {
  // For each required case: construct a point the LOCAL test accepts, rotate
  // it into page space, then prove the prefilter would not have rejected it.
  const angles = [0, 0.13, Math.PI / 7, Math.PI / 4, 1.1, Math.PI / 2, 2.3, Math.PI, 4.2]

  it('rotated thin long rectangle: edge hits survive the prefilter at every angle', () => {
    const base = rect({}, { w: 300, h: 6 })
    // 7px off the long edge midpoint: inside edge radius tol + SIZES.m = 8
    for (const rot of angles) {
      const s = { ...base, rot }
      const pt = pageOf(s, 150, 6 + 7)
      expect(hitShape(s, pt.x, pt.y, TOL, store)).toBe(true)
      expect(coarseAccepts(s, pt.x, pt.y, TOL)).toBe(true)
    }
  })

  it('rotated draw stroke: off-centerline ink hits survive the prefilter', () => {
    const base = {
      id: 'd', typeName: 'shape', type: 'draw', x: 200, y: 200, rot: 0, z: 1,
      props: { pts: [0, 0, 0.5, 150, 1, 0.5, 300, 5, 0.5], size: 'm', color: 'black', done: true },
    }
    // 8px off the centerline midpoint; local radius 9.6
    for (const rot of angles) {
      const s = { ...base, rot }
      const pt = pageOf(s, 150, 8)
      expect(hitShape(s, pt.x, pt.y, TOL, store)).toBe(true)
      expect(coarseAccepts(s, pt.x, pt.y, TOL)).toBe(true)
    }
  })

  it('bent arrow: curve-apex hits survive the prefilter under rotation', () => {
    const base = {
      id: 'a', typeName: 'shape', type: 'arrow', x: 300, y: 300, rot: 0, z: 1,
      props: { dx: 200, dy: 0, bend: 40, size: 'm', color: 'black' },
    }
    // quadratic with control (100,80): curve apex at t=.5 is (100,40)
    for (const rot of angles) {
      const s = { ...base, rot }
      for (const off of [0, 7]) { // on the apex, and 7px beside it (radius 8)
        const pt = pageOf(s, 100, 40 + off)
        expect(hitShape(s, pt.x, pt.y, TOL, store)).toBe(true)
        expect(coarseAccepts(s, pt.x, pt.y, TOL)).toBe(true)
      }
    }
  })

  it('prefilter never rejects a hit (dense sweep across the three families)', () => {
    const shapes = [
      rect({}, { w: 260, h: 4 }),
      {
        id: 'd2', typeName: 'shape', type: 'draw', x: 120, y: 120, rot: 0, z: 1,
        props: { pts: [0, 0, 0.5, 120, 40, 0.5, 240, -20, 0.5], size: 'm', done: true },
      },
      { id: 'a2', typeName: 'shape', type: 'arrow', x: 0, y: 0, rot: 0, z: 1, props: { dx: 180, dy: 60, bend: -35, size: 'm' } },
    ]
    for (const base of shapes) {
      for (let i = 0; i < 16; i++) {
        const s = { ...base, rot: (i / 16) * Math.PI * 2 }
        const b = pageBounds(s)
        for (let gx = b.x - 24; gx <= b.x + b.w + 24; gx += 5) {
          for (let gy = b.y - 24; gy <= b.y + b.h + 24; gy += 5) {
            if (hitShape(s, gx, gy, TOL, store)) {
              expect(coarseAccepts(s, gx, gy, TOL)).toBe(true)
            }
          }
        }
      }
    }
  })

  it('toLocal is the exact inverse of the page-space rotation used here', () => {
    const s = rect({ rot: 0.9123 }, { w: 180, h: 30 })
    const pt = pageOf(s, 77.7, 12.3)
    const back = toLocal(s, pt.x, pt.y)
    expect(back.x).toBeCloseTo(77.7, 9)
    expect(back.y).toBeCloseTo(12.3, 9)
  })
})

describe('degenerate geometries', () => {
  const around = (shape) => {
    const b = pageBounds(shape)
    const pts = [[shape.x, shape.y], [shape.x + 1, shape.y - 1]]
    for (let gx = b.x - 12; gx <= b.x + b.w + 12; gx += 6) {
      for (let gy = b.y - 12; gy <= b.y + b.h + 12; gy += 6) pts.push([gx, gy])
    }
    return pts
  }
  const neverThrowsOrNaN = (shape) => {
    for (const rot of [0, 0.7]) {
      const s = { ...shape, rot }
      for (const [gx, gy] of around(s)) {
        let r
        expect(() => { r = hitShape(s, gx, gy, TOL, store) }).not.toThrow()
        expect(Number.isNaN(r)).toBe(false)
      }
    }
  }

  it('zero-dimension geo rectangles do not throw', () => {
    neverThrowsOrNaN({ id: 'g', typeName: 'shape', type: 'geo', x: 50, y: 60, rot: 0, z: 1, props: { geo: 'rectangle', w: 0, h: 50, size: 'm', fill: 'none' } })
    neverThrowsOrNaN({ id: 'g', typeName: 'shape', type: 'geo', x: 50, y: 60, rot: 0, z: 1, props: { geo: 'rectangle', w: 50, h: 0, size: 'm', fill: 'solid' } })
    // a zero-width rect still has its two coincident long edges, which remain hittable
    const lineLike = { id: 'g', typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0, z: 1, props: { geo: 'rectangle', w: 0, h: 50, size: 'm', fill: 'none' } }
    expect(hitShape(lineLike, 0, 25, TOL, store)).toBe(true)
  })

  it('degenerate ellipses always return false, never NaN', () => {
    for (const props of [
      { geo: 'ellipse', w: 0, h: 50, fill: 'none' },
      { geo: 'ellipse', w: 50, h: 0, fill: 'solid' },
      { geo: 'ellipse', w: 0, h: 0, fill: 'solid', label: 'x' },
      { geo: 'ellipse', w: 0, h: 0, fill: 'none' },
    ]) {
      const s = { id: 'g', typeName: 'shape', type: 'geo', x: 20, y: 30, rot: 0, z: 1, props: { size: 'm', color: 'black', ...props } }
      neverThrowsOrNaN(s)
      for (const [gx, gy] of [[20, 30], [20, 55], [45, 30], [0, 0], [100, 100]]) {
        expect(hitShape(s, gx, gy, TOL, store)).toBe(false)
      }
    }
  })

  it('zero-length lines and arrows (with or without bend) do not throw', () => {
    for (const type of ['line', 'arrow']) {
      for (const bend of [0, 20, -20]) {
        const s = { id: 'l', typeName: 'shape', type: type, x: 30, y: 30, rot: 0, z: 1, props: { dx: 0, dy: 0, bend, size: 'm', color: 'black' } }
        neverThrowsOrNaN(s)
        // the collapsed path still behaves like a point hit at its origin
        expect(hitShape(s, 30, 30, TOL, store)).toBe(true)
      }
    }
  })

  it('empty / single-point draw strokes do not throw', () => {
    const empty = { id: 'd', typeName: 'shape', type: 'draw', x: 5, y: 5, rot: 0, z: 1, props: { pts: [], size: 'm' } }
    expect(hitShape(empty, 5, 5, TOL, store)).toBe(false)
    neverThrowsOrNaN(empty)
    const dot = { id: 'd', typeName: 'shape', type: 'draw', x: 5, y: 5, rot: 0, z: 1, props: { pts: [10, 10, 0.5], size: 'm', done: true } }
    expect(() => hitShape(dot, 15, 15, TOL, store)).not.toThrow()
  })

  it('degenerate shapes accept extraTol without throwing', () => {
    const s = { id: 'g', typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0.3, z: 1, props: { geo: 'ellipse', w: 0, h: 0, size: 'm', fill: 'solid' } }
    expect(hitShape(s, 0, 0, TOL, store, 20)).toBe(false)
    const l = { id: 'l', typeName: 'shape', type: 'line', x: 10, y: 10, rot: 0, z: 1, props: { dx: 0, dy: 0, size: 'm' } }
    expect(hitShape(l, 10, 25, TOL, store, 20)).toBe(true) // distance 15 <= 4+20+4
  })
})

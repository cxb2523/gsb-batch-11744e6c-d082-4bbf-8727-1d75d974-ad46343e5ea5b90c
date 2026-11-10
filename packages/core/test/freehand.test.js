import { describe, it, expect } from 'vitest'
import { strokeOutline, inkOptions } from '../src/freehand.js'

const finite = (arr) => arr.every((v) => Number.isFinite(v))

const line = (n, step, p = 0.5) => {
  const pts = []
  for (let i = 0; i <= n; i++) pts.push(i * step, 0, p)
  return pts
}

const spanYNear = (out, x) => {
  let w = 0
  for (let i = 0; i < out.length; i += 2) if (Math.abs(out[i] - x) < 6) w = Math.max(w, Math.abs(out[i + 1]))
  return w
}

// the outline's area: on the same spine, it measures the stroke's width
const area = (out) => {
  let a = 0
  for (let i = 0; i < out.length; i += 2) {
    const j = (i + 2) % out.length
    a += out[i] * out[j + 1] - out[j] * out[i + 1]
  }
  return Math.abs(a / 2)
}

describe('inkOptions', () => {
  it('simulates pressure for a mouse, reads it from a pen', () => {
    expect(inkOptions(4).simulatePressure).toBe(true)
    expect(inkOptions(4, { isPen: true }).simulatePressure).toBe(false)
    expect(inkOptions(4, { done: true }).last).toBe(true)
  })
})

describe('strokeOutline', () => {
  it('empty input -> empty outline', () => {
    expect(strokeOutline([])).toEqual([])
  })

  it('a tap leaves a dot around the point', () => {
    const out = strokeOutline([10, 20, 0.5], inkOptions(8, { done: true }))
    expect(out.length).toBeGreaterThanOrEqual(16)
    expect(finite(out)).toBe(true)
    for (let i = 0; i < out.length; i += 2) {
      const d = Math.hypot(out[i] - 10, out[i + 1] - 20)
      expect(d).toBeGreaterThan(1)
      expect(d).toBeLessThan(8)
    }
  })

  it('a straight stroke hugs its spine', () => {
    const out = strokeOutline(line(20, 5), inkOptions(6, { done: true }))
    expect(out.length % 2).toBe(0)
    expect(finite(out)).toBe(true)
    for (let i = 0; i < out.length; i += 2) {
      expect(Math.abs(out[i + 1])).toBeLessThanOrEqual(6)
      expect(out[i]).toBeGreaterThanOrEqual(-6)
      expect(out[i]).toBeLessThanOrEqual(106)
    }
  })

  it('pen pressure widens the stroke', () => {
    const w = (p) => area(strokeOutline(line(30, 5, p), inkOptions(8, { isPen: true, done: true })))
    expect(w(0.95)).toBeGreaterThan(w(0.15))
  })

  it('without a taper the tips keep round, full caps', () => {
    const out = strokeOutline(line(30, 5, 0.8), inkOptions(10, { isPen: true, done: true }))
    expect(spanYNear(out, 2)).toBeGreaterThan(spanYNear(out, 75) * 0.6)
  })

  it('a taper thins the tips', () => {
    const out = strokeOutline(line(30, 5, 0.8), { ...inkOptions(10, { isPen: true, done: true }), start: { taper: true }, end: { taper: true } })
    expect(spanYNear(out, 2)).toBeLessThan(spanYNear(out, 75))
  })

  it('duplicate points do not blow up (no NaN)', () => {
    const out = strokeOutline([5, 5, 0.5, 5, 5, 0.5, 5, 5, 0.5, 6, 5, 0.5], inkOptions(4))
    expect(finite(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })

  it('simulated pressure: a fast stroke is thinner than a slow one', () => {
    const slow = area(strokeOutline(line(100, 1), inkOptions(8, { done: true })))
    const fast = area(strokeOutline(line(10, 10), inkOptions(8, { done: true })))
    expect(slow).toBeGreaterThan(fast)
  })
})

// Geometry for the star-history chart.
//
// Shared by the build-time render in StarHistory.astro and by the client-side
// refresh that redraws it with fresh numbers — both call buildStarChart() so
// the served SVG and the refreshed one are laid out identically.

export const VIEW = { w: 720, h: 260, padL: 46, padR: 20, padT: 20, padB: 34 }

const DAY = 86400000

/** Round a maximum up to a friendly 1 / 2 / 5 × 10ⁿ tick value. */
function niceMax(n) {
  if (n <= 5) return 5
  const mag = 10 ** Math.floor(Math.log10(n))
  const step = [1, 2, 2.5, 5, 10].find((s) => n <= s * mag) ?? 10
  return step * mag
}

function fmtDate(ms, spanDays) {
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  // Once the history is longer than a season, the day of the month is noise.
  if (spanDays > 120) return `${month} ${d.getUTCFullYear()}`
  return `${month} ${d.getUTCDate()}`
}

/**
 * @param {string[]} times   ISO timestamps, one per stargazer, oldest first.
 * @param {object}  [opts]
 * @param {string}  [opts.createdAt]  Repo creation date — anchors the line at zero.
 * @param {number}  [opts.now]        Epoch ms for "today" (passed in; the caller owns the clock).
 * @param {number}  [opts.total]      Authoritative star count, if it exceeds the timestamps we have.
 * @param {object}  [opts.view]       Viewport override — the README SVG draws bigger than the site.
 * @returns {null | {line: string, area: string, yTicks: {v: number, y: number}[],
 *   xTicks: {label: string, x: number}[], last: {x: number, y: number}, total: number}}
 */
export function buildStarChart(times, opts = {}) {
  const stamps = (times || [])
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (!stamps.length) return null

  const now = opts.now ?? stamps[stamps.length - 1]
  const total = Math.max(opts.total ?? 0, stamps.length)

  // Cumulative series: one point per star, plus a zero anchor at repo creation
  // (or just before the first star) so the curve rises from the baseline.
  const created = Date.parse(opts.createdAt ?? '')
  const first = stamps[0]
  const zeroAt = Number.isFinite(created) && created < first ? created : first - DAY
  const pts = [{ t: zeroAt, v: 0 }, ...stamps.map((t, i) => ({ t, v: i + 1 }))]

  // If the API only handed us a prefix of the stargazers, carry the line up to
  // the real total at "now" rather than under-reporting.
  if (total > stamps.length) pts.push({ t: now, v: total })
  else if (now > stamps[stamps.length - 1]) pts.push({ t: now, v: stamps.length })

  const t0 = pts[0].t
  const t1 = Math.max(pts[pts.length - 1].t, t0 + DAY)
  const vMax = niceMax(total)

  const { w, h, padL, padR, padT, padB } = { ...VIEW, ...opts.view }
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const x = (t) => padL + ((t - t0) / (t1 - t0)) * plotW
  const y = (v) => padT + plotH - (v / vMax) * plotH

  // Long histories get thinned so the path stays small; endpoints always kept.
  const MAX_POINTS = 260
  const stride = Math.ceil(pts.length / MAX_POINTS)
  const drawn =
    stride > 1
      ? [...pts.filter((_, i) => i % stride === 0), pts[pts.length - 1]]
      : pts

  const coords = drawn.map((p) => [+x(p.t).toFixed(1), +y(p.v).toFixed(1)])
  const line = coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' ')
  const baseY = padT + plotH
  const area = `${line} L${coords[coords.length - 1][0]} ${baseY} L${coords[0][0]} ${baseY} Z`

  const yTicks = [0, vMax / 2, vMax].map((v) => ({ v, y: +y(v).toFixed(1) }))
  const spanDays = (t1 - t0) / DAY
  const xTicks = [t0, (t0 + t1) / 2, t1].map((t) => ({
    label: fmtDate(t, spanDays),
    x: +x(t).toFixed(1),
  }))

  return {
    line,
    area,
    yTicks,
    xTicks,
    last: { x: coords[coords.length - 1][0], y: coords[coords.length - 1][1] },
    total,
  }
}

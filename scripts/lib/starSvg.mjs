// Renders the star-history chart as a standalone SVG for the README.
//
// Kept free of external CSS and script: GitHub serves README images through a
// proxy and renders them as <img>, so everything has to be inline presentation
// attributes and a gradient def.

// padT clears the header row (the star, the count, and the repo name at y=33).
export const VIEW = { w: 800, h: 310, padL: 56, padR: 24, padT: 64, padB: 44 }

export const THEMES = {
  light: {
    file: 'star-history.svg',
    bg: '#faf8f4',
    border: '#e3dfd4',
    grid: '#ded9cc',
    ink: '#57544c',
    title: '#1c1b18',
    line: '#e0a106',
    fillTop: 'rgba(224, 161, 6, 0.26)',
    fillBottom: 'rgba(224, 161, 6, 0)',
  },
  dark: {
    file: 'star-history-dark.svg',
    bg: '#14130f',
    border: '#2a2822',
    grid: 'rgba(244, 242, 234, 0.13)',
    ink: 'rgba(244, 242, 234, 0.5)',
    title: '#f4f2ea',
    line: '#ffd154',
    fillTop: 'rgba(255, 209, 84, 0.3)',
    fillBottom: 'rgba(255, 209, 84, 0)',
  },
}

const FONT =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif'
const STAR = 'M12 1.6l3.1 6.7 7.3.9-5.4 5 1.4 7.2L12 17.8l-6.4 3.6L7 14.2 1.6 9.2l7.3-.9L12 1.6z'

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * @param {object} chart  Output of buildStarChart(), built with this VIEW.
 * @param {'light'|'dark'} theme
 * @param {{repo: string, generatedAt: string}} meta
 */
export function renderStarSvg(chart, theme, meta) {
  const { w, h, padL, padR } = VIEW
  const t = THEMES[theme]
  const label = `${chart.total} star${chart.total === 1 ? '' : 's'}`

  const grid = chart.yTicks
    .map(
      (y) =>
        `<line x1="${padL}" x2="${w - padR}" y1="${y.y}" y2="${y.y}" stroke="${t.grid}" stroke-width="1" stroke-dasharray="3 6"/>`,
    )
    .join('')
  const yLabels = chart.yTicks
    .map(
      (y) =>
        `<text x="${padL - 12}" y="${y.y + 5}" fill="${t.ink}" font-size="14" text-anchor="end">${y.v}</text>`,
    )
    .join('')
  const xLabels = chart.xTicks
    .map((x, i) => {
      const anchor = i === 0 ? 'start' : i === 2 ? 'end' : 'middle'
      return `<text x="${x.x}" y="${h - 14}" fill="${t.ink}" font-size="14" text-anchor="${anchor}">${esc(x.label)}</text>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}" role="img" aria-label="Quickdraw star history on GitHub — ${label}">
  <!-- generated ${esc(meta.generatedAt)} by scripts/star-history.mjs — do not edit by hand -->
  <defs>
    <linearGradient id="qd-star-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.fillTop}"/>
      <stop offset="100%" stop-color="${t.fillBottom}"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
  <g transform="translate(24 17) scale(0.75)"><path d="${STAR}" fill="${t.line}"/></g>
  <text x="47" y="33" fill="${t.title}" font-size="15" font-weight="700">${label}</text>
  <text x="${w - 24}" y="33" fill="${t.ink}" font-size="13" text-anchor="end">${esc(meta.repo)}</text>
  ${grid}
  <path d="${chart.area}" fill="url(#qd-star-fill)"/>
  <path d="${chart.line}" fill="none" stroke="${t.line}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${chart.last.x}" cy="${chart.last.y}" r="8" fill="${t.line}" opacity="0.22"/>
  <circle cx="${chart.last.x}" cy="${chart.last.y}" r="4" fill="${t.line}"/>
  ${yLabels}${xLabels}
</svg>
`
}

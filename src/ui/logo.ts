import { THREAD_COLORS } from '../chapter/data';

/** 毛线星球 · Yarn Planet logo, drawn in SVG: a little planet wound like a
 * ball of yarn (all five thread colors), a loose strand that runs under the
 * name and ends in a loop, and the localized name in sticker lettering (cream
 * fill, ink outline) so it reads on the night title and on paper alike. The
 * name texts carry `data-copy` keys, so a language switch updates them live. */

const INK = '#2a2c3a';
const PAPER = '#fff4dc';
const COLORS = [THREAD_COLORS.power, THREAD_COLORS.water, THREAD_COLORS.lights, THREAD_COLORS.voice, THREAD_COLORS.root];

export interface LogoOptions { id?: string; animate?: boolean; className?: string }

export function logoSvg({ id = 'logo', animate = true, className = 'logo-svg' }: LogoOptions = {}): string {
  // Yarn ball: bands of wound thread at a few tilts, clipped to the planet disc.
  const cx = 92, cy = 96, r = 62;
  const windings = [-38, 12, 64].map((angle, set) => Array.from({ length: 7 }, (_, i) => {
    const y = cy - r + 12 + i * 18;
    const color = COLORS[(i + set * 2) % COLORS.length];
    return `<path d="M${cx - r - 10} ${y}Q${cx} ${y + 16} ${cx + r + 10} ${y}" stroke="${color}" stroke-width="9" transform="rotate(${angle} ${cx} ${cy})"/>`;
  }).join('')).join('');
  const strand = `M${cx + 44} ${cy + 42}C${cx + 110} ${cy + 96} 300 172 430 160C540 150 590 176 640 150C672 133 668 104 646 104C624 104 626 136 660 140C690 144 712 124 722 110`;
  const dash = animate ? ' pathLength="1" class="logo-thread"' : '';
  const sticker = `fill="${PAPER}" stroke="${INK}" stroke-linejoin="round" paint-order="stroke"`;
  return `<svg class="${className}" viewBox="0 0 740 200" role="img" aria-label="毛线星球 Yarn Planet" xmlns="http://www.w3.org/2000/svg">
  <defs><clipPath id="${id}-ball"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${strand}" stroke="${INK}" stroke-width="10"${dash}/>
    <path d="${strand}" stroke="${THREAD_COLORS.voice}" stroke-width="5"${dash}/>
  </g>
  <g class="logo-spool">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER}"/>
    <g clip-path="url(#${id}-ball)" fill="none" stroke-linecap="round">${windings}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="6"/>
    <path d="M${cx - 30} ${cy - 40}q14 -9 30 -8" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="7" stroke-linecap="round"/>
  </g>
  <text class="logo-name" data-copy="logoName" x="180" y="118" font-size="84" font-weight="900" letter-spacing="4" stroke-width="14" ${sticker}
    font-family="'PingFang SC','Hiragino Sans GB','Hiragino Sans','Apple SD Gothic Neo','Noto Sans CJK SC','Microsoft YaHei',system-ui,sans-serif">毛线星球</text>
  <text class="logo-sub" data-copy="logoSub" x="186" y="176" font-size="30" font-weight="800" letter-spacing="9" stroke-width="8" ${sticker}
    font-family="'Avenir Next','PingFang SC','Hiragino Sans GB','Noto Sans CJK SC',system-ui,sans-serif">YARN PLANET</text>
</svg>`;
}

/** Small spool glyph in ink with a colored thread, used on the objective card. */
export function spoolIconSvg(color = THREAD_COLORS.power): string {
  // `style` (not presentation attributes) so `var(--thread)` and `currentColor` both work.
  return `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="13" y="12" width="22" height="24" style="fill:${color}" stroke="${INK}" stroke-width="2.6"/>
    <path d="M14 18q10 3 20 0M14 24q10 3 20 0M14 30q10 3 20 0" stroke="${INK}" stroke-opacity=".45" stroke-width="1.6"/>
    <rect x="8" y="8" width="32" height="6" rx="2.5" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>
    <rect x="8" y="34" width="32" height="6" rx="2.5" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>
    <path d="M35 33q6 6 7 12" style="stroke:${color}" stroke-width="3"/>
  </svg>`;
}

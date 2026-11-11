/** Small monoline icons drawn with currentColor so CSS controls ink and state. */
const svg = (body: string, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;

export const ICONS = {
  help: svg('<path d="M9 9.2a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.2-1.6 2.3"/><path d="M12 17.6v.2"/>'),
  journal: svg('<path d="M6 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6z"/><path d="M6 4v16"/><path d="M10 9c2.2-1.2 3.2 1.2 5 0M10 13c2.2-1.2 3.2 1.2 5 0"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  camera: svg('<path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5H8l1.2-1.8h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.2"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  lock: svg('<rect x="6" y="11" width="12" height="8.5" rx="2"/><path d="M8.8 11V8.6a3.2 3.2 0 0 1 6.4 0V11"/>'),
  check: svg('<path d="M5.5 12.8l4 4 9-9.6"/>'),
  jump: svg('<path d="M12 18.5V6.5M7 11.2l5-5 5 5"/>'),
  hand: svg('<path d="M8.5 12V6.2a1.3 1.3 0 0 1 2.6 0V11M11.1 10V4.9a1.3 1.3 0 0 1 2.6 0V11M13.7 10.4V6.2a1.3 1.3 0 0 1 2.6 0V14c0 3.3-2 5.5-5 5.5-2.2 0-3.4-1-4.6-3L4 13.4a1.4 1.4 0 0 1 2.2-1.6l2.3 2.2"/>'),
  reel: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 4.8a7.2 7.2 0 1 1-6.5 4.1"/><path d="M5 5.2l.6 3.9 3.9-.7"/>'),
  arrow: svg('<path d="M12 4.5v15M6.5 10l5.5-5.5 5.5 5.5"/>', ' stroke-width="2.6"'),
  globe: svg('<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.6 2.4 2.6 13.6 0 16M12 4c-2.6 2.4-2.6 13.6 0 16"/>'),
  heart: svg('<path d="M12 19.5s-7-4.3-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z"/>'),
} as const;

export type IconName = keyof typeof ICONS;

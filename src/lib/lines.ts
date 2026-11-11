export const LINE_IDS = [
  'bakerloo',
  'central',
  'circle',
  'district',
  'hammersmith-city',
  'jubilee',
  'metropolitan',
  'northern',
  'piccadilly',
  'victoria',
  'waterloo-city',
  'elizabeth',
  'liberty',
  'lioness',
  'mildmay',
  'suffragette',
  'weaver',
  'windrush',
  'dlr',
  'tram'
] as const;

export type LineId = (typeof LINE_IDS)[number];

/** TfL's own mode ids, which its status endpoint wants */
// each with the ring colour of its own roundel
export const MODES = [
  { id: 'tube', name: 'Tube', roundel: '#dc241f' },
  { id: 'elizabeth-line', name: 'Elizabeth line', roundel: '#6950a1' },
  { id: 'dlr', name: 'DLR', roundel: '#00afad' },
  { id: 'overground', name: 'Overground', roundel: '#ee7c0e' },
  { id: 'tram', name: 'Trams', roundel: '#5fb526' }
] as const;

export type ModeId = (typeof MODES)[number]['id'];

export interface Line {
  id: LineId;
  mode: ModeId;
  name: string;
  colour: string;
  ink: string;
}

// TfL's own line palette, with whichever ink clears 4.5:1 on top of it
export const LINES: Line[] = [
  { id: 'bakerloo', mode: 'tube', name: 'Bakerloo', colour: '#b36305', ink: '#000000' },
  { id: 'central', mode: 'tube', name: 'Central', colour: '#e32017', ink: '#ffffff' },
  { id: 'circle', mode: 'tube', name: 'Circle', colour: '#ffd300', ink: '#0019a8' },
  { id: 'district', mode: 'tube', name: 'District', colour: '#00782a', ink: '#ffffff' },
  {
    id: 'hammersmith-city',
    mode: 'tube',
    name: 'Hammersmith & City',
    colour: '#f3a9bb',
    ink: '#0019a8'
  },
  { id: 'jubilee', mode: 'tube', name: 'Jubilee', colour: '#a0a5a9', ink: '#0019a8' },
  { id: 'metropolitan', mode: 'tube', name: 'Metropolitan', colour: '#9b0056', ink: '#ffffff' },
  { id: 'northern', mode: 'tube', name: 'Northern', colour: '#000000', ink: '#ffffff' },
  { id: 'piccadilly', mode: 'tube', name: 'Piccadilly', colour: '#003688', ink: '#ffffff' },
  { id: 'victoria', mode: 'tube', name: 'Victoria', colour: '#0098d4', ink: '#000000' },
  { id: 'waterloo-city', mode: 'tube', name: 'Waterloo & City', colour: '#95cdba', ink: '#0019a8' },
  {
    id: 'elizabeth',
    mode: 'elizabeth-line',
    name: 'Elizabeth',
    colour: '#6950a1',
    ink: '#ffffff'
  },
  { id: 'liberty', mode: 'overground', name: 'Liberty', colour: '#61686b', ink: '#ffffff' },
  { id: 'lioness', mode: 'overground', name: 'Lioness', colour: '#ffa600', ink: '#0019a8' },
  { id: 'mildmay', mode: 'overground', name: 'Mildmay', colour: '#006fe6', ink: '#ffffff' },
  { id: 'suffragette', mode: 'overground', name: 'Suffragette', colour: '#18a95d', ink: '#000000' },
  { id: 'weaver', mode: 'overground', name: 'Weaver', colour: '#9b0058', ink: '#ffffff' },
  { id: 'windrush', mode: 'overground', name: 'Windrush', colour: '#dc241f', ink: '#ffffff' },
  { id: 'dlr', mode: 'dlr', name: 'DLR', colour: '#00afad', ink: '#000000' },
  { id: 'tram', mode: 'tram', name: 'Tram', colour: '#5fb526', ink: '#000000' }
];

const BY_ID = new Map(LINES.map((line) => [line.id, line]));

export const lineById = (id: string): Line | undefined => BY_ID.get(id as LineId);

export const isLineId = (id: string): id is LineId => BY_ID.has(id as LineId);

// the Northern's black would vanish on the night page, so it follows the theme
export const colourOf = (line: Line) => (line.id === 'northern' ? 'var(--northern)' : line.colour);
export const inkOf = (line: Line) => (line.id === 'northern' ? 'var(--paper)' : line.ink);

export const isModeId = (id: string): id is ModeId => MODES.some((mode) => mode.id === id);

/** Lines from the modes someone's switched on */
export const linesIn = (modes: Iterable<ModeId>): Set<LineId> => {
  const wanted = new Set(modes);
  return new Set(LINES.filter((line) => wanted.has(line.mode)).map((line) => line.id));
};

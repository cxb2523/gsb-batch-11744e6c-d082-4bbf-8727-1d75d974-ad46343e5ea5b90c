import woff from '@fontsource/hammersmith-one/files/hammersmith-one-latin-400-normal.woff?inline';
import satori from 'satori';
import sharp from 'sharp';
import { diagram, ends } from '#lib/line/diagram.js';
import { lengthOf, zoneSpan } from '#lib/line/facts.js';
import { listed, spoken } from '#lib/line/seo.js';
import { lineById, type Line } from '#lib/lines.js';
import { placesOn, type Place } from '#lib/network.js';
import mark from '../../../static/favicon.svg?raw';
import { busyOf, factsOf, trainsOf, zonesOn } from './places.js';

interface Node {
  type: string;
  props: object;
}

const WIDTH = 1200;
const HEIGHT = 630;
const FONT = 'Hammersmith One';
// the light theme's, as a picture can't follow the page's
const TEXT = '#14181f';
const MUTED = '#4f5866';
const INK = '#0019a8';

const font = Buffer.from(woff.split(',')[1], 'base64');
const logo = `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}`;

/** An element as satori takes it, laid out with flexbox like everything it draws */
const h = (style: object, ...children: (Node | string)[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children }
});

/** A size for text that gets smaller the longer it is */
const fitted = (text: string, sizes: [longest: number, size: number][]) =>
  sizes.find(([longest]) => text.length <= longest)![1];

/** The colours of a station's lines side by side, through an interchange as on the map */
function stripes(colours: string[]) {
  const thick = Math.min(24, Math.floor(96 / colours.length) - 6);
  return h(
    {
      position: 'relative',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 6,
      height: 120
    },
    ...colours.map((colour) => h({ height: thick, background: colour })),
    h({
      position: 'absolute',
      top: 12,
      left: 1000,
      width: 96,
      height: 96,
      boxSizing: 'border-box',
      borderRadius: 48,
      border: `12px solid ${TEXT}`,
      background: '#fff'
    })
  );
}

/** A line with a tick for its stations, or as many as fit */
function track(colour: string, stations: number) {
  const ticks = Math.min(stations, 24);
  return h(
    { position: 'relative', height: 120 },
    h({ position: 'absolute', top: 40, width: WIDTH, height: 26, background: colour }),
    ...Array.from({ length: ticks }, (_, i) =>
      h({
        position: 'absolute',
        top: 66,
        left: 72 + (i * 1046) / Math.max(ticks - 1, 1),
        width: 10,
        height: 22,
        background: colour
      })
    )
  );
}

/** A link preview: the site's name, the page's heading and what it has, over its lines */
async function preview(heading: Node, detail: Node, about: string, rail: Node) {
  const brand = h(
    { alignItems: 'center', gap: 18 },
    { type: 'img', props: { src: logo, width: 60, height: 60 } },
    h({ fontSize: 40, color: INK }, 'tubespotting')
  );
  const page = h(
    { flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 26 },
    heading,
    detail,
    h({ fontSize: 30, color: MUTED }, about)
  );
  const svg = await satori(
    h(
      {
        flexDirection: 'column',
        width: WIDTH,
        height: HEIGHT,
        background: '#fff',
        color: TEXT,
        fontFamily: FONT
      },
      h({ flexDirection: 'column', flexGrow: 1, gap: 26, padding: '60px 72px 36px' }, brand, page),
      rail
    ),
    { width: WIDTH, height: HEIGHT, fonts: [{ name: FONT, data: font, weight: 400 }] }
  );
  const png = await sharp(Buffer.from(svg)).png({ palette: true, compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
}

export function stationPreview(place: Place) {
  const lines = place.lines.map((id) => lineById(id)!);
  const zone = factsOf(place)?.zone;
  const has = [
    'Live departures',
    ...(trainsOf(place) ? ['first and last trains'] : []),
    ...(busyOf(place) ? ['busy times'] : [])
  ];
  return preview(
    h(
      {
        fontSize: fitted(place.name, [
          [14, 112],
          [22, 92],
          [Infinity, 72]
        ]),
        lineHeight: 1.05,
        color: INK
      },
      place.name
    ),
    h(
      { flexWrap: 'wrap', gap: 14 },
      ...lines.map(({ name, colour, ink }) =>
        h(
          { fontSize: 30, padding: '6px 18px', borderRadius: 8, background: colour, color: ink },
          name
        )
      )
    ),
    [...(zone ? [`Zone ${zone}`] : []), listed(has)].join(' · '),
    stripes(lines.map((line) => line.colour))
  );
}

export function linePreview(line: Line) {
  const name = spoken(line);
  const stations = placesOn(line.id).length;
  const zones = zoneSpan(Object.values(zonesOn(line.id)));
  const about = [
    `${stations} stations`,
    `${Math.round(lengthOf(line.id) / 1000)} km`,
    ...(zones ? [`${zones.includes('–') ? 'Zones' : 'Zone'} ${zones}`] : []),
    'Live trains and status'
  ];
  return preview(
    h(
      {},
      h(
        {
          fontSize: fitted(name, [
            [16, 104],
            [Infinity, 80]
          ]),
          lineHeight: 1.1,
          padding: '4px 28px 12px',
          borderRadius: 12,
          background: line.colour,
          color: line.ink
        },
        name
      )
    ),
    h({ fontSize: 40 }, `Runs between ${listed(ends(diagram(line.id)))}`),
    about.join(' · '),
    track(line.colour, stations)
  );
}

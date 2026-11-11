import { LINES } from '#lib/lines.js';
import { site } from '#lib/meta.js';
import { places } from '#lib/network.js';

export const prerender = true;

const paths = [
  '/',
  '/lines',
  ...LINES.map((line) => `/lines/${line.id}`),
  '/stations',
  ...places.map((place) => `/stations/${place.slug}`),
  '/about'
];

export const GET = () =>
  new Response(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      paths.map((path) => `<url><loc>${site}${path}</loc></url>`).join('') +
      '</urlset>\n',
    { headers: { 'content-type': 'application/xml' } }
  );

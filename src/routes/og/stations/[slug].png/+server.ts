import { error } from '@sveltejs/kit';
import { placeBySlug, places } from '#lib/network.js';
import { stationPreview } from '#lib/server/og.js';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => places.map(({ slug }) => ({ slug }));

export const GET: RequestHandler = ({ params }) => {
  const place = placeBySlug.get(params.slug);
  if (!place) error(404, 'No station by that name');
  return stationPreview(place);
};

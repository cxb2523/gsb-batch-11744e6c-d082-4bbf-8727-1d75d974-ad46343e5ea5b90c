import { error } from '@sveltejs/kit';
import { placeBySlug } from '#lib/network.js';
import { crowdingOf } from '#lib/server/places.js';
import { serve } from '#lib/server/serve.js';
import { crowdingNow } from '#lib/server/tfl.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
  const place = placeBySlug.get(event.params.slug);
  const crowding = place && crowdingOf(place);
  if (!crowding) error(404, 'TfL counts no one at that station');
  return serve(() => crowdingNow(crowding), 'public, max-age=60, s-maxage=120')(event);
};

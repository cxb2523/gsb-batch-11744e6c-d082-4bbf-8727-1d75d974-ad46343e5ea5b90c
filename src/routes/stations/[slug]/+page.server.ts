import { error } from '@sveltejs/kit';
import { placeBySlug, places } from '#lib/network.js';
import { busyOf, factsOf, trainsOf } from '#lib/server/places.js';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => places.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = ({ params }) => {
  const place = placeBySlug.get(params.slug);
  if (!place) error(404, 'No station by that name');
  return {
    slug: place.slug,
    facts: factsOf(place),
    busy: busyOf(place),
    trains: trainsOf(place)
  };
};

import { error } from '@sveltejs/kit';
import { lineById } from '#lib/lines.js';
import { zonesOn } from '#lib/server/places.js';
import { lineStatus } from '#lib/server/tfl.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const line = lineById(params.id);
  if (!line) error(404, 'No line by that name');
  return { id: line.id, zones: zonesOn(line.id), status: await lineStatus() };
};

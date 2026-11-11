import { error } from '@sveltejs/kit';
import { lineById, LINES } from '#lib/lines.js';
import { linePreview } from '#lib/server/og.js';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => LINES.map(({ id }) => ({ id }));

export const GET: RequestHandler = ({ params }) => {
  const line = lineById(params.id);
  if (!line) error(404, 'No line by that name');
  return linePreview(line);
};

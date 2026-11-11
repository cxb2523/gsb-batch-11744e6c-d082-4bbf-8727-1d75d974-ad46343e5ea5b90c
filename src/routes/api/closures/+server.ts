import { serve } from '#lib/server/serve.js';
import { plannedClosures } from '#lib/server/tfl.js';

export const GET = serve(plannedClosures, 'public, max-age=600, s-maxage=1800');

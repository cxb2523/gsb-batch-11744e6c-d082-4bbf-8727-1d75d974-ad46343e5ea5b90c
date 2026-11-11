import { serve } from '#lib/server/serve.js';
import { live } from '#lib/server/tfl.js';

export const GET = serve(live, 'public, max-age=0, s-maxage=5');

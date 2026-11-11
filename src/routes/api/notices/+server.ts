import { serve } from '#lib/server/serve.js';
import { stationNotices } from '#lib/server/tfl.js';

export const GET = serve(stationNotices, 'public, max-age=60, s-maxage=300');

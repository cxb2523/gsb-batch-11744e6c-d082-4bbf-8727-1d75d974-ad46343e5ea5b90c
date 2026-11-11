import { lineStatus } from '#lib/server/tfl.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ status: await lineStatus() });

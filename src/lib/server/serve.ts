import { error, type RequestHandler } from '@sveltejs/kit';

/** An endpoint for something read from TfL, or a 503 while TfL isn't answering */
export const serve =
  (read: () => Promise<string>, cache: string): RequestHandler =>
  async ({ url }) => {
    const body = await read().catch((err) => {
      console.error(`Nothing to serve on ${url.pathname}`, err);
      return error(503, 'TfL is not answering right now');
    });
    return new Response(body, {
      headers: { 'content-type': 'application/json', 'cache-control': cache }
    });
  };

import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { loadPlausible } from '#lib/plausible.js';
import { read } from '#lib/settings/saved.js';

const dsn = import.meta.env.PUBLIC_SENTRY_DSN;
// each error goes once a visit, and only so many, so a page stuck failing every frame can't flood
const MOST = 10;
const sent = new Set<string>();
let sentry: Promise<(error: unknown) => void> | undefined;

// the SDK only downloads once something's actually broken, so a page that works never pays for it
function report(error: unknown) {
  const key = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (sent.has(key) || sent.size >= MOST || !read().errors) return;
  sent.add(key);
  sentry ??= import('#lib/sentry.js').then(({ start }) => start(dsn)).catch(() => () => {});
  sentry.then((capture) => capture(error));
}

if (dsn) {
  addEventListener('error', (event) => event.error && report(event.error));
  // ours always reject with an Error, unlike the odds and ends extensions leave behind
  addEventListener(
    'unhandledrejection',
    (event) => event.reason instanceof Error && report(event.reason)
  );
}

export const handleError: HandleClientError = ({ kind, error }) => {
  if (dsn && kind === 'unknown') report(error);
};

// before any page mounts, so a station picked straight from a link still counts
export const init: ClientInit = () => {
  if (read().analytics) loadPlausible();
};

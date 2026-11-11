export const site = 'https://tubespotting.peng.ly';
export const source = 'https://github.com/NotAFlightRisk/tubespotting';
export const name = 'Tube Spotting';
export const description =
  'Live London Underground map showing real time train locations across the TfL network. Tap a station for its next trains.';
export const imageAlt =
  'Map of central London with live Tube trains on every line, beside the status of each line';

/** Tells search engines what the site's called, for the name shown above its results */
export const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name,
  alternateName: 'tubespotting',
  url: site
};

export const counting = Boolean(import.meta.env.PUBLIC_PLAUSIBLE_SCRIPT);
export const reporting = Boolean(import.meta.env.PUBLIC_SENTRY_DSN);

/** The way to a page through the site, for search engines to show above its result */
export const breadcrumbs = (trail: [name: string, url: string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, item], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item
  }))
});

// before first paint, so a picked look never flashes the other one (as in settings/saved.ts)
{
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('tubespotting:settings')) ?? {};
  } catch {
    // nothing saved we can read
  }
  const looks = {
    dark: 'prefers-color-scheme: dark',
    calm: 'prefers-reduced-motion: reduce',
    contrast: 'prefers-contrast: more'
  };
  for (const [look, query] of Object.entries(looks))
    document.documentElement.dataset[look] = saved[look] ?? matchMedia(`(${query})`).matches;
}

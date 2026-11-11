<script lang="ts">
  import { imageAlt, name, site } from '#lib/meta.js';

  interface Props {
    title: string;
    description: string;
    /** Where it lives on the site, from the slash after the domain */
    path?: string;
    /** schema.org things for search engines */
    data?: object[];
    /** Its picture for link previews, from the slash after the domain */
    image?: string;
    alt?: string;
  }

  let {
    title,
    description,
    path = '',
    data = [],
    image = '/og.png',
    alt = imageAlt
  }: Props = $props();

  const url = $derived(site + path);
  // a < in a name can't close the script early
  const json = (thing: object) => JSON.stringify(thing).replace(/</g, '\\u003c');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content="max-image-preview:large" />
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={name} />
  <meta property="og:locale" content="en_GB" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content="{site}{image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={alt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image:alt" content={alt} />
  {#each data as thing, i (i)}
    {@html `<script type="application/ld+json">${json(thing)}</script>`}
  {/each}
</svelte:head>

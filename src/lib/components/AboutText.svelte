<script lang="ts">
  import { counting, reporting, source } from '#lib/meta.js';

  interface Props {
    /** Underground trains running now, or null until TfL has answered */
    trains?: number | null;
    /** On a page of its own rather than over the map, so under its h1 and linking back to it */
    page?: boolean;
  }

  let { trains = null, page = false }: Props = $props();

  const apps = ['apps.aliciasykes.com', 'peng.ly/projects'];
  const heading = $derived(page ? 'h2' : 'h3');
</script>

<!-- a link off the site opens in a new tab, so the map stays as it was -->
{#snippet link(href: string, text: string)}
  <a {href} target="_blank" rel="noopener">{text}</a>
{/snippet}

{#snippet map()}
  {#if page}<a href="/">the live map</a>{:else}this map{/if}
{/snippet}

<!-- not translated, so it's read out in English whatever language the page is in -->
<div lang="en" class:page>
  <p>
    {#if trains === null}
      Every train running on the Underground is on {@render map()}.
    {:else if trains === 0}
      No trains are running on the Underground right now. When they are, {@render map()} shows every one
      of them.
    {:else if trains === 1}
      Right now there's 1 train running on the Underground, and {@render map()} shows it.
    {:else}
      Right now there are {trains} trains running on the Underground, and {@render map()} shows every
      one of them.
    {/if}
    All in real-time from official TfL arrivals data.
  </p>

  <section>
    <svelte:element this={heading}>Credits</svelte:element>
    <p>
      tubespotting is built by {@render link('https://github.com/lissy93', '@Lissy93')} and
      {@render link('https://github.com/notAFlightRisk', '@NotAFlightRisk')}, and licensed under
      {@render link(`${source}/blob/main/LICENSE`, 'MIT')} © 2026.
    </p>
    <p>
      Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and
      Geomni UK Map data © and database rights [2019]. Track shapes and the Thames are ©
      OpenStreetMap contributors. Not affiliated with TfL.
    </p>
  </section>

  <section>
    <svelte:element this={heading}>Source code</svelte:element>
    <p>
      You can view our code, run this app yourself, or report a bug over at our GitHub:
      {@render link(source, source.replace('https://', ''))}
    </p>
  </section>

  <section>
    <svelte:element this={heading}>Privacy</svelte:element>
    <ul>
      <li>
        If you let the map use your location, it's only used to find your nearest station and never
        leaves your device.
      </li>
      <li>
        Your settings, like which lines are on and light or dark mode, are saved in your browser and
        nowhere else.
      </li>
      {#if counting}
        <li>
          We count visits with Plausible, a privacy-friendly analytics tool, to get a rough idea of
          how many people use the map. It sets no cookies, and no personal data is ever collected,
          stored or shared. You can turn it off in settings.
        </li>
      {/if}
      {#if reporting}
        <li>
          If something breaks, a redacted error report goes to our own bug tracker so we know what
          to fix. You can turn it off in settings.
        </li>
      {/if}
    </ul>
  </section>

  <section>
    <svelte:element this={heading}>More apps</svelte:element>
    <p>If you enjoyed this, Lissy and Pengly have many more open source projects to check out!</p>
    <ul>
      {#each apps as app (app)}
        <li>{@render link(`https://${app}`, app)}</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  section {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--rule);
    color: var(--text-muted);
    font-size: 13px;

    .page & {
      font-size: 15px;
    }

    > :first-child {
      margin: 0 0 var(--space-2);
      font: 17px/1.2 var(--font-display);
      color: var(--text);
    }
  }

  p,
  ul {
    margin: var(--space-3) 0 0;
  }

  section > :nth-child(2) {
    margin-top: 0;
  }

  ul {
    padding-left: var(--space-5);
  }

  li + li {
    margin-top: var(--space-1);
  }
</style>

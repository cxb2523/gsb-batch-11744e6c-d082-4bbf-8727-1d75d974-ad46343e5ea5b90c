<script lang="ts">
  import Head from '#lib/components/Head.svelte';
  import IndexPage from '#lib/components/IndexPage.svelte';
  import LineChips from '#lib/components/LineChips.svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { name } from '#lib/meta.js';
  import { places, type Place } from '#lib/network.js';
  import { indexDescription } from '#lib/station/seo.js';

  const byLetter = new Map<string, Place[]>();
  for (const place of places.toSorted((a, b) => a.name.localeCompare(b.name, 'en-GB'))) {
    const letter = place.name[0].toUpperCase();
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), place]);
  }
</script>

<Head title="{t.stations.heading} | {name}" description={indexDescription} path="/stations" />

<IndexPage heading={t.stations.heading} intro={t.stations.intro(String(places.length))}>
  <nav aria-label={t.stations.letters}>
    <ul class="letters">
      {#each byLetter.keys() as letter (letter)}
        <li><a href="#{letter}">{letter}</a></li>
      {/each}
    </ul>
  </nav>
  {#each byLetter as [letter, list] (letter)}
    <section aria-labelledby={letter}>
      <h2 id={letter}>{letter}</h2>
      <ul class="list">
        {#each list as place (place.slug)}
          <li>
            <a href="/stations/{place.slug}">{place.name}</a>
            <LineChips lines={place.lines} />
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</IndexPage>

<style>
  .letters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: var(--space-4) 0 0;
    padding: 0;
    list-style: none;

    a {
      display: grid;
      place-items: center;
      min-width: var(--tap);
      min-height: var(--tap);
      border-radius: var(--radius-small);
      background: var(--surface-sunk);
      font: 17px/1 var(--font-display);
      text-decoration: none;

      &:hover {
        background: var(--rule);
      }
    }
  }

  h2 {
    margin: var(--space-6) 0 var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--rule);
    font: 24px/1.1 var(--font-display);
    color: var(--station-ink);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    columns: 18rem;
    column-gap: var(--space-6);

    li {
      display: grid;
      gap: 2px;
      padding: var(--space-2) 0;
      break-inside: avoid;
    }

    a {
      font: 17px/1.25 var(--font-display);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
</style>

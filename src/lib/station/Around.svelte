<script lang="ts">
  import { metres, t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, lineById, type LineId } from '#lib/lines.js';
  import { nearby, neighbours, type Place } from '#lib/network.js';

  let { place }: { place: Place } = $props();

  // about a quarter of an hour's walk
  const WALK = 1000;
  const MOST = 6;

  const next = $derived(neighbours(place).filter(({ next }) => next.length));
  const near = $derived(nearby(place, WALK).slice(0, MOST));
</script>

{#snippet swatches(lines: LineId[])}
  <span class="swatches">
    {#each lines as id (id)}
      {@const line = lineById(id)!}
      <span style:--line={colourOf(line)}><span class="visually-hidden">{line.name}</span></span>
    {/each}
  </span>
{/snippet}

<section aria-labelledby="around">
  <h2 id="around">{t.station.around}</h2>
  {#if next.length}
    <h3>{t.station.next}</h3>
    <dl>
      {#each next as { line, next: stops } (line)}
        <dt>{@render swatches([line])}{lineById(line)!.name}</dt>
        <dd>
          <ul>
            {#each stops as { place: there, seconds } (there.slug)}
              <li>
                <a href="/stations/{there.slug}">{there.name}</a>
                <span class="far">{t.minutes(Math.max(1, Math.round(seconds / 60)))}</span>
              </li>
            {/each}
          </ul>
        </dd>
      {/each}
    </dl>
  {/if}
  {#if near.length}
    <h3>{t.station.nearby}</h3>
    <ul class="near">
      {#each near as { place: there, metres: m } (there.slug)}
        <li>
          <a href="/stations/{there.slug}">{there.name}</a>
          {@render swatches(there.lines)}
          <span class="far">{metres(m)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: var(--text-muted);
    font: 600 13px/1.2 var(--font-ui);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }

  dt {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font: 15px/1.5 var(--font-display);
  }

  dd {
    margin: 0;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    line-height: 1.5;
  }

  .near {
    display: grid;
    gap: var(--space-1);

    .far {
      margin-left: auto;
    }
  }

  .far {
    color: var(--text-muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .swatches {
    display: inline-flex;
    flex: none;
    gap: 2px;

    > span {
      width: 14px;
      height: 4px;
      background: var(--line);
      translate: 0 -3px;
    }
  }
</style>

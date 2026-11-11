<script lang="ts">
  import { onMount } from 'svelte';
  import Feed from '#lib/components/Feed.svelte';
  import Head from '#lib/components/Head.svelte';
  import IndexPage from '#lib/components/IndexPage.svelte';
  import Roundel from '#lib/components/Roundel.svelte';
  import StatusList from '#lib/components/StatusList.svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { linesDescription, linesTitle } from '#lib/line/seo.js';
  import { LINES, MODES } from '#lib/lines.js';
  import { connectLive, live } from '#lib/live.svelte.js';
  import { load } from '#lib/settings/settings.svelte.js';
  import { summary } from '#lib/status.js';

  let { data } = $props();

  onMount(load);
  connectLive();

  const status = $derived(live.snapshot?.status ?? data.status ?? []);
  const news = $derived(summary(status));
</script>

<Head title={linesTitle} description={linesDescription} path="/lines" />

<IndexPage heading={t.lines.heading} intro={t.lines.intro}>
  {#snippet header()}<Feed trains={live.running.length} />{/snippet}
  <ul class="summary" aria-live="polite">
    {#each news as { tone, text } (text)}
      <li data-tone={tone}>{text}</li>
    {:else}
      <li>{t.summary.checking}</li>
    {/each}
  </ul>
  {#each MODES as mode (mode.id)}
    <section aria-labelledby={mode.id}>
      <h2 id={mode.id}>
        <Roundel colour={mode.roundel} width={28} />
        {mode.name}
      </h2>
      <StatusList
        lines={LINES.filter((line) => line.mode === mode.id).map((line) => line.id)}
        {status}
      />
    </section>
  {/each}
</IndexPage>

<style>
  .summary {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-5) 0 0;
    padding: var(--space-4);
    border-radius: var(--radius);
    background: var(--surface-sunk);
    list-style: none;
    font: 17px/1.35 var(--font-display);
    color: var(--text);
    text-wrap: pretty;

    li {
      display: flex;
      gap: var(--space-3);
    }

    /* a dot for how good or bad the news is, as on the map's line list */
    li::before {
      content: '';
      flex: none;
      width: 10px;
      height: 10px;
      margin-top: 0.3em;
      border-radius: 50%;
      background: var(--tone, var(--text-muted));
    }
  }

  h2 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-6) 0 var(--space-3);
    font: 22px/1.1 var(--font-display);
    color: var(--station-ink);
  }
</style>

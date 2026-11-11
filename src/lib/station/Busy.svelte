<script lang="ts">
  import { onMount } from 'svelte';
  import { hour, t } from '#lib/i18n/i18n.svelte.js';
  import type { Busy } from '#lib/types.js';
  import DayHeading from './DayHeading.svelte';
  import { londonNow } from './london.js';

  let { busy, slug }: { busy: Busy; slug: string } = $props();

  const LABELLED = [6, 9, 12, 15, 18, 21];
  // how far off the usual for the hour, out of 100 for the busiest, before it's worth a mention
  const MARGIN = 10;

  // which day it is in London is only known once it's open, so nothing's shown until then
  let today = $state<{ day: number; hour: number } | null>(null);
  let day = $state(0);

  const hours = $derived(busy[day]);
  const peak = $derived(hours.indexOf(Math.max(...hours)));

  const countNow = (station: string): Promise<number | null> =>
    fetch(`/api/crowding/${station}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

  // asked for once it's open, and again for another station's page
  const counted = $derived(today && countNow(slug));

  function compare(now: number | null) {
    if (now === null || !today) return null;
    const usual = busy[today.day][today.hour];
    return now > usual + MARGIN ? 'busier' : now < usual - MARGIN ? 'quieter' : 'usual';
  }

  onMount(() => {
    today = londonNow();
    day = today.day;
  });
</script>

<section aria-labelledby="busy">
  <DayHeading id="busy" title={t.station.busy} bind:day disabled={!today} />
  <div class="chart">
    {#if today}
      <p>{t.station.busiest(hour(peak))}</p>
      <p class="live" aria-live="polite">
        {#await counted then now}
          {@const compared = day === today.day && compare(now)}
          {#if compared}
            <span data-tone={compared === 'busier' ? 'warn' : 'good'}>
              {t.station.crowding[compared]}
            </span>
          {/if}
        {/await}
      </p>
      <ol aria-hidden="true">
        {#each hours as level, h (h)}
          <li class:now={day === today.day && h === today.hour} style:--level="{level}%">
            {#if day === today.day && h === today.hour}<span class="mark">{t.station.now}</span
              >{/if}
            {#if LABELLED.includes(h)}<span class="hour">{hour(h)}</span>{/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</section>

<style>
  /* the same height before and after it's drawn, so nothing jumps */
  .chart {
    display: flow-root;
    min-height: 164px;
  }

  p {
    margin: var(--space-2) 0 var(--space-3);
    color: var(--text-muted);
  }

  /* a line kept for how busy it is now, as TfL's count can come in after the chart */
  .live {
    min-height: 1lh;
    margin-top: calc(-1 * var(--space-2));
    color: var(--text);

    span {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }

    span::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--tone);
    }
  }

  ol {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    align-items: end;
    gap: 2px;
    height: 96px;
    margin: 0;
    padding: 0 0 18px;
    list-style: none;
  }

  li {
    position: relative;
    height: max(2px, var(--level));
    border-radius: 2px 2px 0 0;
    background: color-mix(in srgb, var(--accent) 35%, var(--surface-sunk));

    &.now {
      background: var(--accent);
    }
  }

  .hour,
  .mark {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .hour {
    top: calc(100% + 4px);
  }

  .mark {
    bottom: calc(100% + 2px);
    color: var(--accent);
    font-weight: 600;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { t, time } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, lineById, type LineId } from '#lib/lines.js';
  import type { Service, TrainTimes } from '#lib/types.js';
  import DayHeading from './DayHeading.svelte';
  import { londonNow } from './london.js';

  let { trains }: { trains: TrainTimes } = $props();

  const lines = $derived(Object.entries(trains) as [LineId, Service[]][]);

  // Monday until it's open and knows the day in London, so the server still has times to give
  let day = $state(0);
  let ready = $state(false);

  // only trains running all night run between two and four in the morning
  function say(minutes: number) {
    const at = minutes % (24 * 60);
    return at >= 2 * 60 && at < 4 * 60 ? t.station.allNight : time(minutes);
  }

  onMount(() => {
    day = londonNow().day;
    ready = true;
  });
</script>

<section aria-labelledby="first-last">
  <DayHeading id="first-last" title={t.station.firstLast} bind:day disabled={!ready} />
  <table>
    <thead>
      <tr>
        <th scope="col"><span class="visually-hidden">{t.station.destination}</span></th>
        <th scope="col">{t.station.first}</th>
        <th scope="col">{t.station.last}</th>
      </tr>
    </thead>
    {#each lines as [id, services] (id)}
      {@const line = lineById(id)!}
      <tbody>
        <tr>
          <th scope="rowgroup" colspan="3" style:--line={colourOf(line)}>{line.name}</th>
        </tr>
        <!-- TfL leaves whole days out for some lines, which isn't the same as no trains -->
        {#if services.some((service) => service.days[day])}
          {#each services as { to, via, days } (to + (via ?? ''))}
            {@const times = days[day]}
            <tr>
              <th scope="row">
                {t.line.to(to)}
                {#if via}<span class="via">{t.station.via(via)}</span>{/if}
              </th>
              <td>{times ? say(times[0]) : '–'}</td>
              <td>{times ? say(times[1]) : '–'}</td>
            </tr>
          {/each}
        {:else}
          <tr>
            <td colspan="3" class="unknown">{t.station.noTimes}</td>
          </tr>
        {/if}
      </tbody>
    {/each}
  </table>
</section>

<style>
  table {
    width: 100%;
    margin-top: var(--space-2);
    border-collapse: collapse;
  }

  th,
  td {
    padding: var(--space-1) 0;
    text-align: left;
    vertical-align: baseline;
  }

  thead th {
    color: var(--text-muted);
    font: 600 12px/1.3 var(--font-ui);
  }

  thead th + th,
  td {
    padding-left: var(--space-4);
    text-align: right;
    white-space: nowrap;
  }

  td {
    font-variant-numeric: tabular-nums;
  }

  .unknown {
    padding-left: 0;
    color: var(--text-muted);
    text-align: left;
    white-space: normal;
  }

  /* each line under its own name, with its colour as on the line list */
  [scope='rowgroup'] {
    padding-top: var(--space-3);
    font: 15px/1.3 var(--font-display);

    &::before {
      content: '';
      display: inline-block;
      width: 14px;
      height: 4px;
      margin-right: var(--space-2);
      vertical-align: middle;
      background: var(--line);
    }
  }

  [scope='row'] {
    font-weight: normal;
    text-wrap: pretty;
  }

  tbody tr + tr {
    border-top: 1px solid var(--rule);
  }

  .via {
    color: var(--text-muted);
    font-size: 13px;
  }
</style>

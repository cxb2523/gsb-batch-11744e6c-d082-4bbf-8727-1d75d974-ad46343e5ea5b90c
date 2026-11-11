<script lang="ts">
  import type { Tracked } from '#lib/fleet.js';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import type { LineId } from '#lib/lines.js';
  import { placeOf, type Station } from '#lib/network.js';
  import Around from '#lib/station/Around.svelte';
  import Busy from '#lib/station/Busy.svelte';
  import Facts from '#lib/station/Facts.svelte';
  import type { Snapshot, StationInfo, TrainReading } from '#lib/types.js';
  import Departures from './Departures.svelte';
  import LineChips from './LineChips.svelte';
  import PageLink from './PageLink.svelte';

  interface Props {
    station: Station;
    shown: Set<LineId>;
    snapshot: Snapshot | null;
    now: number;
    trainOf: (reading: TrainReading) => Tracked | undefined;
    onpicktrain: (key: string) => void;
  }

  let { station, shown, snapshot, now, trainOf, onpicktrain }: Props = $props();

  const place = $derived(placeOf(station.index));
  const info = $derived(
    fetch(`/api/stations/${place.slug}.json`)
      .then((res): Promise<StationInfo> | null => (res.ok ? res.json() : null))
      .catch(() => null)
  );
</script>

<header>
  <h2>{station.name}</h2>
  <LineChips lines={place.lines.filter((line) => shown.has(line))} />
</header>

<PageLink href="/stations/{place.slug}" eyebrow={t.station.page} name={place.name} />

<Departures {place} lines={shown} {snapshot} {now} {trainOf} {onpicktrain} />

{#await info then got}
  <div class="more">
    {#if got?.busy}<Busy busy={got.busy} slug={place.slug} />{/if}
    {#if got?.facts}<Facts facts={got.facts} />{/if}
    <Around {place} />
  </div>
{/await}

<style>
  header {
    display: grid;
    gap: var(--space-2);
  }

  h2 {
    margin: 0;
    font: 26px/1.1 var(--font-display);
    color: var(--station-ink);
  }

  .more {
    display: grid;
    gap: var(--space-6);
    margin-top: var(--space-6);

    /* the same headings as on the station's own page */
    :global(:where(h2)) {
      margin: 0 0 var(--space-3);
      font: 20px/1.2 var(--font-display);
      color: var(--station-ink);
    }
  }
</style>

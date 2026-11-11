<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import Closures from '#lib/components/Closures.svelte';
  import Departures from '#lib/components/Departures.svelte';
  import Head from '#lib/components/Head.svelte';
  import LineChips from '#lib/components/LineChips.svelte';
  import MapPage from '#lib/components/MapPage.svelte';
  import StatusList from '#lib/components/StatusList.svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { linesIn } from '#lib/lines.js';
  import { live } from '#lib/live.svelte.js';
  import type { Tap } from '#lib/map/TubeMap.svelte';
  import { placeBySlug, placeOf, stations } from '#lib/network.js';
  import { settings } from '#lib/settings/settings.svelte.js';
  import Around from '#lib/station/Around.svelte';
  import Busy from '#lib/station/Busy.svelte';
  import Facts from '#lib/station/Facts.svelte';
  import FirstLast from '#lib/station/FirstLast.svelte';
  import Notices from '#lib/station/Notices.svelte';
  import { stationData, stationDescription, stationImage, stationTitle } from '#lib/station/seo.js';
  import { nextCall } from '#lib/status.js';

  let { data } = $props();

  const place = $derived(placeBySlug.get(data.slug)!);
  const lines = $derived(new Set(place.lines));
  // its own lines are always on, without switching them on for the map back home
  const shown = $derived(new Set([...linesIn(settings.modes), ...place.lines]));
  const running = $derived(live.running.filter((train) => lines.has(train.reading.line)).length);

  let page: MapPage;
  // another station's page drops the train picked on this one
  let picked = $derived.by<string | null>(() => {
    void place;
    return null;
  });
  let notices = $state<Record<string, string[]>>({});

  const focus = $derived({
    shown,
    lines,
    station: place.members[0].index,
    train: picked,
    alone: true
  });
  // TfL files a line's disruption under each of its stations too, where Line status says it already
  const said = $derived.by(() => {
    const reasons = new Set(live.snapshot?.status.map((s) => s.reason));
    const all = new Set(place.members.flatMap((s) => notices[s.id] ?? []));
    return [...all].filter((notice) => !reasons.has(notice));
  });
  // with a column to spare, notices and closures go at the top of it, not in a long line over both;
  // they only ever arrive after the page has opened, so the server never has to guess
  const wide = new MediaQuery('min-width: 960px');

  function onpick(tap: Tap) {
    if (tap?.kind === 'station') {
      const there = placeOf(tap.index);
      if (there !== place) goto(`/stations/${there.slug}`);
    } else picked = tap?.kind === 'train' ? tap.key : null;
  }

  // a row picks its train out, and the map moves to show it on its way in
  function pickTrain(key: string) {
    picked = picked === key ? null : key;
    const train = live.fleet.trains.get(key);
    if (picked && train)
      page.flyTo([...place.members, stations[nextCall(train, live.now).station]]);
  }

  onMount(() => {
    fetch('/api/notices')
      .then((res) => (res.ok ? res.json() : {}))
      .then((got) => (notices = got))
      .catch(() => {});
  });
</script>

<Head
  title={stationTitle(place)}
  description={stationDescription(place)}
  path="/stations/{place.slug}"
  data={stationData(place, data.facts)}
  {...stationImage(place)}
/>

{#snippet warnings()}
  <Notices notices={said} />
  <Closures lines={place.lines} stops={place.members.map((s) => s.id)} />
{/snippet}

<MapPage
  bind:this={page}
  trail={[
    { name: t.page.liveMap, href: '/' },
    { name: t.stations.title, href: '/stations' },
    { name: place.name }
  ]}
  trains={running}
  {focus}
  frame={place.members}
  closest={0.09}
  label={t.map.station(place.name)}
  recentre={t.station.recentre}
  onMap="/?station={place.members[0].id}"
  {onpick}
>
  {#snippet heading()}
    <h1>{place.name}</h1>
  {/snippet}

  {#snippet intro()}
    <LineChips lines={place.lines} />
    {#if data.facts?.zone || data.facts?.night}
      <p class="tags">
        {#if data.facts.zone}<span>{t.facts.zone} {data.facts.zone}</span>{/if}
        {#if data.facts.night}<span>{t.facts.night}</span>{/if}
      </p>
    {/if}
    {#if !wide.current}{@render warnings()}{/if}
  {/snippet}

  {#snippet main()}
    <section aria-labelledby="departures">
      <h2 id="departures">{t.station.departures}</h2>
      <Departures
        {place}
        {lines}
        snapshot={live.snapshot}
        now={live.now}
        trainOf={live.trainOf}
        full
        {picked}
        onpicktrain={pickTrain}
      />
    </section>
  {/snippet}

  {#snippet aside()}
    {#if wide.current}{@render warnings()}{/if}
    <section aria-labelledby="status">
      <h2 id="status">{t.station.status}</h2>
      <StatusList lines={place.lines} status={live.snapshot?.status ?? []} />
    </section>
    {#if data.trains}<FirstLast trains={data.trains} />{/if}
    {#if data.busy}<Busy busy={data.busy} slug={place.slug} />{/if}
    <Around {place} />
    {#if data.facts}<Facts facts={data.facts} />{/if}
  {/snippet}
</MapPage>

<style>
  h1 {
    margin: 0;
    font: 30px/1.1 var(--font-display);
    color: var(--station-ink);
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;

    span {
      padding: 2px var(--space-2);
      border-radius: var(--radius-small);
      background: var(--surface-sunk);
      font-size: 13px;
    }
  }
</style>

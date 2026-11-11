<script lang="ts">
  import { goto } from '$app/navigation';
  import Closures from '#lib/components/Closures.svelte';
  import Head from '#lib/components/Head.svelte';
  import LineTrains from '#lib/components/LineTrains.svelte';
  import MapPage from '#lib/components/MapPage.svelte';
  import StatusList from '#lib/components/StatusList.svelte';
  import StatusText from '#lib/components/StatusText.svelte';
  import { kilometres, list, t } from '#lib/i18n/i18n.svelte.js';
  import Diagram from '#lib/line/Diagram.svelte';
  import { diagram, ends } from '#lib/line/diagram.js';
  import { lengthOf, zoneSpan } from '#lib/line/facts.js';
  import { lineData, lineDescription, lineImage, lineTitle } from '#lib/line/seo.js';
  import { colourOf, inkOf, LINES, lineById, linesIn } from '#lib/lines.js';
  import { live } from '#lib/live.svelte.js';
  import type { Tap } from '#lib/map/TubeMap.svelte';
  import { placeOf, placesOn, stations } from '#lib/network.js';
  import { settings } from '#lib/settings/settings.svelte.js';
  import { lineName, nextCall } from '#lib/status.js';

  let { data } = $props();

  const line = $derived(lineById(data.id)!);
  const drawn = $derived(diagram(line.id));
  const calling = $derived(placesOn(line.id));
  const frame = $derived(stations.filter((s) => s.lines.includes(line.id)));
  const others = $derived(LINES.filter((other) => other !== line).map((other) => other.id));
  const statuses = $derived(live.snapshot?.status ?? data.status ?? []);
  const status = $derived(statuses.find((s) => s.id === line.id));
  const running = $derived(live.running.filter((train) => train.reading.line === line.id));
  // the sizing up anyone wants first, leaving out the zones where TfL doesn't give them
  const glance = $derived(
    [
      [t.stations.title, calling.length],
      [t.lines.length, kilometres(lengthOf(line.id))],
      [t.lines.interchanges, calling.filter((place) => place.lines.length > 1).length],
      [t.lines.zones, zoneSpan(Object.values(data.zones))],
      [t.lines.now, live.snapshot ? running.length : '–']
    ].filter(([, value]) => value !== null)
  );

  let page: MapPage;
  // another line's page drops the train picked on this one
  let picked = $derived.by<string | null>(() => {
    void line;
    return null;
  });

  // its own line is always on, without switching it on for the map back home
  const focus = $derived({
    shown: new Set([...linesIn(settings.modes), line.id]),
    lines: new Set([line.id]),
    station: null,
    train: picked,
    alone: true
  });

  function onpick(tap: Tap) {
    if (tap?.kind === 'station') goto(`/stations/${placeOf(tap.index).slug}`);
    else picked = tap?.kind === 'train' ? tap.key : null;
  }

  function pickTrain(key: string) {
    picked = picked === key ? null : key;
    const train = live.fleet.trains.get(key);
    if (picked && train) page.flyTo([stations[nextCall(train, live.now).station]]);
  }
</script>

<Head
  title={lineTitle(line)}
  description={lineDescription(line, drawn)}
  path="/lines/{line.id}"
  data={lineData(line)}
  {...lineImage(line)}
/>

<MapPage
  bind:this={page}
  trail={[
    { name: t.page.liveMap, href: '/' },
    { name: t.lines.title, href: '/lines' },
    { name: lineName(line) }
  ]}
  trains={running.length}
  {focus}
  {frame}
  closest={0.1}
  label={t.map.line(lineName(line))}
  recentre={t.lines.recentre}
  onMap="/?line={line.id}"
  {onpick}
>
  {#snippet heading()}
    <h1 style:--line={colourOf(line)} style:--ink={inkOf(line)}>{lineName(line)}</h1>
  {/snippet}

  {#snippet intro()}
    <p class="ends">{t.lines.between(list(ends(drawn)))}</p>
    <StatusText {status} />
    <Closures lines={[line.id]} />
    <dl class="glance">
      {#each glance as [label, value] (label)}
        <div>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      {/each}
    </dl>
  {/snippet}

  {#snippet main()}
    <section aria-labelledby="stations">
      <h2 id="stations">{t.stations.title}</h2>
      <p class="hint">{t.lines.hint}</p>
      <Diagram
        diagram={drawn}
        zones={data.zones}
        trains={running}
        now={live.now}
        {picked}
        onpicktrain={pickTrain}
      />
    </section>
  {/snippet}

  {#snippet aside()}
    <section aria-labelledby="trains">
      <h2 id="trains">{t.lines.trains}</h2>
      <LineTrains
        {line}
        trains={running}
        waiting={!live.snapshot}
        now={live.now}
        {picked}
        onpicktrain={pickTrain}
      />
    </section>
    <section aria-labelledby="others">
      <h2 id="others">{t.lines.others}</h2>
      <StatusList lines={others} status={statuses} brief />
    </section>
  {/snippet}
</MapPage>

<style>
  h1 {
    width: fit-content;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-small);
    background: var(--line);
    color: var(--ink);
    font: 30px/1.15 var(--font-display);
  }

  .ends {
    margin: 0;
    color: var(--text-muted);
    text-wrap: pretty;
  }

  .glance {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: var(--space-2);
    margin: var(--space-2) 0 0;

    div {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-small);
      background: var(--surface-sunk);
    }

    dt {
      color: var(--text-muted);
      font: 600 12px/1.3 var(--font-ui);
    }

    dd {
      margin: 0;
      font: 22px/1.2 var(--font-display);
      font-variant-numeric: tabular-nums;
    }
  }

  .hint {
    margin: calc(-1 * var(--space-2)) 0 var(--space-4);
    color: var(--text-muted);
    font-size: 14px;
  }

  @media (min-width: 960px) {
    .glance {
      max-width: 48rem;
    }
  }
</style>

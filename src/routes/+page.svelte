<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import About from '#lib/components/About.svelte';
  import Board from '#lib/components/Board.svelte';
  import Feed from '#lib/components/Feed.svelte';
  import Grip from '#lib/components/Grip.svelte';
  import Head from '#lib/components/Head.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import LineDetail from '#lib/components/LineDetail.svelte';
  import MapButtons from '#lib/components/MapButtons.svelte';
  import Search from '#lib/components/Search.svelte';
  import StationDetail from '#lib/components/StationDetail.svelte';
  import TrainDetail from '#lib/components/TrainDetail.svelte';
  import { count, t } from '#lib/i18n/i18n.svelte.js';
  import { isLineId, lineById, linesIn, type LineId, type ModeId } from '#lib/lines.js';
  import { connectLive, live } from '#lib/live.svelte.js';
  import TubeMap, { type Tap } from '#lib/map/TubeMap.svelte';
  import { description, name, source, website } from '#lib/meta.js';
  import { distance, project, stationById, stations, type Point } from '#lib/network.js';
  import { track } from '#lib/plausible.js';
  import Settings from '#lib/settings/Settings.svelte';
  import { load, looks, settings } from '#lib/settings/settings.svelte.js';

  type Selection =
    | { kind: 'line'; id: LineId }
    | { kind: 'station'; index: number }
    | { kind: 'train'; key: string }
    | { kind: 'about' }
    | null;

  const wide = new MediaQuery('min-width: 960px');
  const NEARBY_KM = 3;
  const TUBE = linesIn(['tube']);

  let selection = $state<Selection>(null);
  let follow = $state(false);
  let searching = $state(false);
  let configuring = $state(false);
  let zoom = $state(0);
  let finder: HTMLButtonElement;
  let you = $state<Point | null>(null);
  let locating = $state(false);
  let notice = $state('');
  let panelHeight = $state(0);
  let innerHeight = $state(800);
  let map: TubeMap;
  let routed = $state(false);
  let sheeted = false;

  const now = $derived(live.now);
  const shown = $derived(linesIn(settings.modes));
  const focus = $derived({
    shown,
    lines: selection?.kind === 'line' ? new Set([selection.id]) : null,
    station: selection?.kind === 'station' ? selection.index : null,
    train: selection?.kind === 'train' ? selection.key : null
  });
  // the sheet takes a moment to measure, so fly-tos assume it's open at full height
  const inset = $derived(
    wide.current
      ? { left: 380, bottom: 0 }
      : {
          left: 0,
          bottom: selection ? Math.max(panelHeight, Math.round(innerHeight * 0.58)) : panelHeight
        }
  );
  const running = $derived(live.running.filter((train) => shown.has(train.reading.line)));
  // the About sheet counts the Underground alone, whatever else is switched on
  const underground = $derived(live.running.filter((train) => TUBE.has(train.reading.line)).length);
  const counts = $derived.by(() => {
    const counts = new Map<LineId, number>();
    for (const train of running)
      counts.set(train.reading.line, (counts.get(train.reading.line) ?? 0) + 1);
    return counts;
  });
  const about = $derived(selection?.kind === 'about');
  const tracked = $derived.by(() => {
    void live.snapshot;
    return selection?.kind === 'train' ? live.fleet.trains.get(selection.key) : undefined;
  });

  function toggle(mode: ModeId) {
    const { modes } = settings;
    settings.modes = modes.includes(mode) ? modes.filter((m) => m !== mode) : [...modes, mode];
  }

  // a link to a line or station that's switched off switches it on
  function reveal(line: LineId) {
    const { mode } = lineById(line)!;
    if (!shown.has(line)) settings.modes = [...settings.modes, mode];
  }

  function pickLine(id: LineId) {
    reveal(id);
    selection = { kind: 'line', id };
    follow = searching = false;
    track('Pick', { line: id });
    map.flyTo(
      stations.filter((s) => s.lines.includes(id)),
      0.1
    );
  }

  function pickStation(index: number) {
    selection = { kind: 'station', index };
    follow = searching = false;
    track('Pick', { station: stations[index].name });
    map.flyTo([stations[index]], 0.09);
  }

  function pickTrain(key: string) {
    const train = live.fleet.trains.get(key);
    if (!train) return;
    selection = { kind: 'train', key };
    follow = true;
    searching = false;
  }

  function onpick(pick: Tap) {
    if (pick?.kind === 'train') pickTrain(pick.key);
    else if (pick?.kind === 'station') pickStation(pick.index);
    else close();
  }

  function close() {
    selection = null;
    follow = false;
  }

  function openFromAddress() {
    const params = new URLSearchParams(location.search);
    const line = params.get('line');
    const station = stationById.get(params.get('station') ?? '');
    if (line && isLineId(line)) pickLine(line);
    else if (station) {
      reveal(station.lines[0]);
      pickStation(station.index);
    }
  }

  function locate() {
    if (!navigator.geolocation) return (notice = t.notice.unsupported);
    locating = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        locating = false;
        const here = (you = project(coords.longitude, coords.latitude));
        const [nearest] = stations
          .filter((s) => s.lines.some((line) => shown.has(line)))
          .sort((a, b) => distance(here, a) - distance(here, b));
        if (!nearest) return (notice = t.notice.noLines);
        const km = distance(here, nearest) / 1000;
        if (km < NEARBY_KM) return pickStation(nearest.index);
        notice = t.notice.far(Math.round(km));
        map.flyTo([here, nearest], 0.06);
      },
      () => {
        locating = false;
        notice = t.notice.failed;
      },
      { maximumAge: 60_000, timeout: 10_000 }
    );
  }

  $effect(() => {
    if (!notice) return;
    const timer = setTimeout(() => (notice = ''), 4000);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const url = new URL(location.href);
    url.searchParams.delete('line');
    url.searchParams.delete('station');
    if (selection?.kind === 'line') url.searchParams.set('line', selection.id);
    if (selection?.kind === 'station')
      url.searchParams.set('station', stations[selection.index].id);
    if (!routed) return;
    // a sheet opened from the bare map gets one history entry, so back always closes it
    const { sheet } = untrack(() => page.state);
    if (selection && !sheet) goto(url, { shallow: true, state: { sheet: true } });
    else if (!selection && sheet) history.back();
    else if (url.href !== location.href)
      goto(url, { shallow: true, replace: true, state: { sheet } });
  });

  // back closes the sheet, and forward opens it again if the address says what was in it
  $effect(() => {
    const open = page.state.sheet === true;
    if (open === sheeted) return;
    sheeted = open;
    untrack(() => {
      if (!open) close();
      else if (!selection) openFromAddress();
    });
  });

  afterNavigate(() => (routed = true));

  connectLive();

  onMount(() => {
    load();
    openFromAddress();
  });
</script>

<svelte:window
  bind:innerHeight
  onkeydown={(event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea');
    if (event.key !== '/' || typing || searching || configuring || !settings.shortcuts) return;
    event.preventDefault();
    searching = true;
  }}
/>

<Head title="{name} | {t.title}" {description} data={[website]} />

<div class="app" class:open={selection !== null}>
  <TubeMap
    bind:this={map}
    bind:level={zoom}
    {live}
    {focus}
    {follow}
    {inset}
    style={settings.style}
    dark={looks.dark}
    calm={looks.calm}
    {you}
    label={count(t.map.label, running.length)}
    {onpick}
    onwander={() => (follow = false)}
  />

  <aside class="panel" bind:clientHeight={panelHeight}>
    <header class="masthead">
      <div class="brand">
        <h1>tubespotting</h1>
        <Feed trains={running.length} />
      </div>
      <div class="actions floating">
        <button
          type="button"
          aria-label={t.page.search}
          aria-expanded={searching}
          bind:this={finder}
          onclick={() => (searching = !searching)}
        >
          <Icon name="search" />
        </button>
        <button
          type="button"
          aria-label={t.page.settings}
          aria-haspopup="dialog"
          onclick={() => (configuring = true)}
        >
          <Icon name="settings" />
        </button>
        <button
          type="button"
          class="about"
          aria-label={t.page.aboutMap}
          aria-expanded={about}
          onclick={() => (about ? close() : (selection = { kind: 'about' }))}
        >
          <Icon name="info" />
        </button>
      </div>
      {#if searching}
        <div class="finder">
          <Search
            {shown}
            onpickstation={pickStation}
            onpickline={pickLine}
            onclose={() => {
              searching = false;
              finder.focus();
            }}
          />
        </div>
      {/if}
    </header>

    {#if selection}
      <section class="sheet" class:full={about} aria-label={t.page.details}>
        <Grip onclose={close} />
        {#if selection.kind !== 'about'}
          <button type="button" class="dismiss" aria-label={t.page.back} onclick={close}>
            <Icon name={wide.current ? 'back' : 'close'} />
            <span>{t.page.allLines}</span>
          </button>
        {/if}
        {#if selection.kind === 'line'}
          {@const id = selection.id}
          <LineDetail
            line={lineById(id)!}
            status={live.snapshot?.status.find((s) => s.id === id)}
            trains={running.filter((train) => train.reading.line === id)}
            waiting={!live.snapshot}
            {now}
            onpicktrain={pickTrain}
          />
        {:else if selection.kind === 'station'}
          <StationDetail
            station={stations[selection.index]}
            {shown}
            snapshot={live.snapshot}
            {now}
            trainOf={live.trainOf}
            onpicktrain={pickTrain}
          />
        {:else if selection.kind === 'train'}
          <TrainDetail
            train={tracked}
            at={live.snapshot?.at ?? now}
            {now}
            {follow}
            onfollow={(on) => (follow = on)}
            onpickstation={pickStation}
          />
        {:else}
          <About trains={live.snapshot ? underground : null} onclose={close} />
        {/if}
      </section>
    {:else}
      <Board
        status={live.snapshot?.status ?? []}
        {counts}
        waiting={!live.snapshot}
        {shown}
        modes={settings.modes}
        onpick={pickLine}
        ontoggle={toggle}
      />
      <footer class="links">
        <a class="link" href="/lines"><Icon name="branch" size={16} />{t.lines.title}</a>
        <a class="link" href="/stations"><Icon name="roundel" size={16} />{t.stations.title}</a>
        <button type="button" class="link" onclick={() => (selection = { kind: 'about' })}>
          <Icon name="info" size={16} />{t.about}
        </button>
        <a class="link" href={source} target="_blank" rel="noopener"
          ><Icon name="github" size={16} />GitHub</a
        >
      </footer>
    {/if}
  </aside>

  <div class="controls floating" style:--lift="{inset.bottom}px">
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    <MapButtons onzoom={(by) => map.zoomBy(by)} />
    <button type="button" aria-label={t.page.locate} onclick={locate}><Icon name="locate" /></button
    >
  </div>

  {#if configuring}
    <Settings
      {zoom}
      located={you !== null || locating}
      onzoom={(level) => map.zoomTo(level)}
      onlocate={(on) => (on ? locate() : (you = null))}
      onclose={() => (configuring = false)}
    />
  {/if}
</div>

<style>
  .app {
    position: fixed;
    inset: 0;
  }

  .masthead {
    position: fixed;
    top: max(var(--space-3), env(safe-area-inset-top));
    left: var(--space-3);
    right: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    pointer-events: none;

    > * {
      pointer-events: auto;
    }
  }

  /* shrinks to keep beside the buttons when a language runs long */
  .brand {
    flex: 1 1 0;
    min-width: min-content;
    max-width: max-content;
    display: grid;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  h1 {
    margin: 0;
    font: 20px/1.1 var(--font-display);
    color: var(--accent);
    letter-spacing: 0.01em;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    margin-left: auto;
  }

  .finder {
    flex-basis: 100%;
  }

  .panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .sheet {
    max-height: 58dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 var(--space-4) var(--space-5);
    border-radius: var(--radius) var(--radius) 0 0;
    background: var(--surface);
    box-shadow: var(--shadow);
    animation: rise 320ms var(--ease-out);
  }

  .dismiss {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 36px;
    margin: 0 0 var(--space-3) calc(-1 * var(--space-2));
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--text-muted);
    font-size: 13px;

    &:hover {
      background: var(--surface-sunk);
      color: var(--text);
    }
  }

  .controls {
    position: fixed;
    right: var(--space-3);
    bottom: calc(var(--lift) + var(--space-3) + env(safe-area-inset-bottom));
    display: grid;
    justify-items: end;
    gap: var(--space-2);
    transition: bottom 320ms var(--ease-out);
    pointer-events: none;

    > :global(*) {
      pointer-events: auto;
    }
  }

  .links {
    display: none;
  }

  .notice {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-small);
    background: var(--text);
    color: var(--paper);
    font-size: 13px;
  }

  /* fits the buttons beside the name at 320px */
  @media (max-width: 359px) {
    .brand {
      padding-inline: var(--space-2);
    }

    .actions {
      gap: var(--space-1);
    }
  }

  @media (max-width: 959px) {
    .app.open .controls {
      display: none;
    }

    /* the panel floats over the map, so a drag that misses the sheet or a line still moves it */
    .panel {
      pointer-events: none;
    }

    .sheet {
      pointer-events: auto;
    }

    /* About is all reading and no map, so it takes the whole screen */
    .sheet.full {
      position: fixed;
      inset: 0;
      z-index: 2;
      max-height: none;
      padding-bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
      border-radius: 0;

      :global(.grip) {
        padding-top: env(safe-area-inset-top);
      }
    }
  }

  @media (min-width: 960px) {
    .panel {
      top: 0;
      right: auto;
      width: var(--panel-width);
      display: flex;
      flex-direction: column;
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow-y: auto;
    }

    .masthead {
      position: sticky;
      top: 0;
      left: auto;
      right: auto;
      z-index: 1;
      padding: var(--space-4);
      background: var(--surface);
      border-bottom: 1px solid var(--rule);
    }

    .brand {
      padding: 0;
      box-shadow: none;
    }

    h1 {
      font-size: 24px;
    }

    .actions button {
      box-shadow: none;
      background: var(--surface-sunk);
    }

    /* the footer has it on desktop */
    .actions .about {
      display: none;
    }

    /* two by two, so the longer languages still fit the panel */
    .links {
      position: sticky;
      bottom: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
      margin-top: auto;
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--rule);
      background: var(--surface);
    }

    .link {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-height: 36px;
      padding: 0 var(--space-3);
      border: 0;
      border-radius: var(--radius-small);
      background: none;
      box-shadow: inset 0 0 0 1.5px var(--accent);
      color: var(--accent);
      font: 14px/1.1 var(--font-display);
      text-decoration: none;

      &:hover {
        background: var(--surface-sunk);
      }
    }

    .sheet {
      max-height: none;
      overflow: visible;
      border-radius: 0;
      box-shadow: none;
      animation: none;
      padding: var(--space-4);
    }
  }
</style>

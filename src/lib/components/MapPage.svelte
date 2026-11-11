<script lang="ts">
  import { onMount, untrack, type ComponentProps, type Snippet } from 'svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { connectLive, live } from '#lib/live.svelte.js';
  import TubeMap, { type Tap } from '#lib/map/TubeMap.svelte';
  import type { Point } from '#lib/network.js';
  import { load, looks, settings } from '#lib/settings/settings.svelte.js';
  import Feed from './Feed.svelte';
  import Icon from './Icon.svelte';
  import MapButtons from './MapButtons.svelte';
  import SiteHeader from './SiteHeader.svelte';

  interface Props {
    /** The way here from the live map, ending with this page, which has no link */
    trail: { name: string; href?: string }[];
    /** Trains running on the page's own lines */
    trains: number;
    focus: ComponentProps<typeof TubeMap>['focus'];
    /** Where the map frames, and goes back to with its recentre button */
    frame: Point[];
    /** How close the map gets in framing it */
    closest: number;
    /** The map, to anyone who can't see it */
    label: string;
    recentre: string;
    /** The same thing on the live map */
    onMap: string;
    onpick: (tap: Tap) => void;
    heading: Snippet;
    /** Under the heading, above the map on a phone */
    intro?: Snippet;
    /** The column under the map, and the one beside it once there's room */
    main: Snippet;
    aside: Snippet;
  }

  let {
    trail,
    trains,
    focus,
    frame,
    closest,
    label,
    recentre,
    onMap,
    onpick,
    heading,
    intro,
    main,
    aside
  }: Props = $props();

  let map: TubeMap;
  let zoom = $state(0);

  export const flyTo = (points: Point[]) => map.flyTo(points, closest);

  // another page of the same kind keeps this one and its map, which glides over to it
  let arrived = false;
  $effect(() => {
    void frame;
    untrack(() => {
      map.flyTo(frame, closest, !arrived);
      arrived = true;
    });
  });

  onMount(load);
  connectLive();
</script>

<div class="page scrolls">
  <SiteHeader {zoom} onzoom={(level) => map.zoomTo(level)}><Feed {trains} /></SiteHeader>

  <main id="main">
    <div class="intro">
      <nav aria-label={t.page.trail}>
        <ol class="trail">
          {#each trail as { name, href } (name)}
            <li aria-current={href ? undefined : 'page'}>
              {#if href}<a {href}>{name}</a>{:else}{name}{/if}
            </li>
          {/each}
        </ol>
      </nav>
      {@render heading()}
      {@render intro?.()}
    </div>

    <div class="view">
      <TubeMap
        bind:this={map}
        bind:level={zoom}
        {live}
        {focus}
        follow={false}
        inset={{ left: 0, bottom: 0 }}
        style={settings.style}
        dark={looks.dark}
        calm={looks.calm}
        you={null}
        inPage
        {label}
        {onpick}
        onwander={() => {}}
      />
      <div class="controls floating">
        <MapButtons onzoom={(by) => map.zoomBy(by)} />
        <button type="button" aria-label={recentre} onclick={() => map.flyTo(frame, closest)}>
          <Icon name="centre" />
        </button>
      </div>
    </div>

    <div class="sections">
      <div class="column">{@render main()}</div>
      <div class="column">
        {@render aside()}
        <a class="open" href={onMap}><Icon name="map" />{t.page.openOnMap}</a>
      </div>
    </div>
  </main>
</div>

<style>
  .page {
    min-height: 100dvh;
    background: var(--surface);
  }

  .intro {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-4);
  }

  .trail {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--text-muted);
    font-size: 13px;

    li + li::before {
      content: '›';
      content: '›' / '';
      padding: 0 var(--space-2);
    }
  }

  .view {
    position: relative;
    height: clamp(240px, 42svh, 420px);
    border-block: 1px solid var(--rule);
  }

  .controls {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    display: grid;
    gap: var(--space-2);
  }

  .sections,
  .column {
    display: grid;
    gap: var(--space-6);
  }

  .column {
    align-content: start;
    min-width: 0;
  }

  .sections {
    padding: var(--space-4) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom));

    /* a default each section's own heading can still override */
    :global(:where(h2)) {
      margin: 0 0 var(--space-3);
      font: 20px/1.2 var(--font-display);
      color: var(--station-ink);
    }
  }

  .open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--tap);
    border-radius: var(--radius-small);
    box-shadow: inset 0 0 0 1.5px var(--accent);
    font: 15px/1.1 var(--font-display);
    text-decoration: none;

    &:hover {
      background: var(--surface-sunk);
    }
  }

  /* the map runs across the top third, with the main column down the left under it */
  @media (min-width: 960px) {
    main {
      display: flex;
      flex-direction: column;
    }

    .view {
      order: -1;
      height: max(280px, 100svh / 3);
      border-top: 0;
    }

    .intro,
    .sections {
      width: 100%;
      max-width: 1440px;
      margin-inline: auto;
      padding-inline: var(--space-6);
    }

    .intro {
      padding-top: var(--space-5);
    }

    .sections {
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      align-items: start;
      column-gap: var(--space-6);
    }
  }
</style>

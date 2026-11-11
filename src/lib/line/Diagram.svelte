<script lang="ts">
  import LineChips from '#lib/components/LineChips.svelte';
  import type { Tracked } from '#lib/fleet.js';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, inkOf, lineById } from '#lib/lines.js';
  import { placeOf, stations } from '#lib/network.js';
  import { minutes, nextCall, whereIs } from '#lib/status.js';
  import { markers, stopsOf, type Branch, type Diagram, type Stop } from './diagram.js';

  interface Props {
    diagram: Diagram;
    /** Each station's fare zone, by its page's slug */
    zones: Record<string, string>;
    trains: Tracked[];
    now: number;
    picked: string | null;
    onpicktrain: (key: string) => void;
  }

  let { diagram, zones, trains, now, picked, onpicktrain }: Props = $props();

  // where the line runs across a strand, how far down a stop its mark is, and so on, in pixels
  const RAIL = 22;
  const DOT = 22;
  const GUTTER = 52;
  const INDENT = 36;
  // each train runs on the left the way it faces, either side of the line
  const SIDE = 10;

  const line = $derived(lineById(diagram.line)!);
  const branches = $derived([...stopsOf(diagram.spine)].flatMap((stop) => stop.branches));
  const beside = $derived(new Set(branches.flatMap((branch) => branch.beside)));
  const into = $derived(new Set(branches.map((branch) => branch.into)));

  interface Box {
    /** The stop's mark */
    x: number;
    y: number;
    /** How far it is on down to the next stop */
    height: number;
    /** And back up round the bend before it, where it's the first stop down a branch */
    reach: number;
  }

  // only looked at when measuring, so it needn't be reactive
  const rows = new Map<Stop, HTMLLIElement>();
  let boxes = $state.raw(new Map<Stop, Box>());
  let width = $state(0);

  const row = (stop: Stop) => (li: HTMLLIElement) => {
    rows.set(stop, li);
    return () => rows.delete(stop);
  };

  // the stops only move when the diagram does, for another line, language or screen size
  const measured = (root: HTMLDivElement) => {
    void diagram;
    function measure() {
      const origin = root.getBoundingClientRect();
      width = origin.width;
      boxes = new Map(
        [...rows].map(([stop, li]) => {
          const { left, top, height } = li.getBoundingClientRect();
          const y = top - origin.top + DOT;
          const bend = li.matches('.first') && li.closest('.branch')?.getBoundingClientRect();
          const reach = bend ? y - (bend.top - origin.top) : DOT;
          return [stop, { x: left - origin.left + RAIL, y, height, reach }];
        })
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  };

  // all in one place rather than in their stops' rows, so each glides on past a stop and keeps focus
  const placed = $derived(
    markers(diagram, trains, now / 1000).flatMap(({ train, stop, f, down, beside }) => {
      const box = boxes.get(stop);
      if (!box) return [];
      const x = box.x + beside * INDENT;
      const y = box.y + f * (f < 0 ? box.reach : box.height);
      return [{ train, down, x: x + (down ? SIDE : -SIDE), y, text: x - RAIL + GUTTER }];
    })
  );
  const callout = $derived(placed.find(({ train }) => train.key === picked));

  const towards = (train: Tracked) =>
    train.reading.to ? t.line.to(train.reading.to) : t.checkFront;
</script>

{#snippet strand(branch: Branch, spine = false)}
  {#each branch.stops as stop, i (i)}
    {@const place = placeOf(stop.station.index)}
    {@const others = place.lines.filter((id) => id !== line.id)}
    {@const last = i === branch.stops.length - 1 && !stop.branches.length}
    <li
      {@attach row(stop)}
      class:interchange={others.length}
      class:first={i === 0}
      class:last={last && !branch.into}
      class:end={(last && !branch.rejoins) || (spine && i === 0)}
      class:beside={beside.has(stop) || into.has(stop)}
    >
      {#if beside.has(stop)}<span class="loop" aria-hidden="true"></span>{/if}
      {#if into.has(stop)}<span class="bend" aria-hidden="true"></span>{/if}
      <a href="/stations/{place.slug}">{stop.station.name}</a>
      {#if zones[place.slug]}<span class="zone">{t.facts.zone} {zones[place.slug]}</span>{/if}
      {#if others.length}<LineChips lines={others} />{/if}
      {#each stop.branches as sub (sub.stops[0].station.index)}
        {@const id = `branch-${sub.stops[0].station.index}`}
        <div class="branch">
          <p class="caption" {id}>
            {sub.rejoins
              ? t.lines.loop(sub.stops[0].station.name, sub.rejoins.name)
              : t.lines.branch(sub.stops.at(-1)!.station.name)}
          </p>
          <ol aria-labelledby={id}>{@render strand(sub)}</ol>
        </div>
      {/each}
    </li>
  {/each}
{/snippet}

<!-- its own layer, so its trains pass under the page's header -->
<div
  class="diagram"
  {@attach measured}
  style:--line={colourOf(line)}
  style:--ink={inkOf(line)}
  style:--rail="{RAIL}px"
  style:--dot="{DOT}px"
  style:--gutter="{GUTTER}px"
  style:--indent="{INDENT}px"
>
  <ol>{@render strand(diagram.spine, true)}</ol>
  <div class="trains" role="group" aria-label={t.lines.now}>
    {#each placed as { train, down, x, y } (train.key)}
      <button
        type="button"
        class="train"
        class:up={!down}
        style:translate="{x}px {y}px"
        aria-label={t.lines.train(towards(train), whereIs(train, now))}
        aria-pressed={picked === train.key}
        onclick={() => onpicktrain(train.key)}
      ></button>
    {/each}
    {#if callout}
      {@const next = nextCall(callout.train, now)}
      <span
        class="callout"
        style:translate="{callout.text}px {callout.y}px"
        style:max-width="{width - callout.text}px"
        aria-hidden="true"
      >
        {towards(callout.train)} · {stations[next.station].name}
        {minutes(next.seconds)}
      </span>
    {/if}
  </div>
</div>

<style>
  .diagram {
    --cap: 30px;
    position: relative;
    isolation: isolate;
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    --pad: var(--gutter);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--space-3);
    padding-left: var(--pad);

    /* the line, on down to the next stop */
    &::before {
      content: '';
      position: absolute;
      left: calc(var(--rail) - 2px);
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--line);
    }

    /* a tick for a stop, as on TfL's own maps */
    &::after {
      content: '';
      position: absolute;
      left: calc(var(--rail) + 2px);
      top: calc(var(--dot) - 2px);
      width: 9px;
      height: 4px;
      background: var(--line);
    }

    &.first::before {
      top: var(--dot);
    }

    &.last::before {
      bottom: calc(100% - var(--dot));
    }

    /* the line stops dead at either end */
    &.end::after {
      left: calc(var(--rail) - 9px);
      width: 18px;
    }

    /* and a ring where it meets another */
    &.interchange::after {
      left: calc(var(--rail) - 8px);
      top: calc(var(--dot) - 8px);
      width: 16px;
      height: 16px;
      border: 3px solid var(--ring);
      border-radius: 50%;
      background: var(--ring-fill);
    }

    /* clear of a loop running down beside it */
    &.beside {
      --pad: calc(var(--gutter) + var(--indent));
    }
  }

  /* a loop on down beside the line, and its bend back into it */
  .loop,
  .bend {
    position: absolute;
    top: 0;
    left: calc(var(--rail) - 2px);
    width: calc(var(--indent) + 4px);
    border: 0 solid var(--line);
    border-right-width: 4px;
  }

  .loop {
    bottom: 0;
  }

  .bend {
    height: calc(var(--dot) + 2px);
    border-bottom-width: 4px;
    border-bottom-right-radius: 16px;
  }

  a {
    display: flex;
    align-items: center;
    min-height: var(--tap);
    font: 16px/1.2 var(--font-display);
    color: var(--station-ink);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  .zone {
    display: flex;
    align-items: center;
    min-height: var(--tap);
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
  }

  li > :global(.lines) {
    grid-column: 1 / -1;
    margin: calc(-1 * var(--space-2)) 0 var(--space-2);
    font-size: 12px;
  }

  .branch {
    grid-column: 1 / -1;
    margin-left: calc(var(--indent) - var(--pad));
  }

  .caption {
    position: relative;
    display: flex;
    align-items: center;
    min-height: var(--cap);
    margin: 0;
    padding: var(--space-1) 0 var(--space-1) var(--gutter);
    color: var(--text-muted);
    font: 600 12px/1.3 var(--font-ui);

    /* bending off the line above, down to the branch's first stop */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: calc(-1 * var(--dot));
      left: calc(var(--rail) - 2px - var(--indent));
      width: calc(var(--indent) + 4px);
      border: 4px solid var(--line);
      border-bottom: 0;
      border-left: 0;
      border-top-right-radius: 16px;
    }
  }

  .trains {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* a carriage, its middle on its spot */
  .train {
    position: absolute;
    top: -14px;
    left: -12px;
    width: 24px;
    height: 28px;
    padding: 0;
    border: 0;
    background: none;
    pointer-events: auto;
    transition: translate 1s linear;

    &::before {
      content: '';
      position: absolute;
      inset: 4px 6px;
      border: 1.5px solid var(--ring);
      border-radius: 4px;
      background: var(--line);
    }

    /* a chevron at the front, pointing the way it's going */
    &::after {
      content: '';
      position: absolute;
      left: 9px;
      top: 10px;
      width: 6px;
      height: 6px;
      border: solid var(--ink);
      border-width: 0 2px 2px 0;
      rotate: 45deg;
    }

    &.up::after {
      top: 13px;
      rotate: 225deg;
    }

    &[aria-pressed='true']::before {
      outline: 2px solid var(--ring);
      outline-offset: 2px;
    }
  }

  /* level with its train, over the names, never wider than the diagram */
  .callout {
    position: absolute;
    top: 0;
    left: 0;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-small);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text);
    font: 13px/1.3 var(--font-ui);
    font-variant-numeric: tabular-nums;
    transform: translateY(-50%);
    transition: translate 1s linear;
  }
</style>

<script lang="ts">
  import type { Tracked } from '#lib/fleet.js';
  import { count, t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, type Line } from '#lib/lines.js';
  import { callsApart, stations } from '#lib/network.js';
  import { minutes, nextCall, whereIs } from '#lib/status.js';

  interface Props {
    line: Line;
    trains: Tracked[];
    waiting: boolean;
    now: number;
    /** The train picked out, on a page where the rows pick one rather than open it */
    picked?: string | null;
    onpicktrain: (key: string) => void;
  }

  let { line, trains, waiting, now, picked, onpicktrain }: Props = $props();

  // one strip per destination, furthest from it first, so it reads in the direction of travel
  const directions = $derived.by(() => {
    const byDestination = new Map<string, Tracked[]>();
    for (const train of trains) {
      const to = train.reading.to || t.checkFront;
      byDestination.set(to, [...(byDestination.get(to) ?? []), train]);
    }
    const left = (train: Tracked) => {
      const { dest, stops } = train.reading;
      return dest === null ? 0 : callsApart(line.id, stops[0][0], dest);
    };
    return [...byDestination]
      .map(([to, group]) => ({ to, trains: group.sort((a, b) => left(b) - left(a)) }))
      .sort((a, b) => b.trains.length - a.trains.length || a.to.localeCompare(b.to));
  });
</script>

<div style:--line={colourOf(line)}>
  <p class="total">{waiting ? t.waiting : count(t.line.running, trains.length)}</p>
  {#each directions as direction (direction.to)}
    <section aria-label={t.line.trainsTo(direction.to)}>
      <h3>
        {t.line.to(direction.to)} <span>· {count(t.trains, direction.trains.length)}</span>
      </h3>
      <ol class="strip">
        {#each direction.trains as train (train.key)}
          {@const next = nextCall(train, now)}
          <li>
            <button
              type="button"
              aria-pressed={picked === undefined ? undefined : train.key === picked}
              onclick={() => onpicktrain(train.key)}
            >
              <span class="where">{whereIs(train, now)}</span>
              <span class="next">
                {stations[next.station].name} · {minutes(next.seconds)}
              </span>
            </button>
          </li>
        {/each}
      </ol>
    </section>
  {/each}
</div>

<style>
  .total {
    margin: var(--space-4) 0 0;
    color: var(--text-muted);
    font: 600 14px/1.3 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }

  h3 {
    margin: var(--space-5) 0 var(--space-2);
    font: 18px/1.2 var(--font-display);
    color: var(--station-ink);

    span {
      color: var(--text-muted);
      font: 600 13px var(--font-ui);
      font-variant-numeric: tabular-nums;
    }
  }

  .strip {
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      position: relative;
      padding-left: var(--space-5);

      &::before {
        content: '';
        position: absolute;
        left: 7px;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--line);
      }

      &::after {
        content: '';
        position: absolute;
        left: 4px;
        top: 50%;
        width: 10px;
        height: 16px;
        translate: 0 -50%;
        border: 1.5px solid var(--ring);
        border-radius: 5px;
        background: var(--line);
      }
    }

    button {
      display: grid;
      width: 100%;
      min-height: var(--tap);
      padding: var(--space-1) var(--space-2);
      border: 0;
      border-radius: var(--radius-small);
      background: none;
      text-align: left;

      &:hover,
      &[aria-pressed='true'] {
        background: var(--surface-sunk);
      }

      &[aria-pressed='true'] .where {
        text-decoration: underline;
        text-decoration-thickness: 2px;
      }
    }

    .where {
      font: 15px/1.25 var(--font-display);
      color: var(--station-ink);
    }

    .next {
      color: var(--text-muted);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
  }
</style>

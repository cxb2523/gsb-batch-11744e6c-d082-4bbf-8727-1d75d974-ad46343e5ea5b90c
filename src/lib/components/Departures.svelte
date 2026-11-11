<script lang="ts">
  import { arrivals, departures, type Departure } from '#lib/departures.js';
  import type { Tracked } from '#lib/fleet.js';
  import { clock, t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, type LineId } from '#lib/lines.js';
  import type { Place } from '#lib/network.js';
  import { minutes, whereIs } from '#lib/status.js';
  import type { Snapshot, TrainReading } from '#lib/types.js';

  interface Props {
    place: Place;
    lines: Set<LineId>;
    snapshot: Snapshot | null;
    now: number;
    trainOf: (reading: TrainReading) => Tracked | undefined;
    /** Every train due rather than the first few, with where each is now */
    full?: boolean;
    /** The train picked out, on a page where the rows pick one rather than open it */
    picked?: string | null;
    onpicktrain: (key: string) => void;
  }

  let { place, lines, snapshot, now, trainOf, full = false, picked, onpicktrain }: Props = $props();

  const FEW = 4;
  const time = $derived(clock(now));
  const here = $derived(new Set(place.members.map((s) => s.index)));
  const boards = $derived(snapshot ? departures(snapshot, here, lines, now) : []);
  const finishing = $derived(snapshot ? arrivals(snapshot, here, lines, now) : []);
</script>

{#snippet countdown(rows: Departure[], terminating = false)}
  <ol class="countdown">
    {#each full ? rows : rows.slice(0, FEW) as { train: reading, due }, i (reading)}
      {@const train = trainOf(reading)}
      {@const where = full && train ? whereIs(train, now) : ''}
      <li>
        <button
          type="button"
          disabled={!train}
          aria-pressed={picked === undefined ? undefined : train?.key === picked}
          onclick={() => train && onpicktrain(train.key)}
        >
          <span class="order">{i + 1}</span>
          <span class="to">
            {terminating ? where || t.station.terminatingHere : reading.to || t.checkFront}
          </span>
          <span class="due">{minutes(due)}</span>
          {#if where && !terminating}<span class="where">{where}</span>{/if}
        </button>
      </li>
    {/each}
    <li class="clock" aria-hidden="true">{time}</li>
  </ol>
{/snippet}

{#if !snapshot}
  <p class="quiet">{t.waiting}</p>
{:else if !boards.length}
  <p class="quiet">
    {#if finishing.length}
      {t.station.terminating}
      {finishing[0].due < 30
        ? t.station.arrivingNow
        : t.station.arrivingIn(minutes(finishing[0].due))}
    {:else}
      {t.station.none}
    {/if}
  </p>
{/if}

{#if boards.length || (full && finishing.length)}
  <div class="boards">
    {#each boards as board (`${board.line.id}${board.platform}`)}
      {@const platform = board.platform || t.station.platform}
      <section class="platform" aria-label={t.station.platformOf(board.line.name, platform)}>
        <h3>
          <span class="swatch" style:--line={colourOf(board.line)}></span>
          {board.line.name} · {platform}
        </h3>
        {@render countdown(board.rows)}
      </section>
    {/each}
    {#if full && finishing.length}
      <section class="platform" aria-label={t.station.terminatingHere}>
        <h3>{t.station.terminatingHere}</h3>
        {@render countdown(finishing, true)}
      </section>
    {/if}
  </div>
{/if}

<style>
  .quiet {
    color: var(--text-muted);
  }

  .boards {
    display: grid;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }

  .platform {
    display: grid;
    gap: var(--space-2);
  }

  h3 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: 600 13px/1.2 var(--font-ui);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);

    .swatch {
      width: 14px;
      height: 4px;
      background: var(--line);
    }
  }

  .countdown .clock {
    padding-top: var(--space-1);
    color: var(--board-ink);
    font: 700 17px/1.2 var(--font-board);
    text-align: center;
    text-shadow: 0 0 6px rgb(255 176 0 / 0.45);
    font-variant-numeric: tabular-nums;
  }

  .countdown {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    list-style: none;
    background: var(--board);
    border-radius: var(--radius-small);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);

    button {
      display: grid;
      grid-template-columns: 1.4ch 1fr auto;
      gap: 0 1.2ch;
      width: 100%;
      min-height: 32px;
      padding: 2px 0;
      border: 0;
      border-radius: 2px;
      background: none;
      color: var(--board-ink);
      font: 700 17px/1.2 var(--font-board);
      letter-spacing: 0;
      text-align: left;
      text-shadow: 0 0 6px rgb(255 176 0 / 0.45);

      &:disabled {
        cursor: default;
      }

      &:not(:disabled):hover .to {
        text-decoration: underline;
        text-underline-offset: 4px;
      }

      &[aria-pressed='true'] {
        background: rgb(255 176 0 / 0.14);
        box-shadow: 0 0 0 4px rgb(255 176 0 / 0.14);
      }
    }

    .order {
      color: var(--board-dim);
    }

    .to {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .due {
      font-variant-numeric: tabular-nums;
    }

    .where {
      grid-column: 2 / -1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: color-mix(in srgb, var(--board-ink) 72%, var(--board));
      font-size: 14px;
      text-shadow: none;
    }
  }
</style>

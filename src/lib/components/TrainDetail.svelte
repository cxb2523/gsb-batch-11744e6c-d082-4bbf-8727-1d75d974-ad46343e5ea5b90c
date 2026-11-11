<script lang="ts">
  import type { Tracked } from '#lib/fleet.js';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, inkOf, lineById } from '#lib/lines.js';
  import { stations } from '#lib/network.js';
  import { minutes, whereIs } from '#lib/status.js';
  import Icon from './Icon.svelte';

  interface Props {
    train: Tracked | undefined;
    at: number;
    now: number;
    follow: boolean;
    onfollow: (on: boolean) => void;
    onpickstation: (index: number) => void;
  }

  let { train, at, now, follow, onfollow, onpickstation }: Props = $props();

  const line = $derived(train && lineById(train.reading.line));
  const upcoming = $derived(
    train?.reading.stops
      .map(([station, eta]) => ({
        station: stations[station],
        due: (at + eta * 1000 - now) / 1000
      }))
      .filter((stop) => stop.due > -20) ?? []
  );
</script>

{#if !train || !line || train.gone}
  <h2>{t.train.gone}</h2>
  <p class="quiet">{t.train.goneWhy}</p>
{:else}
  <div class="train" style:--line={colourOf(line)} style:--ink={inkOf(line)}>
    <header>
      <h2>
        <span class="line">{line.name}</span>
        {train.reading.to ? t.train.to(train.reading.to) : t.train.unknown}
      </h2>
      <p class="where">{whereIs(train, now)}</p>
    </header>

    <button type="button" class="follow" aria-pressed={follow} onclick={() => onfollow(!follow)}>
      <Icon name="follow" size={18} />
      {follow ? t.train.following : t.train.follow}
    </button>

    <ol class="stops" aria-label={t.train.stops}>
      {#each upcoming as stop (stop.station.index)}
        <li>
          <button type="button" onclick={() => onpickstation(stop.station.index)}>
            <span class="name">{stop.station.name}</span>
            <span class="due">{minutes(stop.due)}</span>
          </button>
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  header {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
  }

  .line {
    padding: 0 var(--space-2);
    background: var(--line);
    color: var(--ink);
    box-decoration-break: clone;
  }

  h2 {
    margin: 0;
    font: 24px/1.15 var(--font-display);
    color: var(--station-ink);
  }

  .where,
  .quiet {
    margin: 0;
    color: var(--text-muted);
  }

  .follow {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap);
    margin-top: var(--space-4);
    padding: 0 var(--space-4);
    border: 2px solid var(--accent);
    border-radius: 999px;
    background: none;
    color: var(--accent);
    font: 16px/1 var(--font-display);

    &[aria-pressed='true'] {
      background: var(--accent);
      color: var(--accent-ink);
    }
  }

  .stops {
    margin: var(--space-4) 0 0;
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
        left: 2px;
        top: 50%;
        width: 14px;
        height: 4px;
        translate: 0 -50%;
        background: var(--line);
      }
    }

    button {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
      width: 100%;
      min-height: 40px;
      padding: 0 var(--space-2);
      border: 0;
      border-radius: var(--radius-small);
      background: none;
      text-align: left;

      &:hover {
        background: var(--surface-sunk);
      }
    }

    .name {
      font: 16px/1.2 var(--font-display);
      color: var(--station-ink);
    }

    .due {
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
  }
</style>

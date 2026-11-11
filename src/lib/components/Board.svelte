<script lang="ts">
  import { count, list, t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, inkOf, LINES, MODES, type LineId, type ModeId } from '#lib/lines.js';
  import { tone } from '#lib/status.js';
  import type { LineStatus } from '#lib/types.js';
  import Icon from './Icon.svelte';
  import Roundel from './Roundel.svelte';

  interface Props {
    status: LineStatus[];
    counts: Map<LineId, number>;
    waiting: boolean;
    shown: Set<LineId>;
    modes: ModeId[];
    onpick: (line: LineId) => void;
    ontoggle: (mode: ModeId) => void;
  }

  let { status, counts, waiting, shown, modes, onpick, ontoggle }: Props = $props();

  let open = $state(false);

  const byLine = $derived(new Map(status.map((s) => [s.id, s])));
  const showing = $derived(MODES.filter((mode) => modes.includes(mode.id)));
  const summary = $derived(
    showing.length === 0
      ? t.board.none
      : showing.length === 1
        ? t.board.only(showing[0].name)
        : showing.length === MODES.length
          ? t.board.every
          : list(showing.map((mode) => mode.name))
  );
</script>

<nav class="board" aria-label={t.board.lines}>
  <h2 class="visually-hidden">{t.board.lines}</h2>
  <ul>
    {#each LINES.filter((line) => shown.has(line.id)) as line (line.id)}
      {@const state = byLine.get(line.id)}
      <li>
        <button
          type="button"
          class="line"
          style:--line={colourOf(line)}
          style:--ink={inkOf(line)}
          onclick={() => onpick(line.id)}
        >
          <span class="name">{line.name}</span>
          <span class="state" data-tone={state && tone(state.severity)} lang={state && 'en'}>
            <span class="dot" aria-hidden="true"></span>
            {state?.status ?? t.board.checking}
          </span>
          <span class="count">{waiting ? '' : count(t.trains, counts.get(line.id) ?? 0)}</span>
        </button>
      </li>
    {/each}
  </ul>
  <div class="modes" class:open>
    <button
      type="button"
      class="toggle"
      aria-expanded={open}
      aria-controls="line-filters"
      onclick={() => (open = !open)}
    >
      <span class="label">{t.board.onMap}</span>
      <span class="roundels" aria-hidden="true">
        {#each MODES as mode (mode.id)}
          <Roundel colour={mode.roundel} on={modes.includes(mode.id)} />
        {/each}
      </span>
      <span class="summary">{summary}</span>
      <span class="chevron"><Icon name="down" size={16} /></span>
    </button>
    <div class="drawer">
      <ul id="line-filters">
        {#each MODES as mode (mode.id)}
          {@const on = modes.includes(mode.id)}
          <li>
            <button type="button" class="mode" aria-pressed={on} onclick={() => ontoggle(mode.id)}>
              <Icon name={on ? 'check' : 'plus'} size={16} />
              {mode.name}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</nav>

<style>
  .board {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;

    > * {
      flex: none;
    }
  }

  ul {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .line {
    display: grid;
    grid-template-columns: auto;
    align-items: center;
    min-height: var(--tap);
    padding: 0;
    border: 0;
    border-radius: var(--radius-small);
    background: var(--surface);
    box-shadow: var(--shadow);
    scroll-snap-align: start;
    overflow: hidden;
    text-align: left;

    .name {
      display: flex;
      align-items: center;
      height: 100%;
      padding: var(--space-2) var(--space-3);
      background: var(--line);
      color: var(--ink);
      font: 15px/1.1 var(--font-display);
      white-space: nowrap;
    }

    .count {
      display: none;
    }

    &:hover .name {
      filter: brightness(1.08);
    }
  }

  .mode {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap);
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-small);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text-muted);
    font: 15px/1.1 var(--font-display);
    white-space: nowrap;
    scroll-snap-align: start;

    &[aria-pressed='true'] {
      color: var(--accent);
    }

    &:hover {
      background: var(--surface-sunk);
      color: var(--text);
    }
  }

  /* phones scroll past every switch, so there's nothing to fold */
  .toggle {
    display: none;
  }

  .state {
    align-items: center;
    font-family: var(--font-display);
    gap: var(--space-2);
    color: var(--text-muted);

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--tone, var(--text-muted));
    }

    &[data-tone='bad'] {
      color: var(--bad);
    }
  }

  @media (max-width: 959px) {
    /* iOS only scrolls a strip that takes touches, so it ends where the chips do */
    .board {
      max-width: max-content;
      pointer-events: auto;
    }

    .line .state {
      display: flex;
      padding: 2px var(--space-3) 4px;
      font-size: 12px;
      white-space: nowrap;
    }
  }

  @media (min-width: 960px) {
    .board {
      display: block;
      padding: 0;
      overflow: visible;
    }

    ul {
      flex-direction: column;
      gap: 2px;
    }

    .line {
      grid-template-columns: 10rem 1fr auto;
      width: 100%;
      border-radius: 0;
      box-shadow: none;
      background: var(--surface);

      .state,
      .count {
        display: flex;
        padding-inline: var(--space-3);
      }

      .name {
        font-size: 14px;
      }

      .state {
        padding-block: 0;
        font-size: 14px;
        white-space: nowrap;
      }

      .count {
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
        font-size: 13px;
      }

      &:hover {
        background: var(--surface-sunk);
      }
    }

    .modes {
      margin-top: var(--space-3);
      border-top: 1px solid var(--rule);
    }

    .toggle {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      column-gap: var(--space-2);
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 0;
      background: none;
      text-align: left;

      .label {
        grid-column: 1;
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 600;
      }

      .summary {
        grid-column: 1 / 3;
        font: 15px/1.3 var(--font-display);
      }

      .roundels {
        display: flex;
        gap: 3px;
      }

      .chevron {
        grid-area: 1 / 3 / 3;
        display: grid;
        color: var(--text-muted);
        transition: rotate 320ms var(--ease-out);
      }

      &:hover {
        background: var(--surface-sunk);
      }
    }

    .open .chevron {
      rotate: 180deg;
    }

    /* 0fr to 1fr slides it open to whatever height the switches need */
    .drawer {
      display: grid;
      grid-template-rows: 0fr;
      visibility: hidden;
      transition:
        grid-template-rows 320ms var(--ease-out),
        visibility 320ms;

      ul {
        min-height: 0;
        overflow: hidden;
      }
    }

    .open .drawer {
      grid-template-rows: 1fr;
      visibility: visible;
    }

    .mode {
      width: 100%;
      min-height: 36px;
      box-shadow: none;
      font-size: 14px;
    }
  }
</style>

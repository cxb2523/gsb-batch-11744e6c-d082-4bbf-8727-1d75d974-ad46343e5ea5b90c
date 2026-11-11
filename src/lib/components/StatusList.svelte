<script lang="ts">
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, inkOf, lineById, type LineId } from '#lib/lines.js';
  import { tone } from '#lib/status.js';
  import type { LineStatus } from '#lib/types.js';

  interface Props {
    lines: LineId[];
    status: LineStatus[];
    /** Packed in side by side, without TfL's reasons */
    brief?: boolean;
  }

  let { lines, status, brief = false }: Props = $props();
</script>

<ul class:brief>
  {#each lines as id (id)}
    {@const line = lineById(id)!}
    {@const state = status.find((s) => s.id === id)}
    <li>
      <a href="/lines/{id}" style:--line={colourOf(line)} style:--ink={inkOf(line)}>
        <span class="name">{line.name}</span>
        <span class="state" data-tone={state && tone(state.severity)} lang={state && 'en'}>
          {state?.status ?? t.board.checking}
        </span>
      </a>
      {#if !brief && state?.reason}<p class="reason" lang="en">{state.reason}</p>{/if}
    </li>
  {/each}
</ul>

<style>
  /* the names all one width, so how each is running lines up down the list */
  ul {
    display: grid;
    grid-template-columns: minmax(8rem, max-content) 1fr;
    gap: var(--space-2) 0;
    margin: 0;
    padding: 0;
    list-style: none;

    &.brief {
      grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
      gap: var(--space-2);
    }
  }

  li,
  a {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }

  .brief li {
    grid-column: auto;
    grid-template-columns: 1fr;
  }

  a {
    align-items: center;
    min-height: var(--tap);
    border-radius: var(--radius-small);
    background: var(--surface-sunk);
    overflow: hidden;
    color: var(--text);
    text-decoration: none;

    &:hover .state {
      text-decoration: underline;
    }
  }

  .brief a {
    grid-column: auto;
    grid-template-columns: 8rem 1fr;
  }

  .name {
    align-self: stretch;
    display: flex;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--line);
    color: var(--ink);
    font: 15px/1.1 var(--font-display);
  }

  .state {
    padding: var(--space-2) var(--space-3);
    font: 15px/1.2 var(--font-display);
    color: var(--tone, var(--text));
  }

  .reason {
    grid-column: 1 / -1;
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: 14px;
  }
</style>

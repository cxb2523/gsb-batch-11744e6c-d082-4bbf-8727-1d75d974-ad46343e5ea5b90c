<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, lineById, type LineId } from '#lib/lines.js';
  import type { Closure } from '#lib/types.js';

  interface Props {
    lines: LineId[];
    /** A station's own stops, to leave out closures elsewhere on its lines */
    stops?: string[];
  }

  let { lines, stops }: Props = $props();

  let planned = $state<Closure[]>([]);

  // one that names no stops shuts the whole line
  const closures = $derived(
    planned.filter(
      (closure) =>
        lines.includes(closure.line) &&
        (!stops || !closure.stops.length || closure.stops.some((stop) => stops.includes(stop)))
    )
  );

  onMount(() => {
    fetch('/api/closures')
      .then((res) => (res.ok ? res.json() : []))
      .then((got) => (planned = got))
      .catch(() => {});
  });
</script>

{#if closures.length}
  <section class="closures" aria-labelledby="closures">
    <h2 id="closures">{t.closures}</h2>
    <!-- TfL writes them, so they're in English whatever the page is in -->
    <ul lang="en">
      {#each closures as { line: id, text } (id + text)}
        {@const line = lineById(id)!}
        <li>
          {#if lines.length > 1}<strong style:--line={colourOf(line)}>{line.name}</strong>{/if}
          {text}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .closures {
    max-width: 48rem;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-small);

    /* over the page's own heading style */
    h2 {
      margin: 0 0 var(--space-2);
      color: var(--text-muted);
      font: 600 13px/1.2 var(--font-ui);
    }
  }

  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
  }

  li {
    text-wrap: pretty;
  }

  /* with its colour as on the line list */
  strong {
    margin-right: var(--space-1);

    &::before {
      content: '';
      display: inline-block;
      width: 14px;
      height: 4px;
      margin-right: 6px;
      vertical-align: middle;
      background: var(--line);
    }
  }
</style>

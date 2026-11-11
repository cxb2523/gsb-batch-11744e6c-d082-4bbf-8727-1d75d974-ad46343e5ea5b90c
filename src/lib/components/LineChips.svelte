<script lang="ts">
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, lineById, type LineId } from '#lib/lines.js';

  let { lines }: { lines: LineId[] } = $props();
</script>

<ul class="lines" aria-label={t.station.lines}>
  {#each lines as id (id)}
    {@const line = lineById(id)!}
    <li style:--line={colourOf(line)}>{line.name}</li>
  {/each}
</ul>

<style>
  .lines {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--text-muted);
    font-size: 13px;

    li::before {
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

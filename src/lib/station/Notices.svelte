<script lang="ts">
  import { t } from '#lib/i18n/i18n.svelte.js';

  let { notices }: { notices: string[] } = $props();
</script>

{#if notices.length}
  <section class="notices" aria-labelledby="notices">
    <h2 id="notices">{t.station.notices}</h2>
    <!-- TfL writes them, so they're in English whatever the page is in -->
    <ul lang="en">
      {#each notices as notice (notice)}
        <li>{notice}</li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .notices {
    padding: var(--space-3) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
    border-radius: var(--radius-small);
    background: color-mix(in srgb, var(--warn) 8%, var(--surface));

    /* the same amber dot as a line that isn't running well */
    h2 {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0 0 var(--space-2);
      color: var(--warn);
      font: 600 13px/1.2 var(--font-ui);

      &::before {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--warn);
      }
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
</style>

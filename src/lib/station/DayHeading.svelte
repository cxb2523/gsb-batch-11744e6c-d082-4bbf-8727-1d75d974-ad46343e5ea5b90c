<script lang="ts">
  import { t, weekday } from '#lib/i18n/i18n.svelte.js';

  interface Props {
    id: string;
    title: string;
    /** Monday first */
    day: number;
    /** Until it's known which day it is in London */
    disabled: boolean;
  }

  let { id, title, day = $bindable(), disabled }: Props = $props();
</script>

<div class="top">
  <h2 {id}>{title}</h2>
  <select aria-label={t.station.day} bind:value={day} {disabled}>
    {#each { length: 7 }, i (i)}
      <option value={i}>{weekday(i)}</option>
    {/each}
  </select>
</div>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);

    h2 {
      margin: 0;
    }
  }

  select {
    min-height: 36px;
    padding: 0 var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-small);
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
</style>

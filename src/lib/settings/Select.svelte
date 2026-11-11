<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Row from './Row.svelte';

  interface Props {
    label: string;
    hint?: string;
    value: string;
    children: Snippet;
  }

  let { label, hint, value = $bindable(), children: options }: Props = $props();
</script>

<Row {label} {hint}>
  {#snippet children(tie)}
    <span class="select">
      <select {...tie} bind:value>{@render options()}</select>
      <span class="chevron"><Icon name="down" size={16} /></span>
    </span>
  {/snippet}
</Row>

<style>
  .select {
    position: relative;
    display: grid;
    align-items: center;
  }

  select {
    appearance: none;
    min-height: 40px;
    padding: 0 36px 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-small);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--control);
    color: var(--text);
    font: 600 14px/1.1 var(--font-ui);
    cursor: pointer;

    &:hover {
      box-shadow: inset 0 0 0 1px var(--text-muted);
    }
  }

  .chevron {
    position: absolute;
    right: 10px;
    display: grid;
    color: var(--text-muted);
    pointer-events: none;
  }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    hint?: string;
    /** Names a set of choices rather than one control */
    group?: boolean;
    /** Puts the control under its name */
    wide?: boolean;
    children: Snippet<[{ id: string; 'aria-describedby'?: string }]>;
  }

  let { label, hint, group = false, wide = group, children }: Props = $props();

  const id = $props.id();
  const described = $derived(hint ? `${id}-hint` : undefined);
</script>

<div
  class="row"
  class:wide
  role={group ? 'group' : undefined}
  aria-labelledby={group ? `${id}-label` : undefined}
  aria-describedby={group ? described : undefined}
>
  <div class="text">
    {#if group}
      <span id="{id}-label">{label}</span>
    {:else}
      <label for={id}>{label}</label>
    {/if}
    {#if hint}<span class="hint" id={described}>{hint}</span>{/if}
  </div>
  {@render children({ id, 'aria-describedby': described })}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    min-height: 56px;
    padding: var(--space-3) var(--space-4);

    &.wide {
      grid-template-columns: 1fr;
    }
  }

  .text {
    display: grid;
    gap: 2px;
  }

  .hint {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.35;
  }
</style>

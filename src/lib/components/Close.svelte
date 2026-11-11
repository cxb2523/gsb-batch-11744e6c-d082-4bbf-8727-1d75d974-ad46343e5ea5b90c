<script lang="ts">
  import { t } from '#lib/i18n/i18n.svelte.js';
  import Icon from './Icon.svelte';

  let { onclick }: { onclick: () => void } = $props();
</script>

<button type="button" {onclick}>{t.close} <Icon name="close" size={16} /></button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 36px;
    margin-right: calc(-1 * var(--space-2));
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--text-muted);
    font-size: 13px;

    &:hover {
      background: var(--surface-sunk);
      color: var(--text);
    }
  }
</style>

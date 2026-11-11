<script lang="ts" generics="T">
  import Icon, { type IconName } from '#lib/components/Icon.svelte';
  import Row from './Row.svelte';

  interface Props {
    label: string;
    hint?: string;
    options: { value: T; label: string; icon?: IconName }[];
    value: T;
  }

  let { label, hint, options, value = $bindable() }: Props = $props();

  const name = $props.id();
</script>

<Row {label} {hint} group>
  <div class="segments">
    {#each options as option (option.value)}
      <label>
        <input
          type="radio"
          class="visually-hidden"
          {name}
          value={option.value}
          bind:group={value}
        />
        {#if option.icon}<Icon name={option.icon} size={16} />{/if}
        {option.label}
      </label>
    {/each}
  </div>
</Row>

<style>
  .segments {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-small);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--rule);
  }

  label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 var(--space-2);
    border-radius: 4px;
    color: var(--text-muted);
    font: 600 14px/1.1 var(--font-ui);
    cursor: pointer;

    &:hover {
      color: var(--text);
    }

    &:has(:checked) {
      background: var(--accent);
      color: var(--accent-ink);
    }

    &:has(:focus-visible) {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
  }
</style>

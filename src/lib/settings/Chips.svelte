<script lang="ts" generics="T">
  import Icon from '#lib/components/Icon.svelte';
  import Row from './Row.svelte';

  interface Props {
    label: string;
    hint?: string;
    options: { value: T; label: string }[];
    value: T[];
  }

  let { label, hint, options, value = $bindable() }: Props = $props();
</script>

<Row {label} {hint} group>
  <div class="chips">
    {#each options as option (option.value)}
      <label>
        <input type="checkbox" class="visually-hidden" value={option.value} bind:group={value} />
        <Icon name={value.includes(option.value) ? 'check' : 'plus'} size={16} />
        {option.label}
      </label>
    {/each}
  </div>
</Row>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 var(--space-3) 0 10px;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--rule);
    color: var(--text-muted);
    font: 600 14px/1.1 var(--font-ui);
    cursor: pointer;

    &:hover {
      color: var(--text);
    }

    &:has(:checked) {
      box-shadow: inset 0 0 0 1.5px var(--accent);
      color: var(--accent);
    }

    &:has(:focus-visible) {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
  }
</style>

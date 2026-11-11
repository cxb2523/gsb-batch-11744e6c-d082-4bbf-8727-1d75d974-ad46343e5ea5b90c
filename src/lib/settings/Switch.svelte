<script lang="ts">
  import Row from './Row.svelte';

  interface Props {
    label: string;
    hint?: string;
    checked: boolean;
  }

  let { label, hint, checked = $bindable() }: Props = $props();
</script>

<Row {label} {hint}>
  {#snippet children(tie)}
    <input type="checkbox" role="switch" {...tie} bind:checked />
  {/snippet}
</Row>

<style>
  input {
    appearance: none;
    position: relative;
    width: 46px;
    height: 28px;
    margin: 0;
    border-radius: 14px;
    background: var(--control);
    cursor: pointer;
    transition: background-color 200ms var(--ease-out);

    &::before {
      content: '';
      position: absolute;
      inset: 3px auto auto 3px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
      transition: translate 200ms var(--ease-out);
    }

    &:checked {
      background: var(--accent);

      &::before {
        translate: 18px;
        background: var(--accent-ink);
      }
    }
  }
</style>

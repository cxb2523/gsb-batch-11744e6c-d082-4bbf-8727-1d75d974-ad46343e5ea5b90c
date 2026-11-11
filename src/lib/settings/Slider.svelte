<script lang="ts">
  import Icon from '#lib/components/Icon.svelte';
  import Row from './Row.svelte';

  interface Props {
    label: string;
    hint?: string;
    value: number;
  }

  let { label, hint, value = $bindable() }: Props = $props();
</script>

<Row {label} {hint} wide>
  {#snippet children(tie)}
    <div class="slider">
      <Icon name="minus" size={16} />
      <input
        type="range"
        {...tie}
        min="0"
        max="100"
        bind:value
        aria-valuetext="{value}%"
        style:--fill="{value}%"
      />
      <Icon name="plus" size={16} />
    </div>
  {/snippet}
</Row>

<style>
  .slider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--text-muted);
  }

  /* each engine wants its own track and thumb rules */
  input {
    --track: linear-gradient(to right, var(--accent) var(--fill), var(--control) var(--fill));

    flex: 1;
    height: 28px;
    margin: 0;
    border-radius: var(--radius-small);
    appearance: none;
    background: none;
    cursor: pointer;

    &::-webkit-slider-runnable-track {
      height: 6px;
      border-radius: 3px;
      background: var(--track);
    }

    &::-moz-range-track {
      height: 6px;
      border-radius: 3px;
      background: var(--track);
    }

    &::-webkit-slider-thumb {
      appearance: none;
      width: 22px;
      height: 22px;
      margin-top: -8px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow:
        inset 0 0 0 2px var(--accent),
        0 1px 3px rgb(0 0 0 / 0.25);
    }

    &::-moz-range-thumb {
      width: 22px;
      height: 22px;
      border: 0;
      border-radius: 50%;
      background: var(--surface);
      box-shadow:
        inset 0 0 0 2px var(--accent),
        0 1px 3px rgb(0 0 0 / 0.25);
    }
  }
</style>

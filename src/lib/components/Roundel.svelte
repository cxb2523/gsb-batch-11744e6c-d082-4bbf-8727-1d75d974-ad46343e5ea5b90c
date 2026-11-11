<script lang="ts">
  interface Props {
    /** The ring's colour, its mode's own */
    colour: string;
    /** Faded right out when its mode's switched off */
    on?: boolean;
    width?: number;
  }

  let { colour, on = true, width = 22 }: Props = $props();
</script>

<svg
  class:on
  style:--mode={colour}
  viewBox="0 0 22 16"
  {width}
  height={(width * 16) / 22}
  aria-hidden="true"
>
  <circle cx="11" cy="8" r="6" />
  <rect x="1" y="6.5" width="20" height="3" />
</svg>

<style>
  svg {
    --off: color-mix(in srgb, var(--text-muted) 35%, var(--surface));
    flex: none;
  }

  circle {
    fill: none;
    stroke: var(--off);
    stroke-width: 2.6;
  }

  rect {
    fill: var(--off);
  }

  .on circle {
    stroke: var(--mode);
  }

  .on rect {
    fill: var(--accent);
  }
</style>

<script lang="ts">
  import { swipeToClose } from '#lib/swipe.js';

  let { onclose }: { onclose: () => void } = $props();
</script>

<div class="grip" aria-hidden="true" {@attach swipeToClose(onclose)}></div>

<style>
  /* stays put while its sheet scrolls, so it can always be pulled down */
  .grip {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    place-items: center;
    box-sizing: content-box;
    height: var(--space-5);
    margin-inline: calc(-1 * var(--space-4));
    background: var(--surface);
    touch-action: none;
    cursor: grab;

    &::before {
      content: '';
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--rule);
    }
  }

  @media (min-width: 960px) {
    .grip {
      display: none;
    }
  }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import SiteHeader from './SiteHeader.svelte';

  interface Props {
    heading: string;
    intro?: string;
    /** Beside the name in the header, like the live feed */
    header?: Snippet;
    children: Snippet;
  }

  let { heading, intro, header, children }: Props = $props();
</script>

<div class="index scrolls">
  <SiteHeader>{@render header?.()}</SiteHeader>
  <main id="main">
    <h1>{heading}</h1>
    {#if intro}<p>{intro}</p>{/if}
    {@render children()}
  </main>
</div>

<style>
  .index {
    min-height: 100dvh;
    background: var(--surface);
  }

  main {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom));
  }

  h1 {
    margin: 0;
    font: 30px/1.1 var(--font-display);
    color: var(--station-ink);
  }

  p {
    color: var(--text-muted);
  }
</style>

<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { load, looks } from '#lib/settings/settings.svelte.js';
  import '../app.css';

  let { children } = $props();

  // the map's page loads them first, for its links, so this is for the error page
  onMount(load);

  // pages fade into one another, but between stations the page stays and its map glides over
  onNavigate(({ from, to, complete }) => {
    if (!document.startViewTransition || looks.calm || from?.route.id === to?.route.id) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await complete;
      });
    });
  });
</script>

{@render children()}

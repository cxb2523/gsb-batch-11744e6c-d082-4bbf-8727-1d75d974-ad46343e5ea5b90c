<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { track } from '#lib/plausible.js';

  const lost = $derived(page.status === 404);

  afterNavigate(() => lost && track('404', { path: location.pathname }));
</script>

<svelte:head>
  <title>{lost ? t.error.lost : t.error.broken} · tubespotting</title>
</svelte:head>

<main class="lost">
  <h1>{lost ? t.error.noTrains : t.error.broken}</h1>
  <p class="board">{page.status} · {t.error.outOfService}</p>
  <p>{lost ? t.error.missing : page.error?.message}</p>
  <a href="/">{t.error.back}</a>
</main>

<style>
  .lost {
    display: grid;
    place-content: center;
    justify-items: start;
    gap: var(--space-3);
    min-height: 100dvh;
    padding: var(--space-5);
  }

  .board {
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-small);
    background: var(--board);
    color: var(--board-ink);
    font: 700 28px/1 var(--font-board);
    text-shadow: 0 0 6px rgb(255 176 0 / 0.45);
  }

  h1 {
    margin: 0;
    font: 32px/1.1 var(--font-display);
    color: var(--station-ink);
  }

  p {
    margin: 0;
    color: var(--text-muted);
  }

  a {
    font-weight: 600;
  }
</style>

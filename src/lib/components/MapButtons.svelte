<script lang="ts">
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { settings } from '#lib/settings/settings.svelte.js';
  import Icon from './Icon.svelte';

  let { onzoom }: { onzoom: (by: number) => void } = $props();

  const schematic = $derived(settings.style === 'schematic');
</script>

<button
  type="button"
  aria-label={t.page.style}
  aria-pressed={schematic}
  title={schematic ? t.page.toGeographic : t.page.toSchematic}
  onclick={() => (settings.style = schematic ? 'geographic' : 'schematic')}
>
  <Icon name={schematic ? 'map' : 'tube'} />
</button>
<button type="button" class="zoom" aria-label={t.page.zoomIn} onclick={() => onzoom(1.6)}>
  <Icon name="plus" />
</button>
<button type="button" class="zoom" aria-label={t.page.zoomOut} onclick={() => onzoom(1 / 1.6)}>
  <Icon name="minus" />
</button>

<style>
  /* phones pinch to zoom */
  @media (max-width: 959px) {
    .zoom {
      display: none;
    }
  }
</style>

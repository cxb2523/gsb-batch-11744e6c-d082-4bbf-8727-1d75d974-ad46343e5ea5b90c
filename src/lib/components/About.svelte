<script lang="ts">
  import { t } from '#lib/i18n/i18n.svelte.js';
  import AboutText from './AboutText.svelte';
  import Close from './Close.svelte';

  interface Props {
    /** Underground trains running now, or null until TfL has answered */
    trains: number | null;
    onclose: () => void;
  }

  let { trains, onclose }: Props = $props();
</script>

<header>
  <h2>{t.about}</h2>
  <Close onclick={onclose} />
</header>
<AboutText {trains} />

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    margin: 0;
    font: 26px/1.1 var(--font-display);
    color: var(--station-ink);
  }
</style>

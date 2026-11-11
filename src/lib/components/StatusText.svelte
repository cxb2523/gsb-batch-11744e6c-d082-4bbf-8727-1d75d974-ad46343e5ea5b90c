<script lang="ts">
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { tone } from '#lib/status.js';
  import type { LineStatus } from '#lib/types.js';

  /** How a line's running, in TfL's words, and why when it isn't */
  let { status }: { status: LineStatus | undefined } = $props();
</script>

<!-- TfL writes them, so they're in English whatever the page is in -->
<p class="status" data-tone={status && tone(status.severity)} lang={status && 'en'}>
  {status?.status ?? t.line.checking}
</p>
{#if status?.reason}<p class="reason" lang="en">{status.reason}</p>{/if}

<style>
  .status {
    margin: var(--space-3) 0 0;
    font: 18px/1.2 var(--font-display);
    color: var(--tone, var(--text));
  }

  .reason {
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    text-wrap: pretty;
  }
</style>

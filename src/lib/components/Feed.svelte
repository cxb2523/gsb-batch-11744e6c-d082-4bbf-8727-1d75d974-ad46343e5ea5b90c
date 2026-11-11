<script lang="ts">
  import { count, t } from '#lib/i18n/i18n.svelte.js';
  import { live } from '#lib/live.svelte.js';

  /** Trains on the map, once TfL has answered */
  let { trains }: { trains: number } = $props();

  const words = $derived(
    live.feed === 'behind' ? t.feed.behind(t.minutes(Math.round(live.age / 60))) : t.feed[live.feed]
  );
</script>

<p class="pill" class:live={live.feed === 'live'}>
  <span class="beat" aria-hidden="true"></span>
  <span class="words">
    {#if live.snapshot}<span>{count(t.trains, trains)}</span>{/if}
    <span role="status">{words}</span>
  </span>
</p>

<style>
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;

    .beat {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--warn);
    }

    &.live .beat {
      background: var(--good);
      animation: beat 2.4s var(--ease-out) infinite;
    }
  }

  /* each part leads with a dot, clipped off when it wraps to the start of a line */
  .words {
    display: flex;
    flex-wrap: wrap;
    column-gap: 16px;
    overflow-x: clip;

    > ::before {
      content: '·';
      content: '·' / '';
      display: inline-block;
      width: 16px;
      margin-left: -16px;
      text-align: center;
    }
  }

  @keyframes beat {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--good) 55%, transparent);
    }
    100% {
      box-shadow: 0 0 0 7px transparent;
    }
  }
</style>

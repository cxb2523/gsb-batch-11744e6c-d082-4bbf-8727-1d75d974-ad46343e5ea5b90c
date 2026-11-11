<script lang="ts">
  import type { Tracked } from '#lib/fleet.js';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { colourOf, inkOf, type Line } from '#lib/lines.js';
  import { lineName } from '#lib/status.js';
  import type { LineStatus } from '#lib/types.js';
  import LineTrains from './LineTrains.svelte';
  import PageLink from './PageLink.svelte';
  import StatusText from './StatusText.svelte';

  interface Props {
    line: Line;
    status: LineStatus | undefined;
    trains: Tracked[];
    waiting: boolean;
    now: number;
    onpicktrain: (key: string) => void;
  }

  let { line, status, trains, waiting, now, onpicktrain }: Props = $props();
</script>

<h2 style:--line={colourOf(line)} style:--ink={inkOf(line)}>{line.name}</h2>
<StatusText {status} />
<PageLink href="/lines/{line.id}" eyebrow={t.line.page} name={lineName(line)} />
<LineTrains {line} {trains} {waiting} {now} {onpicktrain} />

<style>
  h2 {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--line);
    color: var(--ink);
    font: 24px/1.15 var(--font-display);
  }
</style>

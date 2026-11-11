<script lang="ts">
  import Icon, { type IconName } from '#lib/components/Icon.svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import type { Facts } from '#lib/types.js';

  let { facts }: { facts: Facts } = $props();

  type Said = string | number | boolean | undefined;

  const say = (value: Said) =>
    typeof value === 'boolean' ? (value ? t.facts.yes : t.facts.no) : String(value);

  // in the order someone planning a trip would want them, leaving out what TfL doesn't say
  const rows = $derived(
    (
      [
        ['rings', t.facts.zone, [facts.zone]],
        // TfL only marks where a lift is the way in, as no lift can mean steps or a level way in
        [
          'wheelchair',
          t.facts.access,
          [facts.liftAccess ? t.facts.byLift : undefined, facts.access]
        ],
        ['lift', t.facts.lifts, [facts.lifts]],
        ['escalator', t.facts.escalators, [facts.escalators]],
        ['toilets', t.facts.toilets, [facts.toilets]],
        ['wifi', t.facts.wifi, [facts.wifi]],
        ['moon', t.facts.night, [facts.night]],
        ['pin', t.facts.address, [facts.address]]
      ] satisfies [IconName, string, Said[]][]
    )
      .map(([icon, label, said]) => ({
        icon,
        label,
        said: said.filter((value) => value !== undefined)
      }))
      .filter(({ said }) => said.length)
  );
</script>

{#if rows.length}
  <section aria-labelledby="facts">
    <h2 id="facts">{t.facts.title}</h2>
    <dl>
      {#each rows as { icon, label, said } (icon)}
        <div>
          <dt><Icon name={icon} size={18} />{label}</dt>
          {#each said as value, i (i)}<dd>{say(value)}</dd>{/each}
        </div>
      {/each}
    </dl>
  </section>
{/if}

<style>
  dl {
    margin: 0;
  }

  div {
    display: grid;
    grid-template-columns: minmax(9rem, 2fr) 3fr;
    column-gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--rule);
  }

  dt {
    grid-row: span 2;
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    color: var(--text-muted);

    /* TfL's blue, as on its own signs */
    :global(svg) {
      flex: none;
      margin-top: 2px;
      color: var(--accent);
    }
  }

  dd {
    grid-column: 2;
    margin: 0;
    text-wrap: pretty;

    & + dd {
      margin-top: var(--space-1);
      color: var(--text-muted);
      font-size: 14px;
    }
  }
</style>

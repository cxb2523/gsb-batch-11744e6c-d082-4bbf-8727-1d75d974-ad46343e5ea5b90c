<script lang="ts">
  import Icon from './Icon.svelte';

  /** Through from a sheet on the map to the page that has everything on it */
  let { href, eyebrow, name }: { href: string; eyebrow: string; name: string } = $props();
</script>

<a class="page" {href}>
  <span class="eyebrow">{eyebrow}</span>
  <span class="name">{name}</span>
  <Icon name="forward" />
</a>

<style>
  .page {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: var(--space-2);
    margin-top: var(--space-4);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-small);
    background: var(--accent);
    color: var(--accent-ink);
    text-decoration: none;

    .eyebrow {
      font: 600 12px/1.3 var(--font-ui);
      opacity: 0.85;
    }

    .name {
      grid-row: 2;
      overflow: hidden;
      font: 17px/1.2 var(--font-display);
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    :global(svg) {
      grid-area: 1 / 2 / 3;
      transition: translate 320ms var(--ease-out);
    }

    &:hover :global(svg) {
      translate: 3px 0;
    }
  }
</style>

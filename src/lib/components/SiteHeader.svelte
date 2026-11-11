<script lang="ts">
  import { page } from '$app/state';
  import type { ComponentProps, Snippet } from 'svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { source } from '#lib/meta.js';
  import Settings from '#lib/settings/Settings.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props extends Pick<ComponentProps<typeof Settings>, 'zoom' | 'onzoom'> {
    /** Beside the name, like the live feed */
    children?: Snippet;
  }

  let { children, ...map }: Props = $props();

  let nav: HTMLElement;
  let toggle: HTMLButtonElement;
  let open = $state(false);
  let configuring = $state(false);

  const links: { href: string; name: string; icon: IconName }[] = $derived([
    { href: '/', name: t.page.map, icon: 'map' },
    { href: '/lines', name: t.lines.title, icon: 'branch' },
    { href: '/stations', name: t.stations.title, icon: 'roundel' },
    { href: '/about', name: t.about, icon: 'info' }
  ]);

  /** The link to this page, or to the section it's in, so a line's page is still under Lines */
  function current(href: string) {
    const { pathname } = page.url;
    if (pathname === href) return 'page';
    if (pathname.startsWith(`${href}/`)) return 'true';
  }

  // the settings open over the menu and close back onto it, so it stays open under them
  function shut(refocus = false) {
    if (!open || configuring) return;
    open = false;
    if (refocus) toggle.focus();
  }
</script>

<svelte:window
  onkeydown={(event) => event.key === 'Escape' && shut(true)}
  onpointerdown={(event) => !nav.contains(event.target as Node) && shut()}
/>

<a class="skip" href="#main">{t.page.skip}</a>

<header>
  <div class="brand">
    <a class="name" href="/">tubespotting</a>
    {@render children?.()}
  </div>

  <nav
    bind:this={nav}
    aria-label={t.page.menu}
    onfocusout={(event) => !nav.contains(event.relatedTarget as Node) && shut()}
  >
    <button
      type="button"
      class="toggle"
      bind:this={toggle}
      aria-label={t.page.menu}
      aria-controls="menu"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <Icon name={open ? 'close' : 'menu'} />
    </button>
    <ul id="menu" class:open>
      {#each links as { href, name, icon } (href)}
        <li>
          <a {href} aria-current={current(href)} onclick={() => (open = false)}>
            <Icon name={icon} size={16} />{name}
          </a>
        </li>
      {/each}
      <li>
        <a href={source} target="_blank" rel="noopener"><Icon name="github" size={16} />GitHub</a>
      </li>
      <li class="settings">
        <button type="button" aria-haspopup="dialog" onclick={() => (configuring = true)}>
          <Icon name="settings" size={16} /><span>{t.page.settings}</span>
        </button>
      </li>
    </ul>
  </nav>
</header>

{#if configuring}
  <Settings {...map} onclose={() => (configuring = false)} />
{/if}

<style>
  .skip {
    position: absolute;
    top: var(--space-2);
    left: var(--space-2);
    z-index: 2;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-small);
    background: var(--accent);
    color: var(--accent-ink);

    &:not(:focus) {
      translate: 0 -200%;
    }
  }

  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: max(var(--space-2), env(safe-area-inset-top)) var(--space-4) var(--space-2);
    border-bottom: 1px solid var(--rule);
    background: var(--surface);
  }

  .brand {
    display: grid;
    justify-items: start;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font: 20px/1.1 var(--font-display);
    letter-spacing: 0.01em;
    text-decoration: none;
  }

  /* the icons line up with the edge rather than the padding around them */
  nav {
    margin-inline-end: calc(-1 * var(--space-2));
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  ul a,
  button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap);
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--text-muted);
    font: 15px/1.1 var(--font-display);
    text-decoration: none;
    white-space: nowrap;

    &:hover {
      background: var(--surface-sunk);
      color: var(--text);
    }
  }

  /* underlined too, so it isn't told by colour alone */
  [aria-current] {
    color: var(--accent);
    text-decoration: underline 2px;
    text-underline-offset: 6px;
  }

  .toggle {
    justify-content: center;
    width: var(--tap);
    padding: 0;
    color: var(--text);
  }

  /* folded away under the bar, as a list to tap down */
  @media (max-width: 799px) {
    ul {
      position: absolute;
      top: 100%;
      inset-inline: 0;
      display: none;
      gap: 2px;
      padding: var(--space-2) var(--space-1) var(--space-3);
      /* the rest of the screen under the bar, scrolling where that's too short for it all */
      max-height: calc(100dvh - 100%);
      overflow-y: auto;
      overscroll-behavior: contain;
      border-block: 1px solid var(--rule);
      background: var(--surface);
      box-shadow: var(--shadow);
      animation: drop 200ms var(--ease-out);

      &.open {
        display: grid;
      }
    }

    ul a,
    ul button {
      width: 100%;
      font-size: 17px;
    }

    .settings {
      margin-top: var(--space-1);
      padding-top: var(--space-1);
      border-top: 1px solid var(--rule);
    }
  }

  @media (min-width: 800px) {
    .toggle {
      display: none;
    }

    ul {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    /* an action rather than a page, so it stands apart as an icon */
    .settings {
      display: flex;
      align-items: center;
      gap: var(--space-1);

      &::before {
        content: '';
        width: 1px;
        height: 24px;
        background: var(--rule);
      }

      button {
        justify-content: center;
        width: var(--tap);
        padding: 0;
      }

      span {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  }

  @keyframes drop {
    from {
      translate: 0 -8px;
      opacity: 0;
    }
  }
</style>

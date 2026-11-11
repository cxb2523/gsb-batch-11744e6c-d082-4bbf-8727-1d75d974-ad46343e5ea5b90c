<script lang="ts">
  import { onMount } from 'svelte';
  import Close from '#lib/components/Close.svelte';
  import Grip from '#lib/components/Grip.svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { LOCALES } from '#lib/i18n/locales.js';
  import { MODES } from '#lib/lines.js';
  import { counting, reporting } from '#lib/meta.js';
  import Chips from './Chips.svelte';
  import Row from './Row.svelte';
  import { REFRESH } from './saved.js';
  import Segmented from './Segmented.svelte';
  import Select from './Select.svelte';
  import { clear, language, looks, settings } from './settings.svelte.js';
  import Slider from './Slider.svelte';
  import Switch from './Switch.svelte';

  interface Props {
    zoom?: number;
    located?: boolean;
    /** Left out where there's no map to zoom, which hides the slider */
    onzoom?: (zoom: number) => void;
    /** Left out where the map doesn't show where someone is, which hides the switch */
    onlocate?: (on: boolean) => void;
    onclose: () => void;
  }

  let { zoom, located, onzoom, onlocate, onclose }: Props = $props();

  const modes = MODES.map((mode) => ({ value: mode.id, label: mode.name }));
  const refreshes = $derived(
    REFRESH.map((s) => ({ value: s, label: s < 60 ? t.seconds(s) : t.minutes(s / 60) }))
  );

  let dialog: HTMLDialogElement;
  // so a drag that ends on the backdrop doesn't close it
  let pressed: EventTarget | null = null;
  let cleared = $state(false);

  // focused itself, so it's announced by name
  onMount(() => {
    dialog.showModal();
    dialog.focus();
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="settings-title"
  tabindex="-1"
  {onclose}
  onpointerdown={(event) => (pressed = event.target)}
  onclick={(event) => pressed === dialog && event.target === dialog && dialog.close()}
>
  <div class="sheet">
    <Grip onclose={() => dialog.close()} />
    <header>
      <h2 id="settings-title">{t.settings.title}</h2>
      <Close onclick={() => dialog.close()} />
    </header>

    <h3>{t.settings.general}</h3>
    <div class="card">
      <Segmented
        {...t.settings.theme}
        options={[
          { value: false, label: t.settings.light, icon: 'sun' },
          { value: true, label: t.settings.dark, icon: 'moon' }
        ]}
        bind:value={looks.dark}
      />
      <Select {...t.settings.language} bind:value={language.current}>
        {#each Object.entries(LOCALES) as [code, { name, tag }] (code)}
          <option value={code} lang={tag}>{name}</option>
        {/each}
      </Select>
    </div>

    <h3>{t.settings.map}</h3>
    <div class="card">
      <Segmented
        {...t.settings.layout}
        options={[
          { value: 'schematic', label: t.settings.schematic, icon: 'tube' },
          { value: 'geographic', label: t.settings.geographic, icon: 'map' }
        ]}
        bind:value={settings.style}
      />
      {#if onzoom && zoom !== undefined}
        <Slider
          {...t.settings.zoom}
          bind:value={() => Math.round(zoom * 100), (percent) => onzoom(percent / 100)}
        />
      {/if}
      <Chips {...t.settings.modes} options={modes} bind:value={settings.modes} />
      {#if onlocate}
        <Switch {...t.settings.locate} bind:checked={() => !!located, onlocate} />
      {/if}
      <Segmented {...t.settings.refresh} options={refreshes} bind:value={settings.refresh} />
    </div>

    <h3>{t.settings.accessibility}</h3>
    <div class="card">
      <Switch {...t.settings.calm} bind:checked={looks.calm} />
      <Switch {...t.settings.contrast} bind:checked={looks.contrast} />
      <Switch {...t.settings.shortcuts} bind:checked={settings.shortcuts} />
    </div>

    <h3>{t.settings.privacy}</h3>
    <div class="card">
      {#if counting}
        <Switch {...t.settings.analytics} bind:checked={settings.analytics} />
      {/if}
      {#if reporting}
        <Switch {...t.settings.errors} bind:checked={settings.errors} />
      {/if}
      <Row {...t.settings.clear}>
        {#snippet children(tie)}
          <button
            type="button"
            class="clear"
            {...tie}
            onclick={() => {
              clear();
              cleared = true;
            }}
          >
            {cleared ? t.settings.cleared : t.settings.clearButton}
          </button>
        {/snippet}
      </Row>
    </div>
    <p class="visually-hidden" role="status">{cleared ? t.settings.clearedAll : ''}</p>
  </div>
</dialog>

<style>
  dialog {
    inset: auto 0 0;
    width: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    overflow: visible;

    &:focus-visible {
      outline: none;
    }

    &::backdrop {
      background: rgb(10 14 20 / 0.3);
    }
  }

  .sheet {
    max-height: 85dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 var(--space-4) calc(var(--space-5) + env(safe-area-inset-bottom));
    border-radius: var(--radius) var(--radius) 0 0;
    background: var(--surface);
    box-shadow: var(--shadow);
    animation: rise 320ms var(--ease-out);
  }

  header {
    position: sticky;
    top: var(--space-5);
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-2);
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font: 26px/1.1 var(--font-display);
    color: var(--station-ink);
  }

  h3 {
    margin: var(--space-5) var(--space-1) var(--space-2);
    color: var(--text-muted);
    font: 13px/1.2 var(--font-display);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .card {
    border-radius: var(--radius);
    background: var(--surface-sunk);

    > :global(* + *) {
      border-top: 1px solid var(--rule);
    }
  }

  .clear {
    min-height: 36px;
    padding: 0 var(--space-4);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    box-shadow: inset 0 0 0 1.5px var(--bad);
    color: var(--bad);
    font: 600 14px/1.1 var(--font-ui);

    &:hover {
      background: color-mix(in srgb, var(--bad) 10%, transparent);
    }
  }

  @media (min-width: 960px) {
    dialog {
      inset: 0;
      width: min(600px, 100% - 2 * var(--space-5));
      margin: auto;
    }

    .sheet {
      max-height: min(780px, 100dvh - 2 * var(--space-6));
      padding: 0 var(--space-5) var(--space-5);
      border-radius: var(--radius);
    }

    header {
      top: 0;
      padding-top: var(--space-5);
    }
  }
</style>

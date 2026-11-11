<script lang="ts">
  import { select } from 'd3-selection';
  import 'd3-transition';
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
  import { onMount } from 'svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { between, layouts, type Layout, type Style } from '#lib/layout.js';
  import type { Live } from '#lib/live.svelte.js';
  import { distance, middle, type Point } from '#lib/network.js';
  import {
    paintLabels,
    paintNetwork,
    paintTrains,
    type Box,
    type Closures,
    type Focus,
    type Hit,
    type Inset,
    type Label,
    type Palette
  } from './painter.js';
  import { readPalette } from './palette.js';
  import { toScreen, toWorld, type View } from './view.js';

  export type Tap = { kind: 'train'; key: string } | { kind: 'station'; index: number } | null;

  interface Props {
    live: Live;
    focus: Pick<Focus, 'shown' | 'lines' | 'station' | 'train' | 'alone'>;
    follow: boolean;
    inset: Inset;
    style: Style;
    dark: boolean;
    calm: boolean;
    /** Zoom, from 0 all the way out to 1 all the way in */
    level?: number;
    label: string;
    you: Point | null;
    /** Part of a page that scrolls past it, so a wheel scrolls on and only ctrl or a pinch zooms */
    inPage?: boolean;
    onpick: (tap: Tap) => void;
    onwander: () => void;
  }

  let {
    live,
    focus,
    follow,
    inset,
    style,
    dark,
    calm,
    level = $bindable(0),
    label,
    you,
    inPage = false,
    onpick,
    onwander
  }: Props = $props();

  const [FURTHEST, CLOSEST] = [0.004, 1.6];
  // roughly zones 1 and 2, or just zone 1 on a phone
  const START = (wide: boolean) => [
    { x: wide ? -8_000 : -3_800, y: wide ? -5_500 : -3_000 },
    { x: wide ? 8_000 : 3_800, y: wide ? 5_000 : 2_600 }
  ];

  let wrap: HTMLDivElement;
  let base: HTMLCanvasElement;
  let top: HTMLCanvasElement;
  let behaviour: ZoomBehavior<HTMLCanvasElement, unknown>;
  let transform = zoomIdentity;
  let size = { width: 0, height: 0 };
  let palette: Palette | null = null;
  let dirty = true;
  /** When the last frame was drawn */
  let painted = 0;
  let stationHits = new Map<number, Hit>();
  let labels: Label[] = [];
  let outgoing: Label[] = [];
  let trainHits = new Map<string, Hit>();

  const view = (): View => ({ k: transform.k, x: transform.x, y: transform.y, ...size });

  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

  const bounds = (points: Point[]) => {
    const [xs, ys] = [points.map((p) => p.x), points.map((p) => p.y)];
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };

  const reach = $derived(bounds(layouts[style].at));

  // the middle of the uncovered map can go anywhere over the network, at any zoom
  function constrain(t: ZoomTransform) {
    const [x, y] = t.invert([(inset.left + size.width) / 2, (size.height - inset.bottom) / 2]);
    return t.translate(x - clamp(x, reach.x0, reach.x1), y - clamp(y, reach.y0, reach.y1));
  }

  /** Zooms to fit some real places in the bit of the map the panels aren't covering */
  export function flyTo(places: Point[], maxK = 0.12, instant = false) {
    if (places.length) fit(() => places.map(layouts[style].place), maxK, instant);
  }

  function fit(points: () => Point[], maxK: number, instant = false) {
    if (!size.width) return;
    // worked out as it sets off, by when the page has put back a saved map style
    select(top)
      .transition()
      .duration(instant || calm ? 0 : 1100)
      .call(behaviour.transform, () => {
        const { x0, y0, x1, y1 } = bounds(points());
        const [w, h] = [size.width - inset.left, size.height - inset.bottom];
        const k = clamp(
          Math.min((w * 0.8) / (x1 - x0 || 1), (h * 0.8) / (y1 - y0 || 1)),
          0.005,
          maxK
        );
        return zoomIdentity
          .translate(inset.left + w / 2, h / 2)
          .scale(k)
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      });
  }

  export function zoomBy(factor: number) {
    select(top)
      .transition()
      .duration(calm ? 0 : 300)
      .call(behaviour.scaleBy, factor);
  }

  export function zoomTo(level: number) {
    select(top).call(behaviour.scaleTo, FURTHEST * (CLOSEST / FURTHEST) ** level);
  }

  function nearest<K>(hits: Map<K, Hit>, at: Point): K | null {
    let best: K | null = null;
    let bestDistance = Infinity;
    for (const [key, hit] of hits) {
      const d = Math.hypot(hit.x - at.x, hit.y - at.y);
      if (d < hit.radius && d < bestDistance) [best, bestDistance] = [key, d];
    }
    return best;
  }

  const within = (at: Point, { x, y, w, h }: Box) =>
    at.x >= x && at.x <= x + w && at.y >= y && at.y <= y + h;

  // names are painted over the trains, so a click on one goes to its station
  function pickAt(at: Point): Tap {
    const label = labels.find(({ box }) => within(at, box));
    if (label) return { kind: 'station', index: label.station };
    const train = nearest(trainHits, at);
    if (train !== null) return { kind: 'train', key: train };
    const station = nearest(stationHits, at);
    return station !== null ? { kind: 'station', index: station } : null;
  }

  const pointer = ({ clientX, clientY }: MouseEvent | Touch) => {
    const box = top.getBoundingClientRect();
    return { x: clientX - box.left, y: clientY - box.top };
  };

  function onkeydown(event: KeyboardEvent) {
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [120, 0],
      ArrowRight: [-120, 0],
      ArrowUp: [0, 120],
      ArrowDown: [0, -120]
    };
    if (pan[event.key]) {
      const [dx, dy] = pan[event.key];
      select(top).call(behaviour.translateBy, dx / transform.k, dy / transform.k);
    } else if (event.key === '+' || event.key === '=') zoomBy(1.5);
    else if (event.key === '-') zoomBy(1 / 1.5);
    else if (event.key === 'Escape') onpick(null);
    else return;
    event.preventDefault();
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const was = size;
    size = { width: wrap.clientWidth, height: wrap.clientHeight };
    // the map keeps the same place in its middle as it changes size, as a page's panels move
    if (was.width) {
      const [dx, dy] = [(size.width - was.width) / 2, (size.height - was.height) / 2];
      select(top).call(behaviour.translateBy, dx / transform.k, dy / transform.k);
    }
    for (const canvas of [base, top]) {
      canvas.width = Math.round(size.width * ratio);
      canvas.height = Math.round(size.height * ratio);
      canvas.getContext('2d')!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    dirty = true;
  }

  $effect(() => {
    palette = readPalette(wrap, dark);
    dirty = true;
  });

  const closed: Closures = $derived(
    new Map(live.snapshot?.status.map(({ id, closed }) => [id, new Set(closed)]))
  );

  $effect(() => {
    void closed;
    dirty = true;
  });

  // picking lines fades the rest back rather than cutting
  let fading = { from: null as Focus['lines'], to: null as Focus['lines'], since: 0 };
  const FADE_MS = 400;
  // by what's in them, as the page makes a new set of the same lines whenever it looks again
  const same = (a: Focus['lines'], b: Focus['lines']) =>
    a === b || (a?.size === b?.size && [...(a ?? [])].every((line) => b?.has(line)));

  $effect(() => {
    if (!same(focus.lines, fading.to)) {
      fading = { from: fading.to, to: focus.lines, since: performance.now() };
      outgoing = labels;
    }
    void [focus.shown, focus.station, focus.train, focus.alone, inset];
    dirty = true;
  });

  const lensAt = (now: number): Focus => {
    const progress = calm ? 1 : Math.min(1, (now - fading.since) / FADE_MS);
    return { ...focus, previous: fading.from, fade: 1 - (1 - progress) ** 3 };
  };

  // switching maps folds one into the other round the station in the middle, zooming as it
  // goes so the same stations stay in view
  type Pin = { station: number; at: Point; zoom: [number, number] };
  let morph = {
    from: layouts.geographic,
    to: layouts.geographic,
    since: -Infinity,
    pin: null as Pin | null
  };
  const MORPH_MS = 900;

  const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2);
  const morphAt = (now: number) =>
    easeInOut(calm ? 1 : Math.min(1, (now - morph.since) / MORPH_MS));

  function layoutAt(now: number): Layout {
    const t = morphAt(now);
    return t === 1 ? morph.to : between(morph.from, morph.to, t);
  }

  /** How spread out some stations are on a map */
  function spread(layout: Layout, stations: number[]) {
    const points = stations.map((i) => layout.at[i]);
    const centre = middle(points);
    return Math.sqrt(points.reduce((sum, p) => sum + distance(p, centre) ** 2, 0) / points.length);
  }

  /** The station in the middle of the view, and the zoom that keeps what's around it in view */
  function pinFor(from: Layout, to: Layout): Pin {
    const v = view();
    const aim = toWorld(v, {
      x: inset.left + (size.width - inset.left) / 2,
      y: (size.height - inset.bottom) / 2
    });
    const station = from.at.reduce(
      (best, p, i) => (distance(p, aim) < distance(from.at[best], aim) ? i : best),
      0
    );
    const inView = from.at.flatMap((p, i) => {
      const { x, y } = toScreen(v, p);
      return x > inset.left && x < size.width && y > 0 && y < size.height - inset.bottom ? [i] : [];
    });
    const k = inView.length > 1 ? (v.k * spread(from, inView)) / spread(to, inView) : v.k;
    return { station, at: toScreen(v, from.at[station]), zoom: [v.k, clamp(k, FURTHEST, CLOSEST)] };
  }

  $effect(() => {
    const to = layouts[style];
    if (to === morph.to) return;
    // nothing's on screen yet, so there's nothing to fold
    if (!painted) {
      morph = { from: to, to, since: -Infinity, pin: null };
      return;
    }
    const from = layoutAt(performance.now());
    morph = { from, to, since: performance.now(), pin: pinFor(from, to) };
  });

  onMount(() => {
    const baseCtx = base.getContext('2d')!;
    const topCtx = top.getContext('2d')!;
    behaviour = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([FURTHEST, CLOSEST])
      .constrain(constrain)
      .tapDistance(30)
      .filter((event) =>
        event.type === 'wheel' ? event.ctrlKey || !inPage : !event.ctrlKey && !event.button
      )
      .on('zoom', (event) => {
        transform = event.transform;
        level = Math.log(transform.k / FURTHEST) / Math.log(CLOSEST / FURTHEST);
        dirty = true;
        if (event.sourceEvent) onwander();
      });
    // d3 spots double taps as well, which phones don't send on as double clicks
    select(top)
      .call(behaviour)
      .on('dblclick.zoom', (event: MouseEvent | TouchEvent) => {
        const at = 'changedTouches' in event ? event.changedTouches[0] : event;
        const spot = toWorld(view(), pointer(at));
        fit(() => [spot], Math.min(CLOSEST, transform.k * 2.2));
      });

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    // moving to a screen with a different pixel density doesn't resize anything
    let density: MediaQueryList;
    const watchDensity = () => {
      density = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      density.addEventListener('change', onDensity, { once: true });
    };
    const onDensity = () => {
      resize();
      watchDensity();
    };
    watchDensity();
    flyTo(START(size.width >= 600), 1, true);
    document.fonts?.load('12px "Hammersmith One"').then(() => (dirty = true));

    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      frame = requestAnimationFrame(tick);
      const v = view();
      const lens = lensAt(now);
      const layout = layoutAt(now);
      const morphing = morph.pin !== null;
      // far out, trains crawl a pixel a second, so there's no need for 60 frames of it
      const busy = dirty || morphing || lens.fade < 1 || focus.train !== null;
      const every = busy ? 0 : 1000 / clamp(v.k * 160, 12, 60);
      if (now - painted < every || !palette) return;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = painted = now;
      if (morph.pin) {
        const { station, at, zoom } = morph.pin;
        const k = zoom[0] * (zoom[1] / zoom[0]) ** morphAt(now);
        const p = layout.at[station];
        const pinned = zoomIdentity.translate(at.x - p.x * k, at.y - p.y * k).scale(k);
        select(top).call(behaviour.transform, pinned);
        if (layout === morph.to) morph.pin = null;
      }
      live.fleet.step(Date.now(), dt, layout);
      const followed = follow && focus.train ? live.fleet.trains.get(focus.train) : undefined;
      if (followed) {
        const [w, h] = [size.width - inset.left, size.height - inset.bottom];
        const want = { x: inset.left + w / 2, y: h / 2 };
        const here = { x: followed.shown.x * v.k + v.x, y: followed.shown.y * v.k + v.y };
        const k = 1 - Math.exp(-dt / 0.35);
        const [dx, dy] = [(want.x - here.x) * k, (want.y - here.y) * k];
        // the whole network repaints on every nudge, so ignore the sub-pixel ones
        if (Math.hypot(dx, dy) > 0.75) select(top).call(behaviour.translateBy, dx / v.k, dy / v.k);
      }
      if (dirty || morphing || lens.fade < 1) {
        const network = paintNetwork(baseCtx, view(), layout, palette, lens, closed, inset);
        [stationHits, labels] = [network.hits, network.labels];
        dirty = false;
      }
      trainHits = paintTrains(
        topCtx,
        view(),
        layout,
        palette,
        lens,
        live.fleet.trains.values(),
        calm ? 0 : now / 260,
        you
      );
      // names would only smear about while the map moves, so they step out and back
      const named = (1 - 2 * morphAt(now)) ** 2;
      if (lens.fade < 1) paintLabels(topCtx, palette, outgoing, (1 - lens.fade) * named);
      paintLabels(topCtx, palette, labels, lens.fade * named);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      density.removeEventListener('change', onDensity);
      select(top).on('.zoom', null);
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="map"
  bind:this={wrap}
  tabindex="0"
  role="region"
  aria-roledescription="map"
  aria-label={label}
  aria-describedby="map-keys"
  {onkeydown}
>
  <p id="map-keys" class="visually-hidden">
    {t.map.keys}
  </p>
  <canvas bind:this={base} aria-hidden="true"></canvas>
  <canvas
    bind:this={top}
    class="live"
    aria-hidden="true"
    onclick={(event) => onpick(pickAt(pointer(event)))}
    onpointermove={(event) => {
      if (event.buttons) return;
      top.style.cursor = pickAt(pointer(event)) ? 'pointer' : '';
    }}
  ></canvas>
</div>

<style>
  .map {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--paper);
    touch-action: none;

    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .live {
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
    }

    &:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: -3px;
    }
  }
</style>

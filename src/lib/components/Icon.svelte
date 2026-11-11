<script lang="ts" module>
  const PATHS = {
    search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm4.8 11.3L20 20',
    info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 7v7m0-10.2v.2',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7',
    minus: 'M5 12h14',
    locate: 'M12 4v3m0 10v3M4 12h3m10 0h3M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
    close: 'M6 6l12 12M18 6 6 18',
    menu: 'M4 7h16M4 12h16M4 17h16',
    back: 'M15 5l-7 7 7 7',
    forward: 'M9 5l7 7-7 7',
    roundel: 'M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12ZM3 12h18',
    // a line splitting off another, as down a line's own page
    branch: 'M8 3v18M8 6c0 5 8 4 8 9v6',
    // station facilities, after TfL's own pictograms
    rings: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z',
    wheelchair:
      'M10 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8v5h6l2.5 5.5M10 10.5h5M7 10.5a5.5 5.5 0 1 0 7.8 7.2',
    lift: 'M6 3h12v18H6ZM9.5 10 12 7.5l2.5 2.5M9.5 14l2.5 2.5 2.5-2.5',
    escalator: 'M3 19h4.5L17 9h4M11.5 14.5 13 8.5M13.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
    toilets:
      'M7 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 9v12M5 9h4M17 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM17 9l2.5 7h-5ZM17 16v5M12 3v18',
    wifi: 'M2 8.8a15 15 0 0 1 20 0M5 12.9a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01',
    pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11ZM12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z',
    centre: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5m8-6a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
    down: 'M6 9l6 6 6-6',
    follow: 'M12 3l7 18-7-4-7 4 7-18Z',
    settings:
      'M18.9 13.1L21.1 14.7A9.5 9.5 0 0 1 18.9 18.6L16.4 17.4A7 7 0 0 1 14.5 18.6L14.3 21.2A9.5 9.5 0 0 1 9.7 21.2L9.5 18.6A7 7 0 0 1 7.6 17.4L5.1 18.6A9.5 9.5 0 0 1 2.9 14.7L5.1 13.1A7 7 0 0 1 5.1 10.9L2.9 9.3A9.5 9.5 0 0 1 5.1 5.4L7.6 6.6A7 7 0 0 1 9.5 5.4L9.7 2.8A9.5 9.5 0 0 1 14.3 2.8L14.5 5.4A7 7 0 0 1 16.4 6.6L18.9 5.4A9.5 9.5 0 0 1 21.1 9.3L18.9 10.9A7 7 0 0 1 18.9 13.1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    sun: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
    map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
    tube: 'M3 12h6m6 0h6M5.6 18.4l4.3-4.3m4.2-4.2 4.3-4.3M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    github:
      'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-7A5.4 5.4 0 0 0 20 4.8 5.1 5.1 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5.1 5.1 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.8c0 5.4 3.3 6.6 6.4 7A3.4 3.4 0 0 0 9 18.1V22'
  };

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>

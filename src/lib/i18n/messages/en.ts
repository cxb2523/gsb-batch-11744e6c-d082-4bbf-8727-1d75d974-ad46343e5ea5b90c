import type { Plural } from '../locales.js';

const en = {
  title: 'Live London Underground map',
  about: 'About',
  close: 'Close',
  waiting: 'Waiting for TfL…',
  closures: 'Planned closures',
  checkFront: 'Check front of train',
  due: 'Due',
  minutes: (n: number) => `${n} min`,
  seconds: (n: number) => `${n} sec`,
  trains: { one: '# train', other: '# trains' } as Plural,
  feed: {
    connecting: 'Connecting',
    unreachable: "Can't reach TfL",
    behind: (time: string) => `${time} behind`,
    catchingUp: 'Catching up',
    live: 'Live'
  },
  where: {
    at: (station: string) => `At ${station}`,
    approaching: (station: string) => `Approaching ${station}`,
    between: (from: string, to: string) => `Between ${from} and ${to}`
  },
  map: {
    label: {
      one: 'Map of the London Underground with # train moving live',
      other: 'Map of the London Underground with # trains moving live'
    } as Plural,
    keys: 'Arrow keys move the map, plus and minus zoom. The line list, search and station boards have everything the map shows.',
    station: (station: string) =>
      `Live map around ${station}, with its own lines and trains picked out`,
    line: (line: string) => `Live map of the ${line}, with its trains picked out`
  },
  page: {
    search: 'Search',
    settings: 'Settings',
    map: 'Map',
    menu: 'Menu',
    skip: 'Skip to content',
    trail: 'Breadcrumb',
    liveMap: 'Live map',
    openOnMap: 'Open on the live map',
    aboutMap: 'About this map',
    details: 'Details',
    back: 'Back to all lines',
    allLines: 'All lines',
    style: 'Tube map',
    toGeographic: 'Show the real geography',
    toSchematic: 'Show the tube map',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    locate: 'Show where I am'
  },
  notice: {
    unsupported: "This browser can't share your location",
    noLines: 'Switch some lines on to find your nearest station',
    far: (km: number) => `You're ${km} km from the nearest station`,
    failed: "Couldn't get your location"
  },
  board: {
    lines: 'Lines',
    checking: 'Checking',
    onMap: 'On the map',
    none: 'No lines',
    only: (mode: string) => `${mode} only`,
    every: 'Every line'
  },
  line: {
    checking: 'Checking the status',
    running: { one: '# train running', other: '# trains running' } as Plural,
    to: (place: string) => `To ${place}`,
    trainsTo: (place: string) => `Trains to ${place}`,
    page: 'Line page'
  },
  station: {
    lines: 'Lines',
    platform: 'Platform',
    platformOf: (line: string, platform: string) => `${line} line, ${platform}`,
    terminating: 'No departures listed, only trains finishing here.',
    arrivingNow: 'The next one arrives now.',
    arrivingIn: (time: string) => `The next one arrives in ${time}.`,
    none: 'No trains due here at the moment.',
    page: 'Station page',
    terminatingHere: 'Terminating here',
    departures: 'Departures',
    notices: 'Station notices',
    status: 'Line status',
    firstLast: 'First and last trains',
    first: 'First',
    last: 'Last',
    allNight: 'All night',
    via: (place: string) => `via ${place}`,
    destination: 'Destination',
    noTimes: 'No times from TfL for this day',
    busy: 'Busy times',
    day: 'Day',
    busiest: (time: string) => `Usually busiest around ${time}`,
    crowding: {
      quieter: 'Quieter than usual right now',
      usual: 'About as busy as usual right now',
      busier: 'Busier than usual right now'
    },
    now: 'Now',
    around: 'Getting around',
    next: 'Next stops',
    nearby: 'A short walk away',
    recentre: 'Back to the station'
  },
  facts: {
    title: 'Facilities',
    zone: 'Zone',
    night: 'Night Tube',
    lifts: 'Lifts',
    escalators: 'Escalators',
    byLift: 'By lift',
    access: 'Step-free access',
    toilets: 'Toilets',
    wifi: 'Wi-Fi',
    address: 'Address',
    yes: 'Yes',
    no: 'No'
  },
  stations: {
    title: 'Stations',
    heading: 'Every station, A to Z',
    intro: (count: string) =>
      `All ${count} stations on the map, each with its live departures, busy times and the trains on the way.`,
    letters: 'Jump to a letter'
  },
  lines: {
    title: 'Lines',
    heading: 'Live TfL line status',
    intro: 'Real-time status across the TfL network. Click a line for live stats.',
    between: (places: string) => `Runs between ${places}`,
    length: 'Length',
    interchanges: 'Interchanges',
    zones: 'Zones',
    now: 'Trains now',
    hint: "Trains move along it live, pointing the way they're heading. Pick one to see where it's going.",
    branch: (to: string) => `Branch to ${to}`,
    loop: (via: string, at: string) => `Via ${via}, rejoining at ${at}`,
    train: (to: string, where: string) => `${to}. ${where}`,
    trains: 'Trains by destination',
    others: 'Other lines',
    recentre: 'Back to the whole line'
  },
  summary: {
    checking: 'Checking how every line is running…',
    every: 'Good service on every line.',
    rest: 'Good service on all other lines.',
    idle: 'No trains are running right now.',
    lines: { one: 'the # line', other: 'the # lines' } as Plural,
    dlr: 'the DLR',
    tram: 'London Trams',
    count: { one: '# line', other: '# lines' } as Plural,
    none: (lines: string) => `No service on ${lines}.`,
    part: (lines: string) => `No service on part of ${lines}.`,
    severe: (lines: string) => `Severe delays on ${lines}.`,
    reduced: (lines: string) => `Reduced service on ${lines}.`,
    minor: (lines: string) => `Minor delays on ${lines}.`,
    disruption: (lines: string) => `Disruption on ${lines}.`,
    closed: (lines: string) => `No trains on ${lines} right now.`,
    good: (lines: string) => `Good service on ${lines}.`
  },
  train: {
    gone: "That train's gone",
    goneWhy: "TfL has stopped reporting it, so it's probably reached the end of the line.",
    to: (place: string) => `to ${place}`,
    unknown: 'train, check the front for where to',
    follow: 'Follow this train',
    following: 'Following this train',
    stops: 'Next stops'
  },
  search: {
    line: (name: string) => `${name} line`,
    kind: 'Line',
    find: 'Find a station or line',
    close: 'Close search',
    matches: 'Matches',
    nothing: 'Nothing on the Underground called that.'
  },
  settings: {
    title: 'Settings',
    general: 'General',
    map: 'Map',
    accessibility: 'Accessibility',
    privacy: 'Privacy',
    theme: { label: 'Theme', hint: 'Matches your device until you pick one' },
    light: 'Light',
    dark: 'Dark',
    language: { label: 'Language', hint: 'Matches your device until you pick one' },
    layout: { label: 'Layout' },
    schematic: 'Tube map',
    geographic: 'Geographic',
    zoom: { label: 'Zoom' },
    modes: { label: 'Lines on the map' },
    locate: { label: 'Show where I am', hint: 'Your location never leaves your device' },
    refresh: { label: 'Update every', hint: 'Less often uses less data' },
    calm: { label: 'Reduce motion', hint: 'Fewer animations, and no gliding map' },
    contrast: { label: 'More contrast', hint: 'Stronger text and borders' },
    shortcuts: { label: 'Keyboard shortcuts', hint: 'Press / to search' },
    analytics: {
      label: 'Usage analytics',
      hint: 'Plausible counts visits, with no cookies or personal data'
    },
    errors: {
      label: 'Error reports',
      hint: 'A redacted report when something breaks, so we can fix it'
    },
    clear: { label: 'Clear all data', hint: 'Resets everything saved in this browser' },
    clearButton: 'Clear',
    cleared: 'Cleared',
    clearedAll: 'Everything has been cleared'
  },
  error: {
    lost: 'Not on the map',
    broken: 'Something went wrong',
    noTrains: 'No trains call here',
    outOfService: 'Not in service',
    missing: "That page isn't on the map.",
    back: 'Back to the live map'
  }
};

export type Messages = typeof en;
export default en;

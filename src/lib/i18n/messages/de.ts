import type { Messages } from './en.js';

export default {
  title: 'Live-Karte der Londoner U-Bahn',
  about: 'Über',
  close: 'Schließen',
  waiting: 'Warte auf TfL…',
  closures: 'Geplante Sperrungen',
  checkFront: 'Ziel am Zug ablesen',
  due: 'Sofort',
  minutes: (n: number) => `${n} Min.`,
  seconds: (n: number) => `${n} Sek.`,
  trains: { one: '# Zug', other: '# Züge' },
  feed: {
    connecting: 'Verbinden',
    unreachable: 'TfL nicht erreichbar',
    behind: (time: string) => `${time} verzögert`,
    catchingUp: 'Wird aktualisiert',
    live: 'Live'
  },
  where: {
    at: (station: string) => `In ${station}`,
    approaching: (station: string) => `Kurz vor ${station}`,
    between: (from: string, to: string) => `Zwischen ${from} und ${to}`
  },
  map: {
    label: {
      one: 'Karte der Londoner U-Bahn mit # Zug live in Bewegung',
      other: 'Karte der Londoner U-Bahn mit # Zügen live in Bewegung'
    },
    keys: 'Pfeiltasten verschieben die Karte, Plus und Minus zoomen. Linienliste, Suche und Stationstafeln zeigen alles, was auch die Karte zeigt.',
    station: (station: string) =>
      `Live-Karte rund um ${station}, mit ihren Linien und Zügen hervorgehoben`,
    line: (line: string) => `Live-Karte: ${line} und ihre Züge`
  },
  page: {
    search: 'Suchen',
    settings: 'Einstellungen',
    map: 'Karte',
    menu: 'Menü',
    skip: 'Zum Inhalt springen',
    trail: 'Brotkrumennavigation',
    liveMap: 'Live-Karte',
    openOnMap: 'Auf der Live-Karte öffnen',
    aboutMap: 'Über diese Karte',
    details: 'Details',
    back: 'Zurück zu allen Linien',
    allLines: 'Alle Linien',
    style: 'Netzplan',
    toGeographic: 'Echte Geografie zeigen',
    toSchematic: 'Netzplan zeigen',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    locate: 'Meinen Standort zeigen'
  },
  notice: {
    unsupported: 'Dieser Browser kann deinen Standort nicht teilen',
    noLines: 'Schalte Linien ein, um die nächste Station zu finden',
    far: (km: number) => `Du bist ${km} km von der nächsten Station entfernt`,
    failed: 'Standort konnte nicht ermittelt werden'
  },
  board: {
    lines: 'Linien',
    checking: 'Wird geprüft',
    onMap: 'Auf der Karte',
    none: 'Keine Linien',
    only: (mode: string) => `Nur ${mode}`,
    every: 'Alle Linien'
  },
  line: {
    checking: 'Status wird geprüft',
    running: { one: '# Zug unterwegs', other: '# Züge unterwegs' },
    to: (place: string) => `Nach ${place}`,
    trainsTo: (place: string) => `Züge nach ${place}`,
    page: 'Linienseite'
  },
  station: {
    lines: 'Linien',
    platform: 'Bahnsteig',
    platformOf: (line: string, platform: string) => `${line}-Linie, ${platform}`,
    terminating: 'Keine Abfahrten, nur Züge, die hier enden.',
    arrivingNow: 'Der nächste kommt jetzt an.',
    arrivingIn: (time: string) => `Der nächste kommt in ${time} an.`,
    none: 'Gerade sind hier keine Züge angekündigt.',
    page: 'Stationsseite',
    terminatingHere: 'Endet hier',
    departures: 'Abfahrten',
    notices: 'Hinweise zur Station',
    status: 'Linienstatus',
    firstLast: 'Erste und letzte Züge',
    first: 'Erster',
    last: 'Letzter',
    allNight: 'Die ganze Nacht',
    via: (place: string) => `über ${place}`,
    destination: 'Ziel',
    noTimes: 'Keine Zeiten von TfL für diesen Tag',
    busy: 'Stoßzeiten',
    day: 'Tag',
    busiest: (time: string) => `Meist am vollsten gegen ${time}`,
    crowding: {
      quieter: 'Gerade weniger los als sonst',
      usual: 'Gerade so viel los wie sonst',
      busier: 'Gerade mehr los als sonst'
    },
    now: 'Jetzt',
    around: 'Umgebung',
    next: 'Nächste Halte',
    nearby: 'Zu Fuß erreichbar',
    recentre: 'Zurück zur Station'
  },
  facts: {
    title: 'Ausstattung',
    zone: 'Zone',
    night: 'Night Tube',
    lifts: 'Aufzüge',
    escalators: 'Rolltreppen',
    byLift: 'Per Aufzug',
    access: 'Stufenloser Zugang',
    toilets: 'Toiletten',
    wifi: 'WLAN',
    address: 'Adresse',
    yes: 'Ja',
    no: 'Nein'
  },
  stations: {
    title: 'Stationen',
    heading: 'Alle Stationen von A bis Z',
    intro: (count: string) =>
      `Alle ${count} Stationen der Karte, jede mit Live-Abfahrten, Stoßzeiten und den Zügen auf dem Weg.`,
    letters: 'Zu einem Buchstaben springen'
  },
  lines: {
    title: 'Linien',
    heading: 'TfL-Linienstatus live',
    intro: 'Echtzeitstatus für das gesamte TfL-Netz. Klicke auf eine Linie für Live-Statistiken.',
    between: (places: string) => `Fährt zwischen ${places}`,
    length: 'Länge',
    interchanges: 'Umstiege',
    zones: 'Zonen',
    now: 'Züge jetzt',
    hint: 'Die Züge bewegen sich live und zeigen in ihre Fahrtrichtung. Wähle einen, um zu sehen, wohin er fährt.',
    branch: (to: string) => `Abzweig nach ${to}`,
    loop: (via: string, at: string) => `Über ${via}, trifft in ${at} wieder auf die Linie`,
    train: (to: string, where: string) => `${to}. ${where}`,
    trains: 'Züge nach Ziel',
    others: 'Andere Linien',
    recentre: 'Zurück zur ganzen Linie'
  },
  summary: {
    checking: 'Prüfe, wie jede Linie fährt…',
    every: 'Normaler Betrieb auf allen Linien.',
    rest: 'Normaler Betrieb auf allen anderen Linien.',
    idle: 'Derzeit fahren keine Züge.',
    lines: { one: 'auf der Linie #', other: 'auf den Linien #' },
    dlr: 'auf der DLR',
    tram: 'bei der Straßenbahn',
    count: { one: 'auf # Linie', other: 'auf # Linien' },
    none: (lines: string) => `Kein Betrieb ${lines}.`,
    part: (lines: string) => `Teilweise kein Betrieb ${lines}.`,
    severe: (lines: string) => `Starke Verspätungen ${lines}.`,
    reduced: (lines: string) => `Eingeschränkter Betrieb ${lines}.`,
    minor: (lines: string) => `Leichte Verspätungen ${lines}.`,
    disruption: (lines: string) => `Störungen ${lines}.`,
    closed: (lines: string) => `Derzeit keine Züge ${lines}.`,
    good: (lines: string) => `Normaler Betrieb ${lines}.`
  },
  train: {
    gone: 'Dieser Zug ist weg',
    goneWhy: 'TfL meldet ihn nicht mehr, er hat also wohl die Endstation erreicht.',
    to: (place: string) => `nach ${place}`,
    unknown: '– Ziel am Zug ablesen',
    follow: 'Diesem Zug folgen',
    following: 'Du folgst diesem Zug',
    stops: 'Nächste Halte'
  },
  search: {
    line: (name: string) => `${name}-Linie`,
    kind: 'Linie',
    find: 'Station oder Linie finden',
    close: 'Suche schließen',
    matches: 'Treffer',
    nothing: 'In der U-Bahn heißt nichts so.'
  },
  settings: {
    title: 'Einstellungen',
    general: 'Allgemein',
    map: 'Karte',
    accessibility: 'Barrierefreiheit',
    privacy: 'Datenschutz',
    theme: { label: 'Design', hint: 'Folgt deinem Gerät, bis du eins wählst' },
    light: 'Hell',
    dark: 'Dunkel',
    language: { label: 'Sprache', hint: 'Folgt deinem Gerät, bis du eine wählst' },
    layout: { label: 'Ansicht' },
    schematic: 'Netzplan',
    geographic: 'Geografisch',
    zoom: { label: 'Zoom' },
    modes: { label: 'Linien auf der Karte' },
    locate: { label: 'Meinen Standort zeigen', hint: 'Dein Standort verlässt nie dein Gerät' },
    refresh: { label: 'Aktualisieren alle', hint: 'Seltener braucht weniger Daten' },
    calm: { label: 'Weniger Bewegung', hint: 'Weniger Animationen und keine gleitende Karte' },
    contrast: { label: 'Mehr Kontrast', hint: 'Kräftigere Schrift und Ränder' },
    shortcuts: { label: 'Tastenkürzel', hint: 'Drücke / zum Suchen' },
    analytics: {
      label: 'Nutzungsstatistik',
      hint: 'Plausible zählt Besuche, ohne Cookies oder persönliche Daten'
    },
    errors: {
      label: 'Fehlerberichte',
      hint: 'Ein bereinigter Bericht, wenn etwas kaputtgeht, damit wir es beheben können'
    },
    clear: {
      label: 'Alle Daten löschen',
      hint: 'Setzt alles zurück, was dieser Browser gespeichert hat'
    },
    clearButton: 'Löschen',
    cleared: 'Gelöscht',
    clearedAll: 'Alles wurde gelöscht'
  },
  error: {
    lost: 'Nicht auf der Karte',
    broken: 'Etwas ist schiefgelaufen',
    noTrains: 'Hier hält kein Zug',
    outOfService: 'Nicht in Betrieb',
    missing: 'Diese Seite ist nicht auf der Karte.',
    back: 'Zurück zur Live-Karte'
  }
} satisfies Messages;

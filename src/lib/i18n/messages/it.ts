import type { Messages } from './en.js';

export default {
  title: 'Mappa in tempo reale della metropolitana di Londra',
  about: 'Informazioni',
  close: 'Chiudi',
  waiting: 'In attesa di TfL…',
  closures: 'Chiusure programmate',
  checkFront: 'Controlla il frontale del treno',
  due: 'In arrivo',
  minutes: (n: number) => `${n} min`,
  seconds: (n: number) => `${n} s`,
  trains: { one: '# treno', other: '# treni' },
  feed: {
    connecting: 'Connessione',
    unreachable: 'TfL non raggiungibile',
    behind: (time: string) => `${time} di ritardo`,
    catchingUp: 'Aggiornamento',
    live: 'In diretta'
  },
  where: {
    at: (station: string) => `A ${station}`,
    approaching: (station: string) => `In arrivo a ${station}`,
    between: (from: string, to: string) => `Tra ${from} e ${to}`
  },
  map: {
    label: {
      one: 'Mappa della metropolitana di Londra con # treno in movimento in tempo reale',
      other: 'Mappa della metropolitana di Londra con # treni in movimento in tempo reale'
    },
    keys: 'Le frecce spostano la mappa, più e meno cambiano lo zoom. L’elenco delle linee, la ricerca e i tabelloni delle stazioni hanno tutto ciò che mostra la mappa.',
    station: (station: string) =>
      `Mappa in tempo reale intorno a ${station}, con le sue linee e i suoi treni in evidenza`,
    line: (line: string) => `Mappa in diretta: ${line} e i suoi treni`
  },
  page: {
    search: 'Cerca',
    settings: 'Impostazioni',
    map: 'Mappa',
    menu: 'Menu',
    skip: 'Vai al contenuto',
    trail: 'Percorso di navigazione',
    liveMap: 'Mappa in tempo reale',
    openOnMap: 'Apri sulla mappa in tempo reale',
    aboutMap: 'Informazioni su questa mappa',
    details: 'Dettagli',
    back: 'Torna a tutte le linee',
    allLines: 'Tutte le linee',
    style: 'Mappa della metro',
    toGeographic: 'Mostra la geografia reale',
    toSchematic: 'Mostra la mappa della metro',
    zoomIn: 'Ingrandisci',
    zoomOut: 'Riduci',
    locate: 'Mostra dove sono'
  },
  notice: {
    unsupported: 'Questo browser non può condividere la tua posizione',
    noLines: 'Attiva qualche linea per trovare la stazione più vicina',
    far: (km: number) => `Sei a ${km} km dalla stazione più vicina`,
    failed: 'Impossibile ottenere la tua posizione'
  },
  board: {
    lines: 'Linee',
    checking: 'Verifica',
    onMap: 'Sulla mappa',
    none: 'Nessuna linea',
    only: (mode: string) => `Solo ${mode}`,
    every: 'Tutte le linee'
  },
  line: {
    checking: 'Verifica dello stato',
    running: { one: '# treno in servizio', other: '# treni in servizio' },
    to: (place: string) => `Per ${place}`,
    trainsTo: (place: string) => `Treni per ${place}`,
    page: 'Pagina della linea'
  },
  station: {
    lines: 'Linee',
    platform: 'Binario',
    platformOf: (line: string, platform: string) => `Linea ${line}, ${platform}`,
    terminating: 'Nessuna partenza in elenco, solo treni che terminano qui.',
    arrivingNow: 'Il prossimo arriva adesso.',
    arrivingIn: (time: string) => `Il prossimo arriva tra ${time}.`,
    none: 'Al momento non ci sono treni in arrivo qui.',
    page: 'Pagina della stazione',
    terminatingHere: 'Termina qui',
    departures: 'Partenze',
    notices: 'Avvisi della stazione',
    status: 'Stato delle linee',
    firstLast: 'Primi e ultimi treni',
    first: 'Primo',
    last: 'Ultimo',
    allNight: 'Tutta la notte',
    via: (place: string) => `via ${place}`,
    destination: 'Destinazione',
    noTimes: 'Nessun orario da TfL per questo giorno',
    busy: 'Affollamento',
    day: 'Giorno',
    busiest: (time: string) => `Di solito più affollata verso le ${time}`,
    crowding: {
      quieter: 'Meno gente del solito in questo momento',
      usual: 'Gente come al solito in questo momento',
      busier: 'Più gente del solito in questo momento'
    },
    now: 'Adesso',
    around: 'Nei dintorni',
    next: 'Prossime fermate',
    nearby: 'A due passi',
    recentre: 'Torna alla stazione'
  },
  facts: {
    title: 'Servizi',
    zone: 'Zona',
    night: 'Night Tube',
    lifts: 'Ascensori',
    escalators: 'Scale mobili',
    byLift: 'Con ascensore',
    access: 'Accesso senza gradini',
    toilets: 'Bagni',
    wifi: 'Wi-Fi',
    address: 'Indirizzo',
    yes: 'Sì',
    no: 'No'
  },
  stations: {
    title: 'Stazioni',
    heading: 'Tutte le stazioni, dalla A alla Z',
    intro: (count: string) =>
      `Tutte le ${count} stazioni della mappa, ognuna con partenze in tempo reale, affollamento e treni in arrivo.`,
    letters: 'Vai a una lettera'
  },
  lines: {
    title: 'Linee',
    heading: 'Stato delle linee TfL in tempo reale',
    intro:
      'Stato in tempo reale di tutta la rete TfL. Fai clic su una linea per le statistiche in diretta.',
    between: (places: string) => `Collega ${places}`,
    length: 'Lunghezza',
    interchanges: 'Interscambi',
    zones: 'Zone',
    now: 'Treni ora',
    hint: 'I treni si muovono in diretta, rivolti nella loro direzione di marcia. Scegline uno per vedere dove va.',
    branch: (to: string) => `Diramazione per ${to}`,
    loop: (via: string, at: string) => `Via ${via}, si ricongiunge alla linea a ${at}`,
    train: (to: string, where: string) => `${to}. ${where}`,
    trains: 'Treni per destinazione',
    others: 'Altre linee',
    recentre: 'Torna a tutta la linea'
  },
  summary: {
    checking: 'Verifica dello stato di ogni linea…',
    every: 'Servizio regolare su tutte le linee.',
    rest: 'Servizio regolare su tutte le altre linee.',
    idle: 'Al momento non circola nessun treno.',
    lines: { one: 'sulla linea #', other: 'sulle linee #' },
    dlr: 'sulla DLR',
    tram: 'sul tram',
    count: { one: 'su # linea', other: 'su # linee' },
    none: (lines: string) => `Servizio sospeso ${lines}.`,
    part: (lines: string) => `Servizio parzialmente sospeso ${lines}.`,
    severe: (lines: string) => `Forti ritardi ${lines}.`,
    reduced: (lines: string) => `Servizio ridotto ${lines}.`,
    minor: (lines: string) => `Lievi ritardi ${lines}.`,
    disruption: (lines: string) => `Disagi ${lines}.`,
    closed: (lines: string) => `Al momento nessun treno ${lines}.`,
    good: (lines: string) => `Servizio regolare ${lines}.`
  },
  train: {
    gone: 'Quel treno non c’è più',
    goneWhy: 'TfL ha smesso di segnalarlo, quindi probabilmente è arrivato al capolinea.',
    to: (place: string) => `per ${place}`,
    unknown: ': controlla la destinazione sul frontale',
    follow: 'Segui questo treno',
    following: 'Stai seguendo questo treno',
    stops: 'Prossime fermate'
  },
  search: {
    line: (name: string) => `Linea ${name}`,
    kind: 'Linea',
    find: 'Trova una stazione o una linea',
    close: 'Chiudi la ricerca',
    matches: 'Risultati',
    nothing: 'Niente con quel nome nella metropolitana.'
  },
  settings: {
    title: 'Impostazioni',
    general: 'Generali',
    map: 'Mappa',
    accessibility: 'Accessibilità',
    privacy: 'Privacy',
    theme: { label: 'Tema', hint: 'Segue il tuo dispositivo finché non ne scegli uno' },
    light: 'Chiaro',
    dark: 'Scuro',
    language: { label: 'Lingua', hint: 'Segue il tuo dispositivo finché non ne scegli una' },
    layout: { label: 'Vista' },
    schematic: 'Mappa della metro',
    geographic: 'Geografica',
    zoom: { label: 'Zoom' },
    modes: { label: 'Linee sulla mappa' },
    locate: { label: 'Mostra dove sono', hint: 'La tua posizione non lascia mai il dispositivo' },
    refresh: { label: 'Aggiorna ogni', hint: 'Meno spesso consuma meno dati' },
    calm: { label: 'Riduci il movimento', hint: 'Meno animazioni e niente mappa che scorre' },
    contrast: { label: 'Più contrasto', hint: 'Testo e bordi più marcati' },
    shortcuts: { label: 'Scorciatoie da tastiera', hint: 'Premi / per cercare' },
    analytics: {
      label: 'Statistiche d’uso',
      hint: 'Plausible conta le visite, senza cookie né dati personali'
    },
    errors: {
      label: 'Segnalazioni di errore',
      hint: 'Un rapporto anonimizzato quando qualcosa si rompe, così possiamo sistemarlo'
    },
    clear: {
      label: 'Cancella tutti i dati',
      hint: 'Azzera tutto ciò che è salvato in questo browser'
    },
    clearButton: 'Cancella',
    cleared: 'Cancellato',
    clearedAll: 'È stato cancellato tutto'
  },
  error: {
    lost: 'Fuori dalla mappa',
    broken: 'Qualcosa è andato storto',
    noTrains: 'Qui non ferma nessun treno',
    outOfService: 'Fuori servizio',
    missing: 'Quella pagina non è sulla mappa.',
    back: 'Torna alla mappa in tempo reale'
  }
} satisfies Messages;

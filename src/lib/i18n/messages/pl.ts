import type { Messages } from './en.js';

export default {
  title: 'Mapa londyńskiego metra na żywo',
  about: 'O mapie',
  close: 'Zamknij',
  waiting: 'Czekam na TfL…',
  closures: 'Planowane zamknięcia',
  checkFront: 'Sprawdź kierunek na pociągu',
  due: 'Wjeżdża',
  minutes: (n: number) => `${n} min`,
  seconds: (n: number) => `${n} s`,
  trains: { one: '# pociąg', few: '# pociągi', many: '# pociągów', other: '# pociągu' },
  feed: {
    connecting: 'Łączenie',
    unreachable: 'Brak połączenia z TfL',
    behind: (time: string) => `${time} opóźnienia`,
    catchingUp: 'Aktualizacja',
    live: 'Na żywo'
  },
  where: {
    at: (station: string) => `Na stacji ${station}`,
    approaching: (station: string) => `Dojeżdża do stacji ${station}`,
    between: (from: string, to: string) => `Między ${from} a ${to}`
  },
  map: {
    label: {
      one: 'Mapa londyńskiego metra z # pociągiem w ruchu na żywo',
      few: 'Mapa londyńskiego metra z # pociągami w ruchu na żywo',
      many: 'Mapa londyńskiego metra z # pociągami w ruchu na żywo',
      other: 'Mapa londyńskiego metra z # pociągu w ruchu na żywo'
    },
    keys: 'Strzałki przesuwają mapę, plus i minus zmieniają przybliżenie. Lista linii, wyszukiwarka i tablice stacji pokazują wszystko to, co mapa.',
    station: (station: string) =>
      `Mapa na żywo wokół stacji ${station}, z wyróżnionymi jej liniami i pociągami`,
    line: (line: string) => `Mapa na żywo: ${line} i jej pociągi`
  },
  page: {
    search: 'Szukaj',
    settings: 'Ustawienia',
    map: 'Mapa',
    menu: 'Menu',
    skip: 'Przejdź do treści',
    trail: 'Ścieżka nawigacji',
    liveMap: 'Mapa na żywo',
    openOnMap: 'Otwórz na mapie na żywo',
    aboutMap: 'O tej mapie',
    details: 'Szczegóły',
    back: 'Wróć do wszystkich linii',
    allLines: 'Wszystkie linie',
    style: 'Schemat metra',
    toGeographic: 'Pokaż prawdziwą geografię',
    toSchematic: 'Pokaż schemat metra',
    zoomIn: 'Przybliż',
    zoomOut: 'Oddal',
    locate: 'Pokaż, gdzie jestem'
  },
  notice: {
    unsupported: 'Ta przeglądarka nie może udostępnić twojej lokalizacji',
    noLines: 'Włącz jakieś linie, aby znaleźć najbliższą stację',
    far: (km: number) => `Do najbliższej stacji masz ${km} km`,
    failed: 'Nie udało się ustalić twojej lokalizacji'
  },
  board: {
    lines: 'Linie',
    checking: 'Sprawdzanie',
    onMap: 'Na mapie',
    none: 'Brak linii',
    only: (mode: string) => `Tylko ${mode}`,
    every: 'Wszystkie linie'
  },
  line: {
    checking: 'Sprawdzanie statusu',
    running: {
      one: '# pociąg w ruchu',
      few: '# pociągi w ruchu',
      many: '# pociągów w ruchu',
      other: '# pociągu w ruchu'
    },
    to: (place: string) => `Kierunek ${place}`,
    trainsTo: (place: string) => `Pociągi w kierunku ${place}`,
    page: 'Strona linii'
  },
  station: {
    lines: 'Linie',
    platform: 'Peron',
    platformOf: (line: string, platform: string) => `Linia ${line}, ${platform}`,
    terminating: 'Brak odjazdów, tylko pociągi kończące tu bieg.',
    arrivingNow: 'Następny przyjeżdża teraz.',
    arrivingIn: (time: string) => `Następny przyjedzie za ${time}.`,
    none: 'W tej chwili nie ma tu żadnych pociągów.',
    page: 'Strona stacji',
    terminatingHere: 'Kończą bieg tutaj',
    departures: 'Odjazdy',
    notices: 'Komunikaty stacji',
    status: 'Stan linii',
    firstLast: 'Pierwsze i ostatnie pociągi',
    first: 'Pierwszy',
    last: 'Ostatni',
    allNight: 'Całą noc',
    via: (place: string) => `przez ${place}`,
    destination: 'Kierunek',
    noTimes: 'Brak godzin od TfL na ten dzień',
    busy: 'Natężenie ruchu',
    day: 'Dzień',
    busiest: (time: string) => `Zwykle najwięcej osób około ${time}`,
    crowding: {
      quieter: 'Teraz mniej osób niż zwykle',
      usual: 'Teraz tyle osób co zwykle',
      busier: 'Teraz więcej osób niż zwykle'
    },
    now: 'Teraz',
    around: 'Okolica',
    next: 'Następne przystanki',
    nearby: 'Kilka minut pieszo',
    recentre: 'Wróć do stacji'
  },
  facts: {
    title: 'Udogodnienia',
    zone: 'Strefa',
    night: 'Night Tube',
    lifts: 'Windy',
    escalators: 'Schody ruchome',
    byLift: 'Windą',
    access: 'Dostęp bez schodów',
    toilets: 'Toalety',
    wifi: 'Wi-Fi',
    address: 'Adres',
    yes: 'Tak',
    no: 'Nie'
  },
  stations: {
    title: 'Stacje',
    heading: 'Wszystkie stacje od A do Z',
    intro: (count: string) =>
      `Wszystkie stacje na mapie (${count}), każda z odjazdami na żywo, natężeniem ruchu i pociągami w drodze.`,
    letters: 'Przejdź do litery'
  },
  lines: {
    title: 'Linie',
    heading: 'Status linii TfL na żywo',
    intro:
      'Status całej sieci TfL w czasie rzeczywistym. Kliknij linię, aby zobaczyć statystyki na żywo.',
    between: (places: string) => `Kursuje na trasie: ${places}`,
    length: 'Długość',
    interchanges: 'Przesiadki',
    zones: 'Strefy',
    now: 'Pociągi teraz',
    hint: 'Pociągi poruszają się na żywo i wskazują kierunek jazdy. Wybierz jeden, aby zobaczyć, dokąd jedzie.',
    branch: (to: string) => `Odgałęzienie: ${to}`,
    loop: (via: string, at: string) => `Przez ${via}, łączy się z linią na stacji ${at}`,
    train: (to: string, where: string) => `${to}. ${where}`,
    trains: 'Pociągi według celu',
    others: 'Inne linie',
    recentre: 'Wróć do całej linii'
  },
  summary: {
    checking: 'Sprawdzanie, jak kursują wszystkie linie…',
    every: 'Ruch bez zakłóceń na wszystkich liniach.',
    rest: 'Na pozostałych liniach ruch bez zakłóceń.',
    idle: 'Obecnie nie kursują żadne pociągi.',
    lines: { one: 'na linii #', few: 'na liniach #', many: 'na liniach #', other: 'na liniach #' },
    dlr: 'na DLR',
    tram: 'w sieci tramwajowej',
    count: { one: 'na # linii', few: 'na # liniach', many: 'na # liniach', other: 'na # linii' },
    none: (lines: string) => `Ruch wstrzymany ${lines}.`,
    part: (lines: string) => `Ruch częściowo wstrzymany ${lines}.`,
    severe: (lines: string) => `Duże opóźnienia ${lines}.`,
    reduced: (lines: string) => `Ograniczona liczba kursów ${lines}.`,
    minor: (lines: string) => `Niewielkie opóźnienia ${lines}.`,
    disruption: (lines: string) => `Utrudnienia ${lines}.`,
    closed: (lines: string) => `Obecnie brak pociągów ${lines}.`,
    good: (lines: string) => `Ruch bez zakłóceń ${lines}.`
  },
  train: {
    gone: 'Tego pociągu już nie ma',
    goneWhy: 'TfL przestało go zgłaszać, więc pewnie dojechał do końca linii.',
    to: (place: string) => `w kierunku ${place}`,
    unknown: ': kierunek sprawdź na pociągu',
    follow: 'Śledź ten pociąg',
    following: 'Śledzisz ten pociąg',
    stops: 'Następne stacje'
  },
  search: {
    line: (name: string) => `Linia ${name}`,
    kind: 'Linia',
    find: 'Znajdź stację lub linię',
    close: 'Zamknij wyszukiwanie',
    matches: 'Wyniki',
    nothing: 'W metrze nic się tak nie nazywa.'
  },
  settings: {
    title: 'Ustawienia',
    general: 'Ogólne',
    map: 'Mapa',
    accessibility: 'Dostępność',
    privacy: 'Prywatność',
    theme: { label: 'Motyw', hint: 'Taki jak na urządzeniu, dopóki nie wybierzesz' },
    light: 'Jasny',
    dark: 'Ciemny',
    language: { label: 'Język', hint: 'Taki jak na urządzeniu, dopóki nie wybierzesz' },
    layout: { label: 'Układ' },
    schematic: 'Schemat metra',
    geographic: 'Geograficzny',
    zoom: { label: 'Przybliżenie' },
    modes: { label: 'Linie na mapie' },
    locate: {
      label: 'Pokaż, gdzie jestem',
      hint: 'Twoja lokalizacja nigdy nie opuszcza urządzenia'
    },
    refresh: { label: 'Odświeżaj co', hint: 'Rzadziej to mniej danych' },
    calm: { label: 'Ogranicz ruch', hint: 'Mniej animacji i mapa bez płynnego przesuwania' },
    contrast: { label: 'Większy kontrast', hint: 'Wyraźniejszy tekst i obramowania' },
    shortcuts: { label: 'Skróty klawiszowe', hint: 'Naciśnij /, aby wyszukać' },
    analytics: {
      label: 'Statystyki użycia',
      hint: 'Plausible liczy odwiedziny, bez ciasteczek i danych osobowych'
    },
    errors: {
      label: 'Raporty błędów',
      hint: 'Zanonimizowany raport, gdy coś się zepsuje, żebyśmy mogli to naprawić'
    },
    clear: {
      label: 'Wyczyść wszystkie dane',
      hint: 'Resetuje wszystko, co zapisano w tej przeglądarce'
    },
    clearButton: 'Wyczyść',
    cleared: 'Wyczyszczono',
    clearedAll: 'Wszystko zostało wyczyszczone'
  },
  error: {
    lost: 'Poza mapą',
    broken: 'Coś poszło nie tak',
    noTrains: 'Żaden pociąg się tu nie zatrzymuje',
    outOfService: 'Nieczynne',
    missing: 'Tej strony nie ma na mapie.',
    back: 'Wróć do mapy na żywo'
  }
} satisfies Messages;

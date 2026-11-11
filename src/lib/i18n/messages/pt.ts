import type { Messages } from './en.js';

export default {
  title: 'Mapa ao vivo do metrô de Londres',
  about: 'Sobre',
  close: 'Fechar',
  waiting: 'Aguardando a TfL…',
  closures: 'Fechamentos programados',
  checkFront: 'Veja a frente do trem',
  due: 'Chegando',
  minutes: (n: number) => `${n} min`,
  seconds: (n: number) => `${n} s`,
  trains: { one: '# trem', other: '# trens' },
  feed: {
    connecting: 'Conectando',
    unreachable: 'Sem acesso à TfL',
    behind: (time: string) => `${time} de atraso`,
    catchingUp: 'Atualizando',
    live: 'Ao vivo'
  },
  where: {
    at: (station: string) => `Em ${station}`,
    approaching: (station: string) => `Chegando a ${station}`,
    between: (from: string, to: string) => `Entre ${from} e ${to}`
  },
  map: {
    label: {
      one: 'Mapa do metrô de Londres com # trem circulando ao vivo',
      other: 'Mapa do metrô de Londres com # trens circulando ao vivo'
    },
    keys: 'As setas movem o mapa, mais e menos mudam o zoom. A lista de linhas, a busca e os painéis das estações têm tudo o que o mapa mostra.',
    station: (station: string) =>
      `Mapa ao vivo em torno de ${station}, com suas linhas e trens em destaque`,
    line: (line: string) => `Mapa ao vivo: ${line} e seus trens`
  },
  page: {
    search: 'Buscar',
    settings: 'Configurações',
    map: 'Mapa',
    menu: 'Menu',
    skip: 'Pular para o conteúdo',
    trail: 'Navegação estrutural',
    liveMap: 'Mapa ao vivo',
    openOnMap: 'Abrir no mapa ao vivo',
    aboutMap: 'Sobre este mapa',
    details: 'Detalhes',
    back: 'Voltar para todas as linhas',
    allLines: 'Todas as linhas',
    style: 'Mapa do metrô',
    toGeographic: 'Mostrar a geografia real',
    toSchematic: 'Mostrar o mapa do metrô',
    zoomIn: 'Aproximar',
    zoomOut: 'Afastar',
    locate: 'Mostrar onde estou'
  },
  notice: {
    unsupported: 'Este navegador não consegue compartilhar sua localização',
    noLines: 'Ative algumas linhas para encontrar a estação mais próxima',
    far: (km: number) => `Você está a ${km} km da estação mais próxima`,
    failed: 'Não foi possível obter sua localização'
  },
  board: {
    lines: 'Linhas',
    checking: 'Verificando',
    onMap: 'No mapa',
    none: 'Nenhuma linha',
    only: (mode: string) => `Só ${mode}`,
    every: 'Todas as linhas'
  },
  line: {
    checking: 'Verificando a situação',
    running: { one: '# trem circulando', other: '# trens circulando' },
    to: (place: string) => `Para ${place}`,
    trainsTo: (place: string) => `Trens para ${place}`,
    page: 'Página da linha'
  },
  station: {
    lines: 'Linhas',
    platform: 'Plataforma',
    platformOf: (line: string, platform: string) => `Linha ${line}, ${platform}`,
    terminating: 'Nenhuma partida listada, só trens que terminam aqui.',
    arrivingNow: 'O próximo chega agora.',
    arrivingIn: (time: string) => `O próximo chega em ${time}.`,
    none: 'Nenhum trem previsto aqui no momento.',
    page: 'Página da estação',
    terminatingHere: 'Termina aqui',
    departures: 'Partidas',
    notices: 'Avisos da estação',
    status: 'Situação das linhas',
    firstLast: 'Primeiros e últimos trens',
    first: 'Primeiro',
    last: 'Último',
    allNight: 'A noite toda',
    via: (place: string) => `via ${place}`,
    destination: 'Destino',
    noTimes: 'Sem horários da TfL para este dia',
    busy: 'Movimento',
    day: 'Dia',
    busiest: (time: string) => `Geralmente mais cheia por volta das ${time}`,
    crowding: {
      quieter: 'Menos movimento que o normal agora',
      usual: 'Movimento normal agora',
      busier: 'Mais movimento que o normal agora'
    },
    now: 'Agora',
    around: 'Arredores',
    next: 'Próximas paradas',
    nearby: 'A uma curta caminhada',
    recentre: 'Voltar para a estação'
  },
  facts: {
    title: 'Instalações',
    zone: 'Zona',
    night: 'Night Tube',
    lifts: 'Elevadores',
    escalators: 'Escadas rolantes',
    byLift: 'Por elevador',
    access: 'Acesso sem degraus',
    toilets: 'Banheiros',
    wifi: 'Wi-Fi',
    address: 'Endereço',
    yes: 'Sim',
    no: 'Não'
  },
  stations: {
    title: 'Estações',
    heading: 'Todas as estações, de A a Z',
    intro: (count: string) =>
      `Todas as ${count} estações do mapa, cada uma com partidas ao vivo, movimento e os trens a caminho.`,
    letters: 'Ir para uma letra'
  },
  lines: {
    title: 'Linhas',
    heading: 'Situação das linhas da TfL ao vivo',
    intro:
      'Situação em tempo real de toda a rede da TfL. Clique em uma linha para ver estatísticas ao vivo.',
    between: (places: string) => `Liga ${places}`,
    length: 'Extensão',
    interchanges: 'Conexões',
    zones: 'Zonas',
    now: 'Trens agora',
    hint: 'Os trens se movem ao vivo, apontando para onde estão indo. Escolha um para ver para onde ele vai.',
    branch: (to: string) => `Ramal para ${to}`,
    loop: (via: string, at: string) => `Por ${via}, volta à linha em ${at}`,
    train: (to: string, where: string) => `${to}. ${where}`,
    trains: 'Trens por destino',
    others: 'Outras linhas',
    recentre: 'Voltar para a linha inteira'
  },
  summary: {
    checking: 'Verificando como está cada linha…',
    every: 'Operação normal em todas as linhas.',
    rest: 'Operação normal nas demais linhas.',
    idle: 'Nenhum trem está circulando no momento.',
    lines: { one: 'na linha #', other: 'nas linhas #' },
    dlr: 'no DLR',
    tram: 'no bonde',
    count: { one: 'em # linha', other: 'em # linhas' },
    none: (lines: string) => `Operação interrompida ${lines}.`,
    part: (lines: string) => `Operação parcialmente interrompida ${lines}.`,
    severe: (lines: string) => `Atrasos graves ${lines}.`,
    reduced: (lines: string) => `Serviço reduzido ${lines}.`,
    minor: (lines: string) => `Pequenos atrasos ${lines}.`,
    disruption: (lines: string) => `Problemas ${lines}.`,
    closed: (lines: string) => `Nenhum trem ${lines} no momento.`,
    good: (lines: string) => `Operação normal ${lines}.`
  },
  train: {
    gone: 'Esse trem sumiu',
    goneWhy: 'A TfL parou de informar sobre ele, então ele provavelmente chegou ao fim da linha.',
    to: (place: string) => `para ${place}`,
    unknown: ': veja o destino na frente do trem',
    follow: 'Seguir este trem',
    following: 'Seguindo este trem',
    stops: 'Próximas paradas'
  },
  search: {
    line: (name: string) => `Linha ${name}`,
    kind: 'Linha',
    find: 'Encontre uma estação ou linha',
    close: 'Fechar busca',
    matches: 'Resultados',
    nothing: 'Nada com esse nome no metrô.'
  },
  settings: {
    title: 'Configurações',
    general: 'Geral',
    map: 'Mapa',
    accessibility: 'Acessibilidade',
    privacy: 'Privacidade',
    theme: { label: 'Tema', hint: 'Segue o seu dispositivo até você escolher um' },
    light: 'Claro',
    dark: 'Escuro',
    language: { label: 'Idioma', hint: 'Segue o seu dispositivo até você escolher um' },
    layout: { label: 'Visualização' },
    schematic: 'Mapa do metrô',
    geographic: 'Geográfico',
    zoom: { label: 'Zoom' },
    modes: { label: 'Linhas no mapa' },
    locate: { label: 'Mostrar onde estou', hint: 'Sua localização nunca sai do seu dispositivo' },
    refresh: { label: 'Atualizar a cada', hint: 'Com menos frequência, usa menos dados' },
    calm: { label: 'Reduzir movimento', hint: 'Menos animações e um mapa que não desliza' },
    contrast: { label: 'Mais contraste', hint: 'Texto e bordas mais fortes' },
    shortcuts: { label: 'Atalhos de teclado', hint: 'Pressione / para buscar' },
    analytics: {
      label: 'Estatísticas de uso',
      hint: 'O Plausible conta visitas, sem cookies nem dados pessoais'
    },
    errors: {
      label: 'Relatórios de erro',
      hint: 'Um relatório anonimizado quando algo quebra, para podermos corrigir'
    },
    clear: {
      label: 'Apagar todos os dados',
      hint: 'Redefine tudo o que está salvo neste navegador'
    },
    clearButton: 'Apagar',
    cleared: 'Apagado',
    clearedAll: 'Tudo foi apagado'
  },
  error: {
    lost: 'Fora do mapa',
    broken: 'Algo deu errado',
    noTrains: 'Nenhum trem para aqui',
    outOfService: 'Fora de serviço',
    missing: 'Essa página não está no mapa.',
    back: 'Voltar ao mapa ao vivo'
  }
} satisfies Messages;

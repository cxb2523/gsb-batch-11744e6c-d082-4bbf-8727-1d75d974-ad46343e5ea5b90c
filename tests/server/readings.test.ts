import { describe, expect, it } from 'vitest';
import { pair, stations } from '#lib/network.js';
import {
  lastStation,
  Platforms,
  readClosures,
  readNotices,
  readStatus,
  readTrains
} from '#lib/server/readings.js';
import { AT, call, index } from '../helpers.js';

const read = (predictions: Parameters<typeof readTrains>[0]) =>
  readTrains(predictions, AT, new Platforms());

const stopsOf = (train: { stops: [number, number, number][] }) =>
  train.stops.map(([station, eta]) => [station, eta]);

describe('readTrains', () => {
  it('turns a named train into one itinerary in arrival order', () => {
    const [train, ...rest] = read([
      call('940GZZLUVXL', 200),
      call('940GZZLUSKW', 60),
      call('940GZZLUPCO', 290)
    ]);
    expect(rest).toEqual([]);
    expect(train.id).toBe('victoria:201');
    expect(train.to).toBe('Walthamstow Central');
    expect(train.from).toBe(index('940GZZLUBXN'));
    expect(stopsOf(train)).toEqual([
      [index('940GZZLUSKW'), 60],
      [index('940GZZLUVXL'), 200],
      [index('940GZZLUPCO'), 290]
    ]);
  });

  it('reads an Elizabeth line train by its mainline station names', () => {
    const elizabeth = {
      lineId: 'elizabeth',
      vehicleId: '202610086735292',
      destinationName: 'London Liverpool Street Rail Station',
      currentLocation: ''
    };
    const [train, ...rest] = read([
      call('910GGODMAYS', 257, elizabeth),
      call('910GCHDWLHT', 137, elizabeth),
      call('910GSVNKNGS', 377, elizabeth)
    ]);
    expect(rest).toEqual([]);
    expect(train.to).toBe('London Liverpool Street');
    expect(stations[train.dest!].name).toBe('Liverpool Street');
    expect(stopsOf(train)).toEqual([
      [index('910GCHDWLHT'), 137],
      [index('910GGODMAYS'), 257],
      [index('910GSVNKNGS'), 377]
    ]);
  });

  it('counts a call TfL repeats for each platform once', () => {
    const [train] = read([
      call('940GZZLUSKW', 60),
      call('940GZZLUSKW', 61, { platformName: 'Northbound - Platform 2' }),
      call('940GZZLUVXL', 200)
    ]);
    expect(train.stops).toHaveLength(2);
  });

  it('ignores a call at a station the line never stops at', () => {
    const trains = read([call('940GZZLUSKW', 60), call('940GZZLUEMB', 300)]);
    expect(trains.map(stopsOf)).toEqual([[[index('940GZZLUSKW'), 60]]]);
  });

  it('splits two trains that share an id but run on different branches', () => {
    const district = { lineId: 'district', vehicleId: '003', destinationName: 'Upminster' };
    const trains = read([
      call('940GZZLUWBN', 60, district),
      call('940GZZLUKOY', 90, district),
      call('940GZZLUECT', 170, district),
      call('940GZZLUFBY', 200, district)
    ]);
    expect(trains.map(stopsOf).sort((a, b) => a[0][1] - b[0][1])).toEqual([
      [
        [index('940GZZLUWBN'), 60],
        [index('940GZZLUECT'), 170]
      ],
      [[index('940GZZLUKOY'), 90]]
    ]);
    // numbering them would swap them over whenever the other's next call came up first
    expect(trains.map((train) => train.id)).toEqual(['district:003', 'district:003']);
  });

  it.each([
    ['on its way through', ['910GWCHAPXR', 150]],
    ['at the end of its run', null]
  ] as const)(
    "doesn't leave a ghost of a call TfL lists at both of a hub's stations, %s",
    (_, onward) => {
      const elizabeth = { lineId: 'elizabeth', vehicleId: '202610106737595', currentLocation: '' };
      const trains = read([
        call('910GLIVST', 30, elizabeth),
        call('910GLIVSTLL', 30, elizabeth),
        ...(onward ? [call(onward[0], onward[1], elizabeth)] : [])
      ]);
      expect(trains).toHaveLength(1);
      expect(trains[0].stops[0][0]).toBe(index('910GLIVSTLL'));
    }
  );

  it('rebuilds nameless trains from their timing', () => {
    const northern = (naptan: string, eta: number, where: string) =>
      call(naptan, eta, {
        lineId: 'northern',
        vehicleId: '000',
        destinationName: 'Morden Underground Station',
        currentLocation: where
      });
    const trains = read([
      northern('940GZZLUBOR', 60, 'Approaching Borough'),
      northern('940GZZLULNB', 90, 'Between Bank and London Bridge'),
      northern('940GZZLUEAC', 150, 'Between London Bridge and Borough'),
      northern('940GZZLUBOR', 210, 'Left Bank'),
      northern('940GZZLUKNG', 270, 'At Borough'),
      northern('940GZZLUEAC', 300, 'Between Bank and London Bridge')
    ]);
    expect(trains.map(stopsOf).sort((a, b) => a[0][1] - b[0][1])).toEqual([
      [
        [index('940GZZLUBOR'), 60],
        [index('940GZZLUEAC'), 150],
        [index('940GZZLUKNG'), 270]
      ],
      [
        [index('940GZZLULNB'), 90],
        [index('940GZZLUBOR'), 210],
        [index('940GZZLUEAC'), 300]
      ]
    ]);
    expect(trains.every((train) => train.id === null)).toBe(true);
  });

  it('keeps a nameless train with one call left, though another calls there just before', () => {
    const victoria = (naptan: string, eta: number, where: string) =>
      call(naptan, eta, { vehicleId: '000', currentLocation: where });
    const trains = read([
      victoria('940GZZLUKSX', 20, "Between Euston and King's Cross"),
      victoria('940GZZLUKSX', 75, 'At Euston'),
      victoria('940GZZLUHAI', 200, "Between Euston and King's Cross")
    ]);
    expect(trains.map(stopsOf).sort((a, b) => a[0][1] - b[0][1])).toEqual([
      [
        [index('940GZZLUKSX'), 20],
        [index('940GZZLUHAI'), 200]
      ],
      [[index('940GZZLUKSX'), 75]]
    ]);
  });

  it("keeps a named train whole when TfL's destination text wobbles", () => {
    const trains = read([
      call('940GZZLUSKW', 60),
      call('940GZZLUVXL', 200, { destinationName: undefined, towards: 'Walthamstow Central' })
    ]);
    expect(trains.map(stopsOf)).toEqual([
      [
        [index('940GZZLUSKW'), 60],
        [index('940GZZLUVXL'), 200]
      ]
    ]);
  });

  it('keeps two nameless trains apart when they reach a station close together', () => {
    const northern = (naptan: string, eta: number, where: string) =>
      call(naptan, eta, {
        lineId: 'northern',
        vehicleId: '000',
        destinationName: 'Morden Underground Station',
        currentLocation: where
      });
    const trains = read([
      northern('940GZZLUBOR', 30, 'Approaching Borough'),
      northern('940GZZLUBOR', 100, 'At London Bridge'),
      northern('940GZZLUEAC', 120, 'Approaching Borough'),
      northern('940GZZLUEAC', 190, 'At London Bridge')
    ]);
    expect(trains).toHaveLength(2);
  });

  it("drops a named train's return trip", () => {
    const back = { destinationName: 'Brixton Underground Station' };
    const trains = read([
      call('940GZZLUPCO', 60),
      call('940GZZLUVIC', 150),
      call('940GZZLUPCO', 600, back),
      call('940GZZLUVXL', 700, back)
    ]);
    expect(trains.map((train) => train.to)).toEqual(['Walthamstow Central']);
  });

  describe('on a line that names neither trains nor places', () => {
    const dlr = (naptan: string, eta: number, to: string) =>
      call(naptan, eta, {
        lineId: 'dlr',
        vehicleId: '',
        destinationName: `${to} DLR Station`,
        currentLocation: ''
      });
    const arriving = [dlr('940GZZDLCYP', 60, 'Beckton'), dlr('940GZZDLGAL', 180, 'Beckton')];

    it('drops a train leaving the end of the line that one arriving has time to become', () => {
      const trains = read([...arriving, dlr('940GZZDLBEC', 540, 'Tower Gateway')]);
      expect(trains.map((train) => train.to)).toEqual(['Beckton']);
    });

    it('keeps two trains apart when they pass at a station', () => {
      const trains = read([
        dlr('940GZZDLDEP', 60, 'Lewisham'),
        dlr('940GZZDLDEP', 61, 'Bank'),
        dlr('940GZZDLGRE', 121, 'Bank')
      ]);
      expect(trains.map((train) => train.to).sort()).toEqual(['Bank', 'Lewisham']);
    });

    it('lets one arriving train account for only one leaving', () => {
      const trains = read([
        ...arriving,
        dlr('940GZZDLBEC', 400, 'Tower Gateway'),
        dlr('940GZZDLBEC', 600, 'Tower Gateway')
      ]);
      expect(trains.filter((train) => train.to === 'Tower Gateway')).toHaveLength(1);
    });

    it('keeps one leaving the end of the line before anything else can get there', () => {
      const trains = read([...arriving, dlr('940GZZDLBEC', 200, 'Tower Gateway')]);
      expect(trains.map((train) => train.to).sort()).toEqual(['Beckton', 'Tower Gateway']);
    });
  });
});

describe('lastStation', () => {
  it.each([
    ['Between Stockwell and Vauxhall', '940GZZLUSKW'],
    ['At Vauxhall Platform 2', '940GZZLUVXL'],
    ['Left Pimlico', '940GZZLUPCO'],
    ['Departed Victoria', '940GZZLUVIC'],
    ['At Kings Cross St. Pancras Platform 4', '940GZZLUKSX']
  ])('reads "%s"', (location, naptan) => {
    expect(lastStation(location, 'victoria')).toBe(index(naptan));
  });

  it("gives up on places that aren't stations", () => {
    expect(lastStation('Approaching Vauxhall', 'victoria')).toBeNull();
    expect(lastStation('At Platform', 'victoria')).toBeNull();
  });

  it("starts a train at the station it's approaching when TfL has no call there", () => {
    const nearing = { currentLocation: 'Approaching Vauxhall Platform 1' };
    const [skipped] = read([call('940GZZLUPCO', 200, nearing)]);
    expect(skipped.from).toBe(index('940GZZLUVXL'));
    const [next] = read([call('940GZZLUVXL', 30, nearing), call('940GZZLUPCO', 150, nearing)]);
    expect(next.from).toBeNull();
  });
});

describe('readStatus', () => {
  it('keeps the worst status per line and tidies the reason', () => {
    const [status, ...rest] = readStatus([
      {
        id: 'northern',
        lineStatuses: [
          { statusSeverity: 10, statusSeverityDescription: 'Good Service' },
          {
            statusSeverity: 6,
            statusSeverityDescription: 'Severe Delays',
            reason: ' Signal\n failure '
          }
        ]
      },
      { id: 'london-cable-car', lineStatuses: [] }
    ]);
    expect(rest).toEqual([]);
    expect(status).toEqual({
      id: 'northern',
      severity: 6,
      status: 'Severe Delays',
      reason: 'Signal failure'
    });
  });

  it('lists the tracks a closure shuts, once each, but not ones that are only delayed', () => {
    const route = (...ids: string[]) => ({
      routeSectionNaptanEntrySequence: ids.map((id) => ({ stopPoint: { id } }))
    });
    const [ERC, PAC, BWT] = ['940GZZLUERC', '940GZZLUPAC', '940GZZLUBWT'];
    const [circle, bakerloo] = readStatus([
      {
        id: 'circle',
        lineStatuses: [
          {
            statusSeverity: 5,
            statusSeverityDescription: 'Part Closure',
            disruption: { affectedRoutes: [route(ERC, PAC, BWT), route(BWT, PAC, ERC)] }
          }
        ]
      },
      {
        id: 'bakerloo',
        lineStatuses: [
          {
            statusSeverity: 6,
            statusSeverityDescription: 'Severe Delays',
            disruption: { affectedRoutes: [route('940GZZLUQPS', '940GZZLUKSL')] }
          }
        ]
      }
    ]);
    expect(circle.closed).toEqual([pair(index(ERC), index(PAC)), pair(index(PAC), index(BWT))]);
    expect(bakerloo.closed).toBeUndefined();
  });
});

describe('readNotices', () => {
  const BARONS_COURT = '940GZZLUBSC';

  it("files each notice under its station, without TfL's heading in capitals", () => {
    const notices = readNotices([
      {
        atcoCode: BARONS_COURT,
        description: 'BARONS COURT STATION: Westbound trains will not call at  Barons Court.'
      },
      { atcoCode: '940GZZLUKWG', description: 'Step-free interchange requires a 600m journey.' }
    ]);
    expect(notices).toEqual({
      [BARONS_COURT]: ['Westbound trains will not call at Barons Court.'],
      '940GZZLUKWG': ['Step-free interchange requires a 600m journey.']
    });
  });

  it('says each thing once, and skips stations that are not on the map', () => {
    const twice = { atcoCode: BARONS_COURT, description: 'No lift service.' };
    expect(
      readNotices([twice, twice, { atcoCode: '490000000000X', description: 'A bus stop.' }])
    ).toEqual({ [BARONS_COURT]: ['No lift service.'] });
  });
});

describe('readClosures', () => {
  const ACTON_TOWN = '940GZZLUACT';
  const planned = (reason: string, more = {}) => ({
    statusSeverity: 5,
    statusSeverityDescription: 'Part Closure',
    reason,
    validityPeriods: [{ isNow: false }],
    disruption: { category: 'PlannedWork', affectedStops: [{ naptanId: '940GZZLUBSC' }] },
    ...more
  });

  it('keeps the when and where of closures to come, once each, at every stop TfL names', () => {
    const sunday = 'Sunday 25 October, no service between Barons Court and Acton Town.';
    const closures = readClosures([
      {
        id: 'district',
        lineStatuses: [
          planned(`DISTRICT LINE: ${sunday} Replacement buses run via St. Pancras.`),
          planned(`DISTRICT LINE: ${sunday}`, {
            disruption: { category: 'PlannedWork', affectedStops: [{ naptanId: ACTON_TOWN }] }
          }),
          planned('DISTRICT LINE: No service while we fix a signal.', {
            disruption: { category: 'RealTime' }
          }),
          planned('DISTRICT LINE: Saturday, no service anywhere.', {
            validityPeriods: [{ isNow: true }]
          }),
          planned('DISTRICT LINE: Saturday, fewer trains.', { statusSeverity: 7 })
        ]
      },
      {
        id: 'waterloo-city',
        lineStatuses: [
          planned('Waterloo & City line: service runs Monday to Friday only.', {
            disruption: { category: 'Information' }
          })
        ]
      }
    ]);
    expect(closures).toEqual([
      { line: 'district', text: sunday, stops: ['940GZZLUBSC', ACTON_TOWN] },
      { line: 'waterloo-city', text: 'Service runs Monday to Friday only.', stops: [] }
    ]);
  });

  it('keeps stops it has no station for, so the closure stays off the rest of the line', () => {
    const [closure] = readClosures([
      {
        id: 'district',
        lineStatuses: [
          planned('DISTRICT LINE: Sunday, no service at a siding.', {
            disruption: { category: 'PlannedWork', affectedStops: [{ naptanId: '9100NOWHERE' }] }
          })
        ]
      }
    ]);
    expect(closure.stops).toEqual(['9100NOWHERE']);
  });
});

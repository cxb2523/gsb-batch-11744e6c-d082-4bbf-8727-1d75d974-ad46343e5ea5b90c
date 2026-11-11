import { describe, expect, it } from 'vitest';
import { LINE_IDS, type LineId } from '#lib/lines.js';
import { finishesAt, summary } from '#lib/status.js';
import type { LineStatus, TrainReading } from '#lib/types.js';
import { index } from './helpers.js';

const BRIXTON = '940GZZLUBXN';
const EDGWARE_ROAD = '940GZZLUERC';

/** A nameless train calling at each station a minute apart, heading for `to` */
const train = (line: LineId, calls: string[], to: string): TrainReading => ({
  id: null,
  line,
  to: '',
  dest: index(to),
  where: '',
  from: null,
  stops: calls.map((naptan, i) => [index(naptan), 60 * (i + 1), 0])
});

describe('finishesAt', () => {
  it('spots a train coming in to finish at the end of the line', () => {
    const terminating = train('victoria', ['940GZZLUSKW', BRIXTON], BRIXTON);
    expect(finishesAt(terminating, new Set([index(BRIXTON)]))).toBe(true);
  });

  it('keeps a Circle train that calls at its destination on the way round', () => {
    const passing = train('circle', [EDGWARE_ROAD, '940GZZLUBST'], EDGWARE_ROAD);
    expect(finishesAt(passing, new Set([index(EDGWARE_ROAD)]))).toBe(false);
  });
});

describe('summary', () => {
  /** Every line on a good service, but for these */
  const network = (severities: Partial<Record<LineId, number>>, otherwise = 10): LineStatus[] =>
    LINE_IDS.map((id) => ({ id, severity: severities[id] ?? otherwise, status: '', reason: null }));
  const said = (severities: Partial<Record<LineId, number>>, otherwise?: number) =>
    summary(network(severities, otherwise)).map(({ text }) => text);

  it('says nothing until TfL has, then all is well in a sentence', () => {
    expect(summary([])).toEqual([]);
    expect(summary(network({}))).toEqual([{ tone: 'good', text: 'Good service on every line.' }]);
  });

  it('only speaks for the lines TfL has said how they are running', () => {
    const some = network({}).filter(({ id }) => id !== 'tram');
    expect(summary(some).map(({ text }) => text)).toEqual([
      `Good service on ${LINE_IDS.length - 1} lines.`
    ]);
    expect(summary(some.slice(0, 1)).map(({ text }) => text)).toEqual([
      'Good service on the Bakerloo line.'
    ]);
  });

  it('names a line with a problem, and the rest are fine', () => {
    expect(said({ central: 9 })).toEqual([
      'Minor delays on the Central line.',
      'Good service on all other lines.'
    ]);
  });

  it('names lines with the same problem together', () => {
    expect(said({ district: 9, bakerloo: 9, dlr: 9 })).toEqual([
      'Minor delays on the Bakerloo and District lines and the DLR.',
      'Good service on all other lines.'
    ]);
  });

  it('gives the worst news first, merging the severities that mean the same', () => {
    expect(summary(network({ district: 9, tram: 3, northern: 6, circle: 5 }))).toEqual([
      { tone: 'bad', text: 'No service on part of the Circle line and London Trams.' },
      { tone: 'bad', text: 'Severe delays on the Northern line.' },
      { tone: 'warn', text: 'Minor delays on the District line.' },
      { tone: 'good', text: 'Good service on all other lines.' }
    ]);
  });

  it('counts lines past a handful rather than naming them all', () => {
    const many = Object.fromEntries(LINE_IDS.slice(0, 9).map((id) => [id, 9]));
    expect(said(many)).toEqual(['Minor delays on 9 lines.', 'Good service on all other lines.']);
  });

  it('names the few lines still fine when most are not', () => {
    expect(said({ victoria: 10, jubilee: 10 }, 9)).toEqual([
      `Minor delays on ${LINE_IDS.length - 2} lines.`,
      'Good service on the Jubilee and Victoria lines.'
    ]);
  });

  it('tells lines shut for the night apart from ones with problems', () => {
    expect(said({ 'waterloo-city': 20 })).toEqual([
      'No trains on the Waterloo & City line right now.',
      'Good service on all other lines.'
    ]);
    expect(
      said({ central: 10, jubilee: 10, northern: 10, piccadilly: 10, victoria: 10 }, 20)
    ).toEqual([
      `No trains on ${LINE_IDS.length - 5} lines right now.`,
      'Good service on all other lines.'
    ]);
    expect(said({}, 20)).toEqual(['No trains are running right now.']);
  });
});

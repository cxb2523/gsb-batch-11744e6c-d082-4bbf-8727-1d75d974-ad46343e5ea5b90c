import { describe, expect, it } from 'vitest';
import { lineById } from '#lib/lines.js';
import {
  nearby,
  neighbours,
  placeBySlug,
  placeOf,
  places,
  tracks,
  type Place
} from '#lib/network.js';

describe('tracks', () => {
  it('never shares a track between modes, so switching one off never shifts another', () => {
    const mixed = tracks.filter(
      (track) => new Set(track.lines.map((l) => lineById(l)!.mode)).size > 1
    );
    expect(mixed).toEqual([]);
  });
});

const names = (found: { place: Place }[]) => found.map(({ place }) => place.name);

describe('places', () => {
  it('gives each its own address', () => {
    const slugs = places.map((place) => place.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter((slug) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))).toEqual([]);
    expect(placeBySlug.get('kings-cross-st-pancras')?.name).toBe("King's Cross St. Pancras");
    expect(placeBySlug.get('harrow-and-wealdstone')?.name).toBe('Harrow & Wealdstone');
  });

  it('tells apart separate stations that share a name by their first line', () => {
    expect(placeBySlug.has('edgware-road')).toBe(false);
    expect(placeBySlug.get('edgware-road-bakerloo')?.lines).toEqual(['bakerloo']);
    expect(placeBySlug.get('edgware-road-circle')?.lines).toContain('district');
    expect(placeBySlug.get('bethnal-green-weaver')?.lines).toEqual(['weaver']);
  });

  it("makes one place of a hub's stations under the same name", () => {
    const paddington = placeBySlug.get('paddington')!;
    expect(paddington.members).toHaveLength(4);
    expect(paddington.members.every((s) => placeOf(s.index) === paddington)).toBe(true);
    expect(paddington.lines).toEqual([
      'bakerloo',
      'circle',
      'district',
      'hammersmith-city',
      'elizabeth'
    ]);
  });
});

describe('neighbours', () => {
  it('lists the next stop down every branch, closest first', () => {
    const [northern] = neighbours(placeBySlug.get('camden-town')!);
    expect(northern.line).toBe('northern');
    expect(names(northern.next).sort()).toEqual([
      'Chalk Farm',
      'Euston',
      'Kentish Town',
      'Mornington Crescent'
    ]);
    const seconds = northern.next.map((stop) => stop.seconds);
    expect(seconds).toEqual(seconds.toSorted((a, b) => a - b));
  });

  it("goes by each line, so an interchange's lines each get theirs", () => {
    const bank = neighbours(placeBySlug.get('bank')!);
    expect(bank.map(({ line }) => line)).toEqual(['central', 'northern', 'waterloo-city', 'dlr']);
    expect(names(bank.find(({ line }) => line === 'waterloo-city')!.next)).toEqual(['Waterloo']);
  });
});

describe('nearby', () => {
  it('finds the stations a short walk away, nearest first', () => {
    const near = nearby(placeBySlug.get('bank')!, 400);
    expect(names(near)).toEqual(['Cannon Street', 'Mansion House', 'Monument']);
    expect(near.every(({ metres }) => metres <= 400)).toBe(true);
  });

  it('never counts a place as near itself', () => {
    const camden = placeBySlug.get('camden-town')!;
    expect(nearby(camden, 5000).some(({ place }) => place === camden)).toBe(false);
  });
});

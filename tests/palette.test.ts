import { describe, expect, it } from 'vitest';
import { edge, tint } from '#lib/map/palette.js';

describe('tint', () => {
  it('darkens a light line', () => {
    expect(tint('rgb(255, 211, 0)')).toBe('rgb(140, 116, 0)');
  });

  it('lightens a dark line', () => {
    expect(tint('rgb(0, 0, 0)')).toBe('rgb(115, 115, 115)');
  });
});

describe('edge', () => {
  it('darkens a line by day and lightens it by night', () => {
    expect(edge('rgb(227, 32, 23)', false)).toBe('rgb(102, 14, 10)');
    expect(edge('rgb(227, 32, 23)', true)).toBe('rgb(242, 155, 151)');
  });
});

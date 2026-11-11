import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults, read, write } from '#lib/settings/saved.js';

const KEY = 'tubespotting:settings';
const saved = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
  removeItem: (key: string) => saved.delete(key)
});

afterEach(() => saved.clear());

describe('saved settings', () => {
  it('reads back what was written', () => {
    const settings = {
      ...defaults(),
      dark: true,
      language: 'fr' as const,
      modes: ['dlr' as const],
      refresh: 30
    };
    write(settings);
    expect(read()).toEqual(settings);
  });

  it('keeps only what differs from the defaults', () => {
    write({ ...defaults(), style: 'geographic' });
    expect(JSON.parse(saved.get(KEY)!)).toEqual({ style: 'geographic' });
    write(defaults());
    expect(saved.has(KEY)).toBe(false);
  });

  it('falls back to the default for anything it cannot use', () => {
    saved.set(
      KEY,
      JSON.stringify({ style: 'sideways', language: 'xx', modes: ['tube', 'boat'], errors: false })
    );
    expect(read()).toEqual({ ...defaults(), errors: false });
    saved.set(KEY, '{not json');
    expect(read()).toEqual(defaults());
  });
});

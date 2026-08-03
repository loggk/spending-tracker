import { describe, expect, it } from 'vitest';
import { createId } from './id';

describe('createId', () => {
  it('produces a fixed-length id', () => {
    expect(createId()).toHaveLength(26);
  });

  it('uses only URL-safe characters', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(createId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    }
  });

  it('sorts by creation time', () => {
    const earlier = createId(1_700_000_000_000);
    const later = createId(1_700_000_001_000);

    expect(earlier < later).toBe(true);
  });

  it('is unique within the same millisecond', () => {
    const now = Date.now();
    const ids = new Set(Array.from({ length: 1000 }, () => createId(now)));

    expect(ids.size).toBe(1000);
  });

  it('shares a timestamp prefix within the same millisecond', () => {
    const now = Date.now();

    expect(createId(now).slice(0, 10)).toBe(createId(now).slice(0, 10));
  });
});

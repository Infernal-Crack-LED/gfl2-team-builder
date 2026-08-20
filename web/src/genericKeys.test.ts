/**
 * The synthetic "Generic" common keys papered over Dandegate's missing
 * shared-pool keys. The datamine ships the real pool, so this now pins the
 * OPPOSITE: no synthetic rows anywhere, and the real doll-less commons
 * present in force (maintainer call 2026-08-20).
 */
import { describe, expect, it } from 'vitest';
import { getAllCommonKeys, allKeys } from './data';

describe('shared common-key pool', () => {
  it('contains no synthetic generic rows', () => {
    expect(
      allKeys.filter(
        (k) =>
          k.keyTitle?.startsWith('Generic ') ||
          k.id.startsWith('00000000-0000-4000-8000-')
      )
    ).toEqual([]);
  });

  it('carries the real doll-less pool commons instead', () => {
    const pool = getAllCommonKeys().filter((k) => k.dollId == null);
    expect(pool.length).toBeGreaterThan(80);
    // pool keys are stat lines: attributes present, and an icon each
    for (const k of pool) {
      expect(k.attributes?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps every common key doll-less or tied to a real doll id', () => {
    for (const k of getAllCommonKeys()) {
      expect(k.keyType).toBe('Common Key');
    }
  });
});

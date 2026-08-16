/**
 * Guards the generic common keys: they are maintained in code (Dandegate
 * doesn't carry them), so this pins that they stay merged into the key set,
 * surface through the builder's getAllCommonKeys, and keep stable ids.
 */
import { describe, expect, it } from 'vitest';
import { getAllCommonKeys, allKeys } from './data';

describe('generic common keys', () => {
  it('merges the 3 generic common keys into allKeys', () => {
    const generics = allKeys.filter((k) =>
      k.keyTitle?.startsWith('Generic ')
    );
    expect(generics.map((k) => k.keyTitle).sort()).toEqual([
      'Generic Atk/Crit',
      'Generic Atk/Def',
      'Generic Atk/Hp',
    ]);
  });

  it('exposes them through getAllCommonKeys', () => {
    const titles = getAllCommonKeys().map((k) => k.displayTitle);
    expect(titles).toContain('Common Key - Generic Atk/Crit');
    expect(titles).toContain('Common Key - Generic Atk/Def');
    expect(titles).toContain('Common Key - Generic Atk/Hp');
  });

  it('gives them stable unique ids and no doll owner', () => {
    const generics = getAllCommonKeys().filter((k) =>
      k.keyTitle?.startsWith('Generic ')
    );
    expect(new Set(generics.map((k) => k.id)).size).toBe(3);
    for (const g of generics) {
      expect(g.dollId).toBeNull();
      expect(g.keyType).toBe('Common Key');
    }
  });
});

/**
 * Pins the picker labels. Both derive from Dandegate's display-title format
 * ("Common Key - X", "Fixed Key 3 - Y"), so a re-sync that changes that format
 * has to degrade to a readable name rather than to a wrong one.
 */
import { describe, expect, it } from 'vitest';
import { commonKeyLabel, fixedKeyLabel, fixedKeySlot } from './keyLabels';

describe('commonKeyLabel', () => {
  const key = {
    keyTitle: "Suona's Realm",
    displayTitle: "Common Key - Suona's Realm",
    dollId: 'doll-1',
  };

  it('names the source doll instead of the "Common Key" prefix', () => {
    expect(commonKeyLabel(key, 'Suona')).toBe("Suona - Suona's Realm");
  });

  it('falls back to the upstream title for the doll-less generics', () => {
    expect(
      commonKeyLabel(
        {
          keyTitle: 'Generic Atk/Crit',
          displayTitle: 'Common Key - Generic Atk/Crit',
          dollId: null,
        },
        null
      )
    ).toBe('Common Key - Generic Atk/Crit');
  });

  it('survives a key with no titles at all', () => {
    expect(
      commonKeyLabel({ keyTitle: null, displayTitle: null, dollId: null }, null)
    ).toBe('Common Key');
  });
});

describe('fixedKeyLabel', () => {
  it('leads with the slot number from the display title', () => {
    expect(
      fixedKeyLabel({
        keyTitle: 'Meal Prep',
        displayTitle: 'Fixed Key 3 - Meal Prep',
        dollId: 'doll-1',
      })
    ).toBe('3 - Meal Prep');
  });

  it('drops the prefix when the title carries no slot', () => {
    const key = {
      keyTitle: 'Meal Prep',
      displayTitle: 'Meal Prep',
      dollId: 'doll-1',
    };
    expect(fixedKeySlot(key)).toBeNull();
    expect(fixedKeyLabel(key)).toBe('Meal Prep');
  });
});

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

describe('fixedKeySlot', () => {
  it('prefers displaySlot: it is the in-game numbering, level is not', () => {
    // Springfield's Intel Acquisition: internal level digit 3, but the game
    // (and both community sheets) number it Fixed Key 2 — the two orderings
    // are permuted on 19 of 62 dolls.
    expect(
      fixedKeySlot({
        keyTitle: 'Intel Acquisition',
        displayTitle: 'Intel Acquisition',
        dollId: 'doll-1047',
        level: 3,
        displaySlot: 2,
      })
    ).toBe(2);
  });

  it('falls back to level for pre-displaySlot data', () => {
    expect(
      fixedKeySlot({
        keyTitle: 'Meal Prep',
        displayTitle: 'Meal Prep',
        dollId: 'doll-1',
        level: 4,
      })
    ).toBe(4);
  });

  it('ignores an out-of-range displaySlot rather than trusting it', () => {
    expect(
      fixedKeySlot({
        keyTitle: 'Meal Prep',
        displayTitle: 'Fixed Key 3 - Meal Prep',
        dollId: 'doll-1',
        displaySlot: 0,
      })
    ).toBe(3);
  });
});

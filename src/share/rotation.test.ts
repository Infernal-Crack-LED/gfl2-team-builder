import { describe, expect, it } from 'vitest';
import {
  normalizeRotation,
  rotationSummary,
  splitRotationEntries,
  trimRotation,
} from './rotation';

describe('trimRotation', () => {
  it('drops trailing empties but keeps interior gaps', () => {
    expect(trimRotation(['Ult', '', 'S2', null, ''])).toEqual([
      'Ult',
      '',
      'S2',
    ]);
    expect(trimRotation(['', '  ', null])).toEqual([]);
    expect(trimRotation(undefined)).toEqual([]);
  });
});

describe('normalizeRotation', () => {
  it('caps to 7 turns and trims each entry to the char cap', () => {
    const long = 'x'.repeat(100);
    expect(normalizeRotation([` Ult `, long, ...Array(8).fill('S1')])).toEqual([
      'Ult',
      'x'.repeat(80),
      'S1',
      'S1',
      'S1',
      'S1',
      'S1',
    ]);
  });
});

describe('splitRotationEntries', () => {
  it('splits on commas and drops blanks', () => {
    expect(splitRotationEntries('Ult, S2, S1')).toEqual(['Ult', 'S2', 'S1']);
    expect(splitRotationEntries('  ')).toEqual([]);
  });
});

describe('rotationSummary', () => {
  it('numbers only the filled turns', () => {
    expect(rotationSummary(['Ult, S1', '', 'S2'])).toBe('T1 Ult, S1 › T3 S2');
    expect(rotationSummary([])).toBeNull();
    expect(rotationSummary(['', ''])).toBeNull();
  });
});

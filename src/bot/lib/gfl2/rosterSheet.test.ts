import { describe, expect, it } from 'vitest';
import {
  analysisElements,
  buildAnalysisValues,
  buildSheetValues,
  v6CountsByElement,
  type DollColumn,
  type SheetMember,
} from './rosterSheet.js';

const columns: DollColumn[] = [
  { name: 'Klukai', slug: 'klukai', element: 'Corrosion' },
  { name: 'Groza', slug: 'groza', element: 'Burn' },
  { name: 'Vepley', slug: 'vepley', element: 'Burn' },
];

function member(overrides: Partial<SheetMember>): SheetMember {
  return {
    discordId: '1',
    username: null,
    playerId: null,
    vertebrae: new Map(),
    ...overrides,
  };
}

describe('buildSheetValues', () => {
  it('writes an element band row, then the doll-name header', () => {
    const [band, header] = buildSheetValues(columns, []);
    expect(band).toEqual(['', '', 'Corrosion', 'Burn', '']);
    expect(header).toEqual([
      'Player ID',
      'Username',
      'Klukai',
      'Groza',
      'Vepley',
    ]);
  });

  it('renders vertebrae per doll, blank for unsubmitted, ? for unreadable', () => {
    const rows = buildSheetValues(columns, [
      member({
        discordId: '42',
        username: 'Commander',
        playerId: '12345',
        vertebrae: new Map<string, number | null>([
          ['vepley', 0],
          ['groza', null],
        ]),
      }),
    ]);
    expect(rows[2]).toEqual(['12345', 'Commander', '', '?', '0']);
  });

  it('leaves identity cells blank when /username has not been run', () => {
    const rows = buildSheetValues(columns, [
      member({ vertebrae: new Map([['groza', 6]]) }),
    ]);
    expect(rows[2]).toEqual(['', '', '', '6', '']);
  });

  it('sorts members by username, falling back to discord id', () => {
    const rows = buildSheetValues(columns, [
      member({ discordId: '2', username: 'zeta' }),
      member({ discordId: '1', username: 'alpha' }),
      member({ discordId: '0', username: null }),
    ]);
    expect(rows.slice(2).map((r) => r[1])).toEqual(['', 'alpha', 'zeta']);
  });
});

describe('v6CountsByElement', () => {
  it('counts only vertebrae === 6, keyed by the doll column element', () => {
    const counts = v6CountsByElement(
      columns,
      member({
        vertebrae: new Map<string, number | null>([
          ['groza', 6],
          ['vepley', 6],
          ['klukai', 5],
        ]),
      })
    );
    expect(counts.get('Burn')).toBe(2);
    expect(counts.has('Corrosion')).toBe(false);
  });
});

describe('buildAnalysisValues', () => {
  const roster = [
    member({
      discordId: 'a',
      username: 'alice',
      vertebrae: new Map<string, number | null>([
        ['groza', 6],
        ['vepley', 6],
        ['klukai', 6],
      ]),
    }),
    member({
      discordId: 'b',
      username: 'bob',
      vertebrae: new Map<string, number | null>([
        ['groza', 6],
        ['vepley', 3],
      ]),
    }),
  ];

  it('aggregates over the elements present, in site order, plus unknowns', () => {
    expect(analysisElements(columns)).toEqual(['Burn', 'Corrosion']);
    expect(
      analysisElements([
        ...columns,
        { name: 'OTs-14', slug: 'ots-14', element: 'Resonance' },
      ])
    ).toEqual(['Burn', 'Corrosion', 'Resonance']);
  });

  it('builds the per-player matrix sorted by total V6 desc', () => {
    const { values, elements } = buildAnalysisValues(columns, roster);
    expect(values[1]).toEqual([
      'Username',
      ...elements,
      'Total V6',
      'Dolls submitted',
    ]);
    // alice: Burn 2, Corrosion 1, total 3; bob: Burn 1, total 1
    expect(values[2]?.[0]).toBe('alice');
    expect(values[2]?.[elements.indexOf('Burn') + 1]).toBe('2');
    expect(values[2]?.[elements.length + 1]).toBe('3');
    expect(values[3]?.[0]).toBe('bob');
  });

  it('ranks the top-10 block per element at the reported row', () => {
    const { values, elements, topHeaderRow } = buildAnalysisValues(
      columns,
      roster
    );
    const header = values[topHeaderRow];
    expect(header?.slice(0, 2)).toEqual(['Burn', 'V6s']);
    const burnCol = elements.indexOf('Burn') * 3;
    expect(values[topHeaderRow + 1]?.[burnCol]).toBe('alice');
    expect(values[topHeaderRow + 1]?.[burnCol + 1]).toBe('2');
    expect(values[topHeaderRow + 2]?.[burnCol]).toBe('bob');
  });

  it('counts V6 owners and submissions per doll at the reported row', () => {
    const { values, perDollTitleRow } = buildAnalysisValues(columns, roster);
    expect(values[perDollTitleRow]).toEqual(['V6 COUNT PER DOLL']);
    const dollRows = values.slice(perDollTitleRow + 2);
    expect(dollRows).toContainEqual(['Burn', 'Groza', '2', '2']);
    expect(dollRows).toContainEqual(['Burn', 'Vepley', '1', '2']);
    expect(dollRows).toContainEqual(['Corrosion', 'Klukai', '1', '1']);
  });
});

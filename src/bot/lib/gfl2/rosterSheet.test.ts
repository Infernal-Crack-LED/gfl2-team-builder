import { describe, expect, it } from 'vitest';
import { buildSheetValues, type SheetMember } from './rosterSheet.js';

const columns = [
  { name: 'Groza', slug: 'groza' },
  { name: 'Vepley', slug: 'vepley' },
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
  it('writes the header row: Player ID, Username, then one column per doll', () => {
    const [header] = buildSheetValues(columns, []);
    expect(header).toEqual(['Player ID', 'Username', 'Groza', 'Vepley']);
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
    expect(rows[1]).toEqual(['12345', 'Commander', '?', '0']);
  });

  it('leaves identity cells blank when /username has not been run', () => {
    const rows = buildSheetValues(columns, [
      member({ vertebrae: new Map([['groza', 6]]) }),
    ]);
    expect(rows[1]).toEqual(['', '', '6', '']);
  });

  it('sorts members by username, falling back to discord id', () => {
    const rows = buildSheetValues(columns, [
      member({ discordId: '2', username: 'zeta' }),
      member({ discordId: '1', username: 'alpha' }),
      member({ discordId: '0', username: null }),
    ]);
    expect(rows.slice(1).map((r) => r[1])).toEqual(['', 'alpha', 'zeta']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  decodeGviz,
  gvizGrid,
  parseClassTab,
  type GunsmokeGuide,
} from './gunsmoke-sheet.js';

type Row = (string | null)[];

/** Build a gviz table payload from a plain string matrix. */
function table(rows: Row[]): string {
  return (
    '/*O_o*/\ngoogle.visualization.Query.setResponse(' +
    JSON.stringify({
      version: '0.6',
      reqId: '0',
      status: 'ok',
      table: {
        cols: [],
        rows: rows.map((r) => ({
          c: r.map((v) => (v == null ? null : { v })),
        })),
      },
    }) +
    ');'
  );
}

// Mirrors the Tololo block of the Sentinel tab: recommended + conditional
// fixed keys with descriptions and conditions, three common-key tiers, and
// rotations with per-turn cells and notes.
const TOLOLO_BLOCK: Row[] = [
  ['Note: underlined keys are necessary', null, null],
  ['Tololo', null, 'Fixed Keys'],
  [
    null,
    null,
    'Recommended',
    'Fixed Key 2',
    'Principles of Observational Astronomy',
    null,
    'Fixed Key 3',
    'Invisible Light',
  ],
  [null, null, null, 'Desc of key 2', null, null, 'Desc of key 3'],
  [null, null, 'Conditional', 'Fixed Key 5', 'Galactic Cruise'],
  [null, null, null, 'Desc of key 5'],
  [null, null, 'Condition', 'Use if you need to dispel buffs from the boss'],
  [null, null, 'Common Keys'],
  [null, null, 'Best in slot', 'Dush', 'Vepley', 'Tololo'],
  [null, null, 'Good alternatives', 'Yoohee', 'crit/cdmg/atk', '5% atk'],
  [null, null, 'Conditional', 'Vector'],
  [
    'Gunsmoke rotations:',
    'Vertabrae / Condition',
    null,
    'Turn 1',
    'Turn 2',
    'Turn 3',
    'Turn 4',
    'Turn 5',
    'Turn 6',
    'Turn 7',
    'Notes',
  ],
  [null, 'V0 - V6 (without Expansion Key)', null, 'Ult, S1', 'S2', 'Ult'],
  [
    null,
    'V2 - V6 (with Expansion Key and Springfield)',
    null,
    'Ult, S2, S1',
    'Ult, S2, S1',
    'Ult, S2, S1',
    'Ult, S2, S1',
    'Ult, S2, S1',
    'Ult, S2, S1',
    'Ult, S2, S1',
    'V3-V6 can do Ult + S2 + Ult on the last turn.',
  ],
];

// A doll with empty sections and a non-V rotation label (QiongJiu shape).
const QJ_BLOCK: Row[] = [
  ['QiongJiu', null, 'Fixed Keys'],
  [null, null, 'Recommended', 'Fixed Key 1', 'Concentration'],
  [null, null, null, 'Gains 3 points of Confectance Index.'],
  [null, null, 'Conditional'],
  [null, null, 'Condition'],
  [null, null, 'Common Keys', 'BiS keys prioritized on main damage dealers'],
  [null, null, 'Best in slot', 'Any'],
  [null, null, 'Good alternatives'],
  [null, null, 'Conditional'],
  ['Gunsmoke rotations:', null, null, 'Turn 1'],
  [null, 'V0 - V6', null, 'Ult'],
  [null, 'Unable to use all support attacks', null, 'S1', 'S2'],
];

function parse(rows: Row[], tab = 'Sentinel'): GunsmokeGuide[] {
  return parseClassTab(gvizGrid(decodeGviz(table(rows))), tab);
}

describe('decodeGviz', () => {
  it('strips the setResponse wrapper and rejects error responses', () => {
    expect(decodeGviz(table([])).rows).toEqual([]);
    expect(() =>
      decodeGviz(
        '/*O_o*/\ngoogle.visualization.Query.setResponse({"status":"error","errors":[{"detailed_message":"no such gid"}]});'
      )
    ).toThrow(/no such gid/);
  });
});

describe('parseClassTab', () => {
  it('parses fixed keys with descriptions and conditions', () => {
    const [tololo] = parse(TOLOLO_BLOCK);
    expect(tololo.sheetName).toBe('Tololo');
    expect(tololo.classTab).toBe('Sentinel');
    expect(tololo.fixedKeys).toEqual([
      {
        slot: 'Fixed Key 2',
        title: 'Principles of Observational Astronomy',
        description: 'Desc of key 2',
        tier: 'recommended',
        condition: null,
      },
      {
        slot: 'Fixed Key 3',
        title: 'Invisible Light',
        description: 'Desc of key 3',
        tier: 'recommended',
        condition: null,
      },
      {
        slot: 'Fixed Key 5',
        title: 'Galactic Cruise',
        description: 'Desc of key 5',
        tier: 'conditional',
        condition: 'Use if you need to dispel buffs from the boss',
      },
    ]);
  });

  it('parses common-key tiers', () => {
    const [tololo] = parse(TOLOLO_BLOCK);
    expect(tololo.commonKeys).toEqual({
      note: null,
      bestInSlot: ['Dush', 'Vepley', 'Tololo'],
      goodAlternatives: ['Yoohee', 'crit/cdmg/atk', '5% atk'],
      conditional: ['Vector'],
    });
  });

  it('parses rotations with vertebrae, condition, turns and notes', () => {
    const [tololo] = parse(TOLOLO_BLOCK);
    expect(tololo.rotations).toHaveLength(2);
    const [r0, r1] = tololo.rotations;
    expect(r0.label).toBe('V0 - V6 (without Expansion Key)');
    expect(r0.vertebrae).toBe('V0 - V6');
    expect(r0.condition).toBe('without Expansion Key');
    expect(r0.turns).toEqual(['Ult, S1', 'S2', 'Ult', null, null, null, null]);
    expect(r0.notes).toBeNull();
    expect(r1.condition).toBe('with Expansion Key and Springfield');
    expect(r1.notes).toBe('V3-V6 can do Ult + S2 + Ult on the last turn.');
  });

  it('tolerates empty sections and non-vertebrae rotation labels', () => {
    const [qj] = parse(QJ_BLOCK);
    expect(qj.fixedKeys).toHaveLength(1);
    expect(qj.fixedKeys[0].description).toBe(
      'Gains 3 points of Confectance Index.'
    );
    expect(qj.commonKeys.note).toBe(
      'BiS keys prioritized on main damage dealers'
    );
    expect(qj.commonKeys.bestInSlot).toEqual(['Any']);
    expect(qj.rotations[1]).toMatchObject({
      label: 'Unable to use all support attacks',
      vertebrae: null,
      condition: null,
    });
  });

  it('splits rotation labels with text after the parenthesized group', () => {
    const rows: Row[] = [
      ['Daiyan', null, 'Fixed Keys'],
      ['Gunsmoke rotations:', null, null, 'Turn 1'],
      [null, 'V1 (With Expansion Key) full Tololo uptime', null, 'Ult'],
      [null, 'V6 + V2 Alva', null, 'S1'],
    ];
    const [g] = parse(rows);
    expect(g.rotations[0]).toMatchObject({
      vertebrae: 'V1',
      condition: 'With Expansion Key; full Tololo uptime',
    });
    expect(g.rotations[1]).toMatchObject({
      vertebrae: 'V6',
      condition: 'V2 Alva',
    });
  });

  it('drops pending keys when a labeled row interrupts the description row', () => {
    const rows: Row[] = [
      ['Groza', null, 'Fixed Keys'],
      [null, null, 'Recommended', 'Fixed Key 1', 'Some Key'],
      // no description row — a labeled row arrives while keys are pending
      [null, null, 'Common Keys'],
      // stray unlabeled row: must NOT be read as the key's description
      [null, null, null, 'stray text'],
      [null, null, 'Best in slot', 'Any'],
    ];
    const [g] = parse(rows);
    expect(g.fixedKeys[0].description).toBeNull();
    expect(g.commonKeys.bestInSlot).toEqual(['Any']);
  });

  it('splits consecutive doll blocks', () => {
    const guides = parse([...TOLOLO_BLOCK, ...QJ_BLOCK]);
    expect(guides.map((g) => g.sheetName)).toEqual(['Tololo', 'QiongJiu']);
  });
});

/**
 * Builds and syncs a platoon's roster spreadsheet — two tabs:
 *
 * ROSTER_TAB ('Vertebrae', member-facing): row 1 is an element band (merged,
 * element-colored), row 2 the doll names (light element tint), row 3+ one row
 * per member — Player ID, Username, then one column per GL doll grouped by
 * element. Cells hold the doll's vertebrae level (0-6), blank when the player
 * hasn't submitted that doll, '?' when the badge was unreadable.
 *
 * ANALYSIS_TAB ('Analysis', protected — only the service account edits): the
 * aggregates a platoon lead parses when assigning members to mission
 * elements. Deliberately data-only, no recommendations: a per-player-per-
 * element V6 matrix, top-10 players by V6 count per element, and a V6 count
 * per doll.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  platoonMembers,
  rosterDolls,
  rosterPlayers,
} from '../../../db/schema.js';
import { PHASE_COLORS } from '../../../infographics/core/theme.js';
import { loadGfl2Data } from './data.js';
import {
  ANALYSIS_TAB,
  ROSTER_TAB,
  batchUpdateSheet,
  getSheetTabs,
  serviceAccountEmail,
  writeTabValues,
} from './googleSheets.js';

/** Element order on the sheet — matches the site's phase filter order. */
export const ELEMENT_ORDER = [
  'Physical',
  'Burn',
  'Hydro',
  'Electric',
  'Freeze',
  'Corrosion',
] as const;

const FIXED_COLUMNS = 2; // Player ID, Username

export interface SheetMember {
  discordId: string;
  username: string | null;
  playerId: string | null;
  /** dollSlug -> vertebrae (null = badge unreadable, shown as '?') */
  vertebrae: Map<string, number | null>;
}

export interface DollColumn {
  name: string;
  slug: string;
  /** Element (phase); dolls with an unknown phase sort last as 'Physical'. */
  element: string;
}

/** GL dolls (CN-only releases excluded), grouped by element then name. */
export async function sheetDollColumns(): Promise<DollColumn[]> {
  const { dolls } = await loadGfl2Data();
  const order = (e: string): number => {
    const i = ELEMENT_ORDER.indexOf(e as (typeof ELEMENT_ORDER)[number]);
    return i === -1 ? ELEMENT_ORDER.length : i;
  };
  return dolls
    .filter((d) => d.regionTag !== 'cn')
    .map((d) => ({
      name: d.name,
      slug: d.slug,
      element: d.phase ?? 'Physical',
    }))
    .sort(
      (a, b) =>
        order(a.element) - order(b.element) || a.name.localeCompare(b.name)
    );
}

const memberSort = (a: SheetMember, b: SheetMember): number =>
  (a.username ?? a.discordId).localeCompare(b.username ?? b.discordId);

const displayName = (m: SheetMember): string => m.username ?? m.discordId;

/** Pure values builder for the Vertebrae tab — exported for tests. */
export function buildSheetValues(
  columns: DollColumn[],
  members: SheetMember[]
): string[][] {
  // Row 1: element band — the element name on its group's first column.
  const bandRow = ['', ''];
  let prev = '';
  for (const c of columns) {
    bandRow.push(c.element === prev ? '' : c.element);
    prev = c.element;
  }
  const header = ['Player ID', 'Username', ...columns.map((c) => c.name)];
  const rows = [...members].sort(memberSort).map((m) => [
    m.playerId ?? '',
    m.username ?? '',
    ...columns.map((c) => {
      if (!m.vertebrae.has(c.slug)) {
        return '';
      }
      const v = m.vertebrae.get(c.slug);
      return v === null || v === undefined ? '?' : String(v);
    }),
  ]);
  return [bandRow, header, ...rows];
}

/** V6 count per member per element. Exported for tests. */
export function v6CountsByElement(
  columns: DollColumn[],
  member: SheetMember
): Map<string, number> {
  const bySlug = new Map(columns.map((c) => [c.slug, c.element]));
  const counts = new Map<string, number>();
  for (const [slug, v] of member.vertebrae) {
    if (v !== 6) {
      continue;
    }
    const element = bySlug.get(slug);
    if (element) {
      counts.set(element, (counts.get(element) ?? 0) + 1);
    }
  }
  return counts;
}

export interface AnalysisLayout {
  values: string[][];
  /** Elements the analysis actually aggregates over, in display order. */
  elements: string[];
  /** Row index of the top-10 per-element block header (element names). */
  topHeaderRow: number;
  /** Row index of the 'V6 COUNT PER DOLL' section title. */
  perDollTitleRow: number;
}

/**
 * Elements the analysis aggregates over: ELEMENT_ORDER filtered to what the
 * columns actually contain, plus anything new appended — so a GL release of
 * an element outside ELEMENT_ORDER (e.g. Resonance, CN-only today) can never
 * be silently dropped from the matrix or the top-10 blocks.
 */
export function analysisElements(columns: DollColumn[]): string[] {
  const present = new Set(columns.map((c) => c.element));
  const known = ELEMENT_ORDER.filter((e) => present.has(e));
  const extra = [...present]
    .filter((e) => !(ELEMENT_ORDER as readonly string[]).includes(e))
    .sort();
  return [...known, ...extra];
}

/**
 * Pure values builder for the Analysis tab — exported for tests.
 * Three stacked sections; formatting (colors, protection) is applied
 * separately by the sync, positioned by the returned row indices.
 */
export function buildAnalysisValues(
  columns: DollColumn[],
  members: SheetMember[]
): AnalysisLayout {
  const elements = analysisElements(columns);
  const sorted = [...members].sort(memberSort);
  const perMember = sorted.map((m) => ({
    member: m,
    counts: v6CountsByElement(columns, m),
    submitted: m.vertebrae.size,
  }));

  const rows: string[][] = [];

  // Section 1 — V6 matrix: one row per player, one column per element.
  rows.push(['V6 COUNT PER PLAYER PER ELEMENT']);
  rows.push(['Username', ...elements, 'Total V6', 'Dolls submitted']);
  for (const { member, counts, submitted } of [...perMember].sort(
    (a, b) =>
      [...b.counts.values()].reduce((s, n) => s + n, 0) -
      [...a.counts.values()].reduce((s, n) => s + n, 0)
  )) {
    const perElement = elements.map((e) => counts.get(e) ?? 0);
    rows.push([
      displayName(member),
      ...perElement.map(String),
      String(perElement.reduce((s, n) => s + n, 0)),
      String(submitted),
    ]);
  }

  rows.push([]);

  // Section 2 — top 10 players by V6 count, one two-column block per element.
  rows.push(['TOP 10 BY V6 COUNT PER ELEMENT']);
  const topHeaderRow = rows.length;
  const blockHeader: string[] = [];
  for (const element of elements) {
    blockHeader.push(element, 'V6s', '');
  }
  rows.push(blockHeader);
  const ranked = elements.map((element) =>
    perMember
      .map(({ member, counts }) => ({
        name: displayName(member),
        count: counts.get(element) ?? 0,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 10)
  );
  for (let i = 0; i < 10; i++) {
    if (ranked.every((list) => !list[i])) {
      break;
    }
    const row: string[] = [];
    for (const list of ranked) {
      const entry = list[i];
      row.push(entry?.name ?? '', entry ? String(entry.count) : '', '');
    }
    rows.push(row);
  }

  rows.push([]);

  // Section 3 — V6 owners per doll, grouped by element.
  const perDollTitleRow = rows.length;
  rows.push(['V6 COUNT PER DOLL']);
  rows.push(['Element', 'Doll', 'V6 owners', 'Submitted by']);
  for (const c of columns) {
    let v6 = 0;
    let submitted = 0;
    for (const m of members) {
      if (!m.vertebrae.has(c.slug)) {
        continue;
      }
      submitted++;
      if (m.vertebrae.get(c.slug) === 6) {
        v6++;
      }
    }
    rows.push([c.element, c.name, String(v6), String(submitted)]);
  }

  return { values: rows, elements, topHeaderRow, perDollTitleRow };
}

// ---- formatting ----

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

function hexToRgb(hex: string): RgbColor {
  const n = parseInt(hex.replace('#', ''), 16);
  return {
    red: ((n >> 16) & 0xff) / 255,
    green: ((n >> 8) & 0xff) / 255,
    blue: (n & 0xff) / 255,
  };
}

/** Mix an element color toward white (t=0 → color, t=1 → white). */
function tint(color: RgbColor, t: number): RgbColor {
  return {
    red: color.red + (1 - color.red) * t,
    green: color.green + (1 - color.green) * t,
    blue: color.blue + (1 - color.blue) * t,
  };
}

function elementColor(element: string): RgbColor {
  return hexToRgb(PHASE_COLORS[element] ?? '#b0b7c3');
}

/** Contiguous element runs over the doll columns: [start, end) offsets. */
function elementRuns(
  columns: DollColumn[]
): { element: string; start: number; end: number }[] {
  const runs: { element: string; start: number; end: number }[] = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (!col) {
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && last.element === col.element) {
      last.end = i + 1;
    } else {
      runs.push({ element: col.element, start: i, end: i + 1 });
    }
  }
  return runs;
}

/**
 * Formatting for the Vertebrae tab, applied on every sync (idempotent: the
 * merge ranges are unmerged first). Colors follow the site's element accents.
 */
export function vertebraeFormatRequests(
  sheetId: number,
  columns: DollColumn[],
  memberCount: number
): unknown[] {
  const requests: unknown[] = [];
  const dollEnd = FIXED_COLUMNS + columns.length;

  // Frozen header rows + identity columns.
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: 2, frozenColumnCount: FIXED_COLUMNS },
      },
      fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
    },
  });

  // Re-derive the element band merges from scratch each sync.
  requests.push({
    unmergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
    },
  });

  for (const run of elementRuns(columns)) {
    const startCol = FIXED_COLUMNS + run.start;
    const endCol = FIXED_COLUMNS + run.end;
    const color = elementColor(run.element);
    if (endCol - startCol > 1) {
      requests.push({
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          mergeType: 'MERGE_ALL',
        },
      });
    }
    // Band cell: solid element color, white bold text.
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: startCol,
          endColumnIndex: endCol,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: color,
            horizontalAlignment: 'CENTER',
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
          },
        },
        fields:
          'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)',
      },
    });
    // Doll-name header: medium tint, bold.
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: startCol,
          endColumnIndex: endCol,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: tint(color, 0.65),
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
    // Data cells: light tint so the grouping reads down the whole grid. The
    // span is deliberately generous: values are cleared on every sync but
    // formats are not, so a fixed floor stops stale tint from outliving a
    // member roster that shrank.
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: 2 + Math.max(memberCount, 100),
          startColumnIndex: startCol,
          endColumnIndex: endCol,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: tint(color, 0.88),
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment)',
      },
    });
  }

  // Identity header cells: plain bold.
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: FIXED_COLUMNS,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat',
    },
  });

  // Doll columns get a narrow fixed width so 50+ columns stay scannable.
  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId,
        dimension: 'COLUMNS',
        startIndex: FIXED_COLUMNS,
        endIndex: dollEnd,
      },
      properties: { pixelSize: 90 },
      fields: 'pixelSize',
    },
  });

  return requests;
}

/** Formatting for the Analysis tab: section titles bold, element headers colored. */
export function analysisFormatRequests(
  sheetId: number,
  layout: AnalysisLayout
): unknown[] {
  const { elements, topHeaderRow, perDollTitleRow } = layout;
  const requests: unknown[] = [];

  // Matrix element header cells (row 2, after Username).
  elements.forEach((element, i) => {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 1 + i,
          endColumnIndex: 2 + i,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: elementColor(element),
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
  });

  // Top-10 block headers, one colored pair of cells per element.
  elements.forEach((element, i) => {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: topHeaderRow,
          endRowIndex: topHeaderRow + 1,
          startColumnIndex: i * 3,
          endColumnIndex: i * 3 + 2,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: elementColor(element),
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
  });

  // Section titles bold.
  for (const row of [0, topHeaderRow - 1, perDollTitleRow]) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: row, endRowIndex: row + 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat',
      },
    });
  }

  return requests;
}

/** Rebuild one platoon's spreadsheet (both tabs) from the DB. */
export async function syncPlatoonSheet(
  platoonId: string,
  sheetId: string
): Promise<void> {
  const members = await db
    .select()
    .from(platoonMembers)
    .where(eq(platoonMembers.platoonId, platoonId));
  const ids = members.map((m) => m.discordId);

  const [players, dollsRows] = ids.length
    ? await Promise.all([
        db
          .select()
          .from(rosterPlayers)
          .where(inArray(rosterPlayers.discordId, ids)),
        db
          .select()
          .from(rosterDolls)
          .where(inArray(rosterDolls.discordId, ids)),
      ])
    : [[], []];

  const playerById = new Map(players.map((p) => [p.discordId, p]));
  const vertById = new Map<string, Map<string, number | null>>();
  for (const row of dollsRows) {
    let m = vertById.get(row.discordId);
    if (!m) {
      m = new Map();
      vertById.set(row.discordId, m);
    }
    m.set(row.dollSlug, row.vertebrae);
  }

  const sheetMembers: SheetMember[] = ids.map((id) => ({
    discordId: id,
    username: playerById.get(id)?.username ?? null,
    playerId: playerById.get(id)?.playerId ?? null,
    vertebrae: vertById.get(id) ?? new Map(),
  }));

  await writePlatoonSpreadsheet(sheetId, sheetMembers);
}

/**
 * Write both tabs + formatting for a member list that is already in hand —
 * the DB-free half of syncPlatoonSheet, also used by demo/seed scripts.
 */
export async function writePlatoonSpreadsheet(
  sheetId: string,
  sheetMembers: SheetMember[]
): Promise<void> {
  const columns = await sheetDollColumns();

  // Tab discovery + creation. Older spreadsheets may predate the Analysis
  // tab; add it (and protect it) on first touch.
  let tabs = await getSheetTabs(sheetId);
  const ensure: unknown[] = [];
  if (!tabs.some((t) => t.title === ANALYSIS_TAB)) {
    ensure.push({ addSheet: { properties: { title: ANALYSIS_TAB } } });
  }
  if (ensure.length) {
    await batchUpdateSheet(sheetId, ensure);
    tabs = await getSheetTabs(sheetId);
  }
  const rosterTab = tabs.find((t) => t.title === ROSTER_TAB);
  const analysisTab = tabs.find((t) => t.title === ANALYSIS_TAB);
  if (!rosterTab || !analysisTab) {
    throw new Error(`spreadsheet ${sheetId} is missing the roster tabs`);
  }

  const analysis = buildAnalysisValues(columns, sheetMembers);
  await writeTabValues(
    sheetId,
    ROSTER_TAB,
    buildSheetValues(columns, sheetMembers)
  );
  await writeTabValues(sheetId, ANALYSIS_TAB, analysis.values);

  const requests: unknown[] = [
    ...vertebraeFormatRequests(rosterTab.sheetId, columns, sheetMembers.length),
    ...analysisFormatRequests(analysisTab.sheetId, analysis),
  ];
  // Protect the Analysis tab once: the sheet is shared anyone-with-link
  // EDITOR, so without this any viewer could edit the aggregates. Only the
  // service account stays an editor of this tab.
  if (!analysisTab.protected) {
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: analysisTab.sheetId },
          description: 'Bot-maintained analysis — edits are overwritten',
          editors: { users: [serviceAccountEmail()] },
        },
      },
    });
  }
  await batchUpdateSheet(sheetId, requests);
}

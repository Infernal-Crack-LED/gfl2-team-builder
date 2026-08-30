/**
 * Fetch + parse the community "GFL2 EN Gunsmoke Frontline Doll Info" sheet
 * (rotations + fixed/common key picks per doll).
 *
 * The workbook has a Summary cover tab and one tab per doll class
 * (Sentinel / Vanguard / Support / Bulwark). Each class tab is a stack of
 * per-doll blocks with a fixed layout:
 *
 *   A: <Doll name>            C: "Fixed Keys"
 *      C: "Recommended"  D/F/H: slot+title pairs, descriptions on next row
 *      C: "Conditional"  (same shape)
 *      C: "Condition"    per-key condition text in D/G/J
 *      C: "Common Keys"  (optional note in D)
 *      C: "Best in slot" / "Good alternatives" / "Conditional"  values D+
 *   A: "Gunsmoke rotations:"  B: "Vertabrae / Condition", D..J: Turn 1..7, K: Notes
 *      B: <vertebrae/condition label>  D..J: per-turn actions  K: notes
 *
 * Fetching uses the gviz JSON endpoint (no API key needed for a published
 * sheet). Cell text comes from the formatted value (`f`) falling back to the
 * raw value (`v`). Text formatting (e.g. the underline that marks
 * near-mandatory fixed keys) is NOT available through gviz and is dropped.
 */
export const GUNSMOKE_SHEET_ID = '1JJaNW9P0SMlK2HgTBm-h8EAgGAnik1YTxOSjQMtPXp8';

export const GUNSMOKE_TABS: { name: string; gid: number }[] = [
  { name: 'Sentinel', gid: 895072524 },
  { name: 'Vanguard', gid: 172218329 },
  { name: 'Support', gid: 1950749783 },
  { name: 'Bulwark', gid: 1889550778 },
];

const NUM_COLS = 12;
const NUM_TURNS = 7;
const TURN_COL_START = 3;
const NOTES_COL = 10;
/** Fixed-key groups: (slot column, title column) pairs. */
const KEY_GROUPS: [number, number][] = [
  [3, 4],
  [6, 7],
  [9, 10],
];

export interface GunsmokeFixedKey {
  /** Slot label as written in the sheet, e.g. "Fixed Key 2". Sheet-local
   * numbering — does NOT match our keys table slot numbers. */
  slot: string;
  title: string;
  description: string | null;
  tier: 'recommended' | 'conditional';
  /** When to take the key (conditional tier only). */
  condition: string | null;
}

export interface GunsmokeCommonKeys {
  /** Free-text note sitting on the "Common Keys" header row, if any. */
  note: string | null;
  bestInSlot: string[];
  goodAlternatives: string[];
  conditional: string[];
}

export interface GunsmokeRotation {
  /** Full label as written, e.g. "V2 - V6 (with Expansion Key)". */
  label: string;
  /** Leading vertebrae range, e.g. "V2 - V6" — null when the label has none. */
  vertebrae: string | null;
  /** Parenthesized condition suffix, e.g. "with Expansion Key". */
  condition: string | null;
  /** Turn 1..7 actions; null for empty cells. */
  turns: (string | null)[];
  notes: string | null;
}

export interface GunsmokeGuide {
  /** Doll name as written in the sheet. */
  sheetName: string;
  classTab: string;
  fixedKeys: GunsmokeFixedKey[];
  commonKeys: GunsmokeCommonKeys;
  rotations: GunsmokeRotation[];
}

// --- gviz decoding -----------------------------------------------------------

interface GvizCell {
  v?: unknown;
  f?: unknown;
}
interface GvizTable {
  rows: { c: (GvizCell | null)[] }[];
}

/** Strip the `/*O_o*\/ google.visualization.Query.setResponse(...)` wrapper. */
export function decodeGviz(raw: string): GvizTable {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('gviz response has no JSON payload');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    status?: string;
    errors?: { detailed_message?: string }[];
    table?: GvizTable;
  };
  if (parsed.status !== 'ok' || !parsed.table) {
    const detail = parsed.errors
      ?.map((e) => e.detailed_message)
      .filter(Boolean)
      .join('; ');
    throw new Error(`gviz query failed${detail ? `: ${detail}` : ''}`);
  }
  return parsed.table;
}

/** Flatten a gviz table to a string matrix (null = empty cell). */
export function gvizGrid(table: GvizTable): (string | null)[][] {
  return table.rows.map((row) => {
    const cells: (string | null)[] = Array.from(
      { length: NUM_COLS },
      () => null
    );
    row.c?.forEach((cell, i) => {
      if (i >= NUM_COLS || cell == null) {
        return;
      }
      const v = cell.f ?? cell.v;
      if (v != null) {
        const s = String(v).trim();
        cells[i] = s === '' ? null : s;
      }
    });
    return cells;
  });
}

// --- parsing -----------------------------------------------------------------

function isDollStart(row: (string | null)[]): boolean {
  return row[0] != null && row[2]?.toLowerCase() === 'fixed keys';
}

function isRotationHeader(row: (string | null)[]): boolean {
  return row[0]?.toLowerCase().includes('rotations:') ?? false;
}

/** Leading "V0 - V6"-style range, then an optional "(condition)" suffix
 * (possibly with trailing free text, e.g. "V1 (With Expansion Key) full
 * Tololo uptime"). */
const VERTEBRAE_RE =
  /^(V\d(?:\s*[-–]\s*V\d)?)\s*(?:\(([^)]*)\)\s*(.*)|(.*))?$/i;

function parseRotationLabel(
  label: string
): Pick<GunsmokeRotation, 'vertebrae' | 'condition'> {
  const m = VERTEBRAE_RE.exec(label.trim());
  if (!m) {
    return { vertebrae: null, condition: null };
  }
  const parts = m[2] != null ? [m[2], m[3]] : [m[4]];
  const condition =
    parts
      .map((p) => p?.replace(/^\+\s*/, '').trim())
      .filter(Boolean)
      .join('; ') || null;
  return { vertebrae: (m[1] ?? '').replace(/\s*[-–]\s*/, ' - '), condition };
}

/**
 * Parse one class tab's grid into per-doll guides. Doll blocks are delimited
 * by rows whose A cell is a name and C cell is "Fixed Keys"; everything after
 * the last rotation row belongs to the current block.
 */
export function parseClassTab(
  grid: (string | null)[][],
  classTab: string
): GunsmokeGuide[] {
  const guides: GunsmokeGuide[] = [];
  let guide: GunsmokeGuide | null = null;
  /** Which list the current "Conditional"/"Condition" rows belong to. */
  let section: 'fixed' | 'common' | 'rotations' | null = null;
  /** Key groups of the most recent Recommended/Conditional header row,
   * waiting for their description row. */
  let pendingKeys: GunsmokeFixedKey[] = [];
  /** Column whose following rows carry each key's description/condition. */
  const keyCol = new Map<GunsmokeFixedKey, number>();

  const flushDescriptions = (row: (string | null)[]): void => {
    for (const k of pendingKeys) {
      k.description = row[keyCol.get(k) as number] ?? null;
    }
    pendingKeys = [];
  };

  for (const row of grid) {
    if (isDollStart(row)) {
      pendingKeys = [];
      guide = {
        sheetName: row[0] as string,
        classTab,
        fixedKeys: [],
        commonKeys: {
          note: null,
          bestInSlot: [],
          goodAlternatives: [],
          conditional: [],
        },
        rotations: [],
      };
      guides.push(guide);
      section = 'fixed';
      continue;
    }
    if (!guide) {
      continue; // cover notes above the first doll block
    }
    if (isRotationHeader(row)) {
      pendingKeys = [];
      section = 'rotations';
      continue;
    }

    if (section === 'rotations') {
      const label = row[1];
      if (!label) {
        continue;
      }
      const turns = Array.from({ length: NUM_TURNS }, (_, i) => {
        const v = row[TURN_COL_START + i];
        return v ?? null;
      });
      const { vertebrae, condition } = parseRotationLabel(label);
      guide.rotations.push({
        label,
        vertebrae,
        condition,
        turns,
        notes: row[NOTES_COL] ?? null,
      });
      continue;
    }

    const label = row[2]?.toLowerCase() ?? null;

    // Description rows carry no C-column label. A labeled row while keys are
    // pending means they have no description row — drop them, so a later
    // stray unlabeled row can't be misread as their descriptions.
    if (pendingKeys.length) {
      if (label == null) {
        flushDescriptions(row);
      } else {
        pendingKeys = [];
      }
    }

    if (label === 'fixed keys') {
      section = 'fixed';
      continue;
    }
    if (label === 'common keys') {
      section = 'common';
      guide.commonKeys.note = row[3] ?? null;
      continue;
    }
    if (label === 'recommended' || label === 'conditional') {
      const tier = label === 'recommended' ? 'recommended' : 'conditional';
      if (section === 'fixed') {
        // A new key header supersedes any keys still waiting for a
        // description row — their descriptions simply don't exist.
        pendingKeys = [];
        for (const [slotCol, titleCol] of KEY_GROUPS) {
          const slot = row[slotCol];
          const title = row[titleCol];
          if (!slot && !title) {
            continue;
          }
          const key: GunsmokeFixedKey = {
            slot: slot ?? '',
            title: title ?? '',
            description: null,
            tier,
            condition: null,
          };
          guide.fixedKeys.push(key);
          keyCol.set(key, slotCol);
          pendingKeys.push(key);
        }
      } else if (section === 'common' && label === 'conditional') {
        guide.commonKeys.conditional = row
          .slice(3)
          .filter((v): v is string => v != null);
      }
      continue;
    }
    if (label === 'condition') {
      if (section === 'fixed') {
        // condition text lines up with the conditional key columns (D/G/J).
        // Assumes one Conditional group per block — a second group's
        // Condition row would reassign the first group's keys at the same
        // columns (no current block does this).
        for (const k of guide.fixedKeys) {
          if (k.tier === 'conditional') {
            k.condition = row[keyCol.get(k) as number] ?? null;
          }
        }
      }
      continue;
    }
    if (label === 'best in slot') {
      guide.commonKeys.bestInSlot = row
        .slice(3)
        .filter((v): v is string => v != null);
      continue;
    }
    if (label === 'good alternatives') {
      guide.commonKeys.goodAlternatives = row
        .slice(3)
        .filter((v): v is string => v != null);
      continue;
    }
    // Any other row inside a block: if we just saw a key header it was the
    // description row (handled above); anything else is ignored.
  }
  return guides;
}

// --- fetch -------------------------------------------------------------------

function gvizUrl(gid: number): string {
  return (
    `https://docs.google.com/spreadsheets/d/${GUNSMOKE_SHEET_ID}` +
    // headers=0 pins every row as data — without it Google's header
    // auto-detection could steal a title-ish first row into table.cols.
    `/gviz/tq?tqx=out:json&headers=0&gid=${gid}`
  );
}

/** Fetch and parse all class tabs into per-doll guides. */
export async function fetchGunsmokeGuides(
  fetchFn: typeof fetch = fetch
): Promise<GunsmokeGuide[]> {
  const guides: GunsmokeGuide[] = [];
  for (const tab of GUNSMOKE_TABS) {
    const res = await fetchFn(gvizUrl(tab.gid));
    if (!res.ok) {
      throw new Error(`gviz fetch failed for ${tab.name}: HTTP ${res.status}`);
    }
    const table = decodeGviz(await res.text());
    guides.push(...parseClassTab(gvizGrid(table), tab.name));
  }
  return guides;
}

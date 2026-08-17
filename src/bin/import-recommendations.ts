/**
 * Import per-doll recommendation defaults from the community info sheet
 * (the official-Discord "GFL2 Info Sheet" Google spreadsheet) into the
 * doll_recommendations table.
 *
 *   npm run import:recs             # fetch, parse, upsert
 *   npm run import:recs -- --dry-run          # parse + report, write nothing
 *   npm run import:recs -- --doll makiatto    # one doll only (by slug)
 *   npm run import:recs -- --force            # overwrite 'manual' rows too
 *
 * The sheet has ONE TAB PER DOLL. gviz-by-name needs the EXACT tab title
 * (many carry a trailing space) and silently serves the first tab on a miss,
 * so tab titles are scraped from the edit page's HTML and every CSV response
 * is checked for that first-tab signature.
 *
 * Parsing is heuristic by design — the sheet is formatted for humans. The
 * rules here cover the structured cases; anything they can't read is
 * REPORTED, not guessed, and gets filled in by hand (rows edited by hand
 * should set source='manual', which re-imports skip unless --force):
 *
 *  - Suggested path: the "Suggested Path" header row's V#/R# tokens (NA
 *    means "none by design"); falling back to a "V0 > V3 (why) > R1" token
 *    chain in the Explanation column.
 *  - Weapons: cells under "Recommended Weapon" (before "F2P Option") that
 *    match a known weapon name, in sheet order.
 *  - Attachment set: the "Main Set" cell, first line, parenthetical
 *    qualifier stripped — the qualifier (e.g. "V3 and below") goes into
 *    notes instead.
 *  - Keys: "Fixed Key N" numbers under "Recommended Key", alternatives
 *    appended after the mains — priority order, matching the rec card.
 *  - Stats: ordered stat tokens scanned from the "Substat" cell.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dollRecommendations } from '../db/schema.js';

const SHEET_ID = '1DogyU3K7ZXw2qbhP1EhRXIAw5nCyIV5G5e-QWviBZME';
const EDIT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=`;

/** Caps mirror the rec codec (share/buildCode.ts). */
const MAX_BREAKPOINTS = 8;
const MAX_WEAPONS = 3;
const MAX_SETS = 3;
const MAX_KEYS = 6;
const MAX_STATS = 4;
const MAX_NOTES = 280;

// --- Committed game data (the same artifacts the server reads) --------------

interface DollEntry {
  id: string;
  name: string;
  slug: string;
}
interface WeaponEntry {
  id: string;
  name: string;
}
interface KeyEntry {
  id: string;
  displayTitle: string | null;
  keyType: string | null;
  dollId: string | null;
}

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.resolve('data', file), 'utf8')) as T;
}

const { dolls } = loadJson<{ dolls: DollEntry[] }>('dolls.json');
const { weapons } = loadJson<{ weapons: WeaponEntry[] }>('weapons.json');
const { keys } = loadJson<{ keys: KeyEntry[] }>('keys.json');
const { attachmentSets } = loadJson<{ attachmentSets: { name: string }[] }>(
  'attachment-sets.json'
);

/** Loose name equality: case/punctuation/whitespace-insensitive. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const weaponByNorm = new Map(weapons.map((w) => [norm(w.name), w]));
const setByNorm = new Map(attachmentSets.map((s) => [norm(s.name), s.name]));
// Known sheet-side misspellings of set names.
setByNorm.set(norm('Allay Support'), 'Ally Support');

/** slot number → key id, per doll (from "Fixed Key N - …" display titles). */
function fixedKeyIdBySlot(dollId: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const k of keys) {
    if (k.dollId !== dollId || k.keyType !== 'Fixed Key') {
      continue;
    }
    const m = /^Fixed Key\s+(\d)\b/i.exec(k.displayTitle ?? '');
    if (m) {
      out.set(Number(m[1]), k.id);
    }
  }
  return out;
}

// --- CSV (RFC 4180: quoted fields, embedded newlines/commas) ----------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- Tab parsing ------------------------------------------------------------

const TOKEN = /V[0-6]|R[1-6]|NA/;
const TOKEN_G = new RegExp(TOKEN.source, 'g');
/** A "V0 > V3 (why) > R1" chain, parenthetical asides allowed between hops. */
const CHAIN = new RegExp(
  `(?:${TOKEN.source})(?:\\s*(?:\\([^)]*\\))?\\s*>\\s*(?:${TOKEN.source}))+`
);

/** Ordered stat tokens → the site's STAT_PREF_OPTIONS labels. */
const STAT_TOKENS: [RegExp, string][] = [
  [/CRIT\s*DMG%?|CDMG%?|CRIT\s*DAMAGE%?/i, 'Crit DMG'],
  [/CRIT(?:\s*RATE)?%?/i, 'Crit Rate'],
  [/ATK%/i, 'ATK%'],
  [/ATK/i, 'ATK'],
  [/DEF%/i, 'DEF%'],
  [/DEF/i, 'DEF'],
  [/HP%/i, 'HP%'],
  [/HP/i, 'HP'],
];

export interface ParsedTab {
  breakpoints: string[];
  /** Where the path came from — 'row', 'explanation', or 'none'. */
  pathSource: 'row' | 'explanation' | 'none';
  weaponNames: string[];
  setNames: string[];
  fixedKeySlots: number[];
  stats: string[];
  notes: string | null;
  warnings: string[];
}

function findRow(rows: string[][], label: string): number {
  return rows.findIndex((r) => r.some((c) => c.trim() === label));
}

function dedupe<T>(list: T[]): T[] {
  return [...new Set(list)];
}

export function parseTab(csv: string): ParsedTab {
  const rows = parseCsv(csv);
  const warnings: string[] = [];
  const noteParts: string[] = [];

  // ---- Suggested path ----
  let breakpoints: string[] = [];
  let pathSource: ParsedTab['pathSource'] = 'none';
  outer: for (const r of rows) {
    for (let i = 0; i < r.length; i++) {
      if (r[i]?.includes('Suggested Path')) {
        const tokens = r
          .slice(i)
          .flatMap((c) => c.trim().match(TOKEN_G) ?? [])
          .filter((t) => t !== 'NA');
        breakpoints = dedupe(tokens);
        if (breakpoints.length > 0) {
          pathSource = 'row';
        }
        break outer;
      }
    }
  }
  // An all-NA (or absent) path row falls through to the Explanation column.
  if (breakpoints.length === 0) {
    // The Explanation column: prose near the path header, sometimes carrying
    // the path as a "V0 > V3 (…) > R1" chain, sometimes a "no path needed"
    // reason worth keeping as the card's note.
    for (const r of rows.slice(0, 8)) {
      for (const c of r) {
        const chain = CHAIN.exec(c);
        if (chain) {
          breakpoints = dedupe(
            (chain[0].match(TOKEN_G) ?? []).filter((t) => t !== 'NA')
          );
          pathSource = 'explanation';
          break;
        }
        const reason =
          /[^.\n]*(?:not require a suggested path|no significant breakthrough[^.\n]*|Vertebrae can be acquired for free[^.\n]*)[^.\n]*/i.exec(
            c
          );
        if (reason) {
          noteParts.push(reason[0].trim().replace(/\s+/g, ' ') + '.');
          pathSource = 'explanation';
          break;
        }
      }
      if (pathSource !== 'none') {
        break;
      }
    }
  }
  if (pathSource === 'none') {
    warnings.push('no suggested path found (needs manual review)');
  }
  if (breakpoints.length > MAX_BREAKPOINTS) {
    warnings.push(`path has ${breakpoints.length} tokens, truncated to 8`);
    breakpoints = breakpoints.slice(0, MAX_BREAKPOINTS);
  }

  // ---- Weapons: known names between "Recommended Weapon" and "F2P Option" ----
  const weaponNames: string[] = [];
  const wj = findRow(rows, 'Recommended Weapon');
  if (wj === -1) {
    warnings.push('no Recommended Weapon section');
  } else {
    const fj = findRow(rows, 'F2P Option');
    const end = fj !== -1 ? fj : Math.min(wj + 8, rows.length);
    for (const r of rows.slice(wj + 1, end)) {
      for (const c of r) {
        const w = weaponByNorm.get(norm(c));
        if (w && !weaponNames.includes(w.name)) {
          weaponNames.push(w.name);
        }
      }
    }
    if (weaponNames.length === 0) {
      warnings.push('no recommended weapons matched known names');
    }
  }

  // ---- Main attachment set (qualifier → notes) ----
  const setNames: string[] = [];
  const mj = findRow(rows, 'Main Set');
  if (mj !== -1) {
    const r = rows[mj] ?? [];
    const i = r.findIndex((c) => c.trim() === 'Main Set');
    for (const c of r.slice(i + 1)) {
      const cell = c.trim();
      if (!cell) {
        continue;
      }
      const firstLine = cell.split('\n')[0]?.trim() ?? '';
      const bare = firstLine.replace(/\s*\(.*$/, '').trim();
      const qualifier = /\(([^)]+)\)/.exec(cell)?.[1]?.trim();
      const known = setByNorm.get(norm(bare));
      if (known) {
        setNames.push(known);
        if (qualifier) {
          noteParts.push(`${known}: ${qualifier}.`);
        }
      } else {
        warnings.push(`unknown main set ${JSON.stringify(bare)}`);
      }
      break; // first non-empty cell after the label is the set
    }
  } else {
    warnings.push('no Main Set row');
  }

  // ---- Substat priority: ordered stat tokens from the Substat cell ----
  const stats: string[] = [];
  const sj = findRow(rows, 'Substat');
  if (sj !== -1) {
    // Only cells AFTER the label: the same row can carry an unrelated skill
    // description (e.g. "…Critical Damage Up II…") in the left columns.
    const r = rows[sj] ?? [];
    const li = r.findIndex((c) => c.trim() === 'Substat');
    const cell = r
      .slice(li + 1)
      .find((c) => STAT_TOKENS.some(([re]) => re.test(c)));
    if (cell) {
      // Walk the cell left-to-right, longest token first at each position.
      let rest = cell;
      while (rest.length > 0 && stats.length < MAX_STATS) {
        let earliest: { idx: number; len: number; label: string } | null = null;
        for (const [re, label] of STAT_TOKENS) {
          const m = re.exec(rest);
          if (
            m &&
            (earliest === null ||
              m.index < earliest.idx ||
              (m.index === earliest.idx && m[0].length > earliest.len))
          ) {
            earliest = { idx: m.index, len: m[0].length, label };
          }
        }
        if (!earliest) {
          break;
        }
        if (!stats.includes(earliest.label)) {
          stats.push(earliest.label);
        }
        rest = rest.slice(earliest.idx + earliest.len);
      }
    }
  }
  if (stats.length === 0) {
    warnings.push('no substat priority parsed');
  }

  // ---- Recommended fixed keys: mains, then alternatives ----
  const keySlots: number[] = [];
  const kj = findRow(rows, 'Recommended Key');
  const aj = findRow(rows, 'Alternatives');
  const collect = (from: number, to: number) => {
    for (const r of rows.slice(from, to)) {
      for (const c of r) {
        for (const m of c.matchAll(/Fixed Key\s*(\d)/g)) {
          const n = Number(m[1]);
          if (!keySlots.includes(n)) {
            keySlots.push(n);
          }
        }
      }
    }
  };
  if (kj !== -1) {
    collect(kj + 1, aj !== -1 ? aj : Math.min(kj + 6, rows.length));
    if (aj !== -1) {
      collect(aj + 1, Math.min(aj + 6, rows.length));
    }
  }
  if (keySlots.length === 0) {
    warnings.push('no recommended keys found');
  }

  const notes = noteParts.join(' ').slice(0, MAX_NOTES) || null;
  return {
    breakpoints,
    pathSource,
    weaponNames,
    setNames: setNames.slice(0, MAX_SETS),
    fixedKeySlots: keySlots.slice(0, MAX_KEYS),
    stats,
    notes,
    warnings,
  };
}

// --- Fetching ---------------------------------------------------------------

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

/** Exact tab titles, scraped from the edit page (order preserved). */
async function fetchTabTitles(): Promise<string[]> {
  const html = await fetchText(EDIT_URL);
  const titles = [...html.matchAll(/docs-sheet-tab-caption">([^<]*)<\/div>/g)]
    .map((m) => m[1] ?? '')
    .filter((t) => t.length > 0);
  if (titles.length === 0) {
    throw new Error(
      'no tab titles found in the sheet edit page — has the page layout changed?'
    );
  }
  return titles;
}

/** The first-tab signature gviz serves when the sheet name does not match. */
function looksLikeHomeTab(csv: string): boolean {
  return csv.slice(0, 2048).includes("Girls' Frontline 2: Exilium Info Sheet");
}

// --- Main -------------------------------------------------------------------

interface Flags {
  dryRun: boolean;
  force: boolean;
  onlyDoll: string | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, force: false, onlyDoll: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      flags.dryRun = true;
    } else if (a === '--force') {
      flags.force = true;
    } else if (a === '--doll') {
      flags.onlyDoll = argv[++i] ?? null;
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const tabs = await fetchTabTitles();
  const tabByNorm = new Map(tabs.map((t) => [norm(t), t]));

  const targets = dolls.filter(
    (d) => flags.onlyDoll === null || d.slug === flags.onlyDoll
  );
  if (targets.length === 0) {
    throw new Error(`no doll with slug ${JSON.stringify(flags.onlyDoll)}`);
  }

  // Rows curated by hand are not overwritten by a re-import (see schema.ts).
  const manualSlugs = new Set<string>();
  if (!flags.force) {
    const rows = await db
      .select({ slug: dollRecommendations.dollSlug })
      .from(dollRecommendations)
      .where(sql`${dollRecommendations.source} = 'manual'`);
    for (const r of rows) {
      manualSlugs.add(r.slug);
    }
  }

  let written = 0;
  const needsReview: string[] = [];
  for (const doll of targets) {
    const tab = tabByNorm.get(norm(doll.name));
    if (!tab) {
      console.log(`✗ ${doll.name}: no sheet tab`);
      needsReview.push(doll.slug);
      continue;
    }
    const csv = await fetchText(GVIZ_URL + encodeURIComponent(tab));
    if (looksLikeHomeTab(csv)) {
      console.log(`✗ ${doll.name}: gviz served the home tab (name mismatch)`);
      needsReview.push(doll.slug);
      continue;
    }
    const parsed = parseTab(csv);

    const slotToId = fixedKeyIdBySlot(doll.id);
    const fixedKeyIds = parsed.fixedKeySlots
      .map((n) => slotToId.get(n))
      .filter((id): id is string => id !== undefined);
    const weaponIds = parsed.weaponNames
      .map((n) => weaponByNorm.get(norm(n))?.id)
      .filter((id): id is string => id !== undefined)
      .slice(0, MAX_WEAPONS);

    const flagsStr = [
      `path:${parsed.pathSource}`,
      parsed.warnings.length > 0 ? `⚠ ${parsed.warnings.join('; ')}` : 'ok',
    ].join(' ');
    console.log(
      `• ${doll.name.padEnd(16)} bp=[${parsed.breakpoints.join('>')}] ` +
        `w=${weaponIds.length} set=[${parsed.setNames.join(',')}] ` +
        `keys=[${parsed.fixedKeySlots.join('>')}] stats=${parsed.stats.length} ${flagsStr}`
    );
    if (parsed.pathSource === 'none') {
      needsReview.push(doll.slug);
    }

    if (flags.dryRun) {
      continue;
    }
    if (manualSlugs.has(doll.slug)) {
      console.log(`  ↳ skipped (manual row; use --force to overwrite)`);
      continue;
    }
    await db
      .insert(dollRecommendations)
      .values({
        dollSlug: doll.slug,
        breakpoints: parsed.breakpoints,
        weaponIds,
        setNames: parsed.setNames,
        fixedKeyIds,
        statPrefs: parsed.stats,
        notes: parsed.notes,
        source: 'sheet',
      })
      .onConflictDoUpdate({
        target: dollRecommendations.dollSlug,
        set: {
          breakpoints: sql`excluded.breakpoints`,
          weaponIds: sql`excluded.weapon_ids`,
          setNames: sql`excluded.set_names`,
          fixedKeyIds: sql`excluded.fixed_key_ids`,
          statPrefs: sql`excluded.stat_prefs`,
          notes: sql`excluded.notes`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
      });
    written++;
    // Be polite to the gviz endpoint.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(
    `\n${flags.dryRun ? 'Dry run — nothing written.' : `Upserted ${written} rows.`}`
  );
  if (needsReview.length > 0) {
    console.log(
      `Needs manual review (${needsReview.length}): ${needsReview.join(', ')}`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

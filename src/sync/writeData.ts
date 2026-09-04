/**
 * Writes the committed JSON artifacts (`data/*.json`) and rebuilds the ones
 * derived from them. Pure file I/O with no database import, so the same code
 * serves the DB-backed export (`exportJson`, after a sync or seed) and the
 * offline datamine export (`npm run export:datamine`).
 *
 * Slugs are derived here: `slugify(name)` (lowercase, spaces → hyphens). If a
 * collision is detected (same slug, different id), the second occurrence gets
 * `<slug>-<regionTag>` to guarantee uniqueness.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveEffectMatrix } from '../derive/effectMatrix.js';
import { deriveEffectTags } from '../derive/effectTags.js';

export const DATA_DIR = join(import.meta.dirname, '..', '..', 'data');

export type Row = Record<string, unknown>;
export type SlugRow = Row & { name: string; regionTag: string | null };

export interface ContentRows {
  dolls: SlugRow[];
  weapons: SlugRow[];
  keys: Row[];
  effects: Row[];
  attachmentSets: Row[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** CJK ideographs: the name is still Chinese, i.e. Global has not localised it. */
const CJK = /[㐀-鿿]/;

/**
 * A slug for a row whose name is still Chinese — a CN-only record the
 * datamine ships under its CN name until Global localises it. Plain
 * `slugify` would strip it to nothing ("斯诺特拉" → "", "格威尔36-康派科特" →
 * "36-"), which is a dead or colliding URL. The game id is stable and
 * survives the later rename, so the URL does too. Latin names that happen to
 * have no letters ("416") keep their slug: those are live URLs.
 */
function idSlug(row: Row): string | null {
  const gameId = row.gunWeaponDataId ?? row.gunDataId ?? row.gameId;
  return gameId == null ? null : String(gameId);
}

/**
 * Ensure slugs are unique — append regionTag on the first collision, then
 * fall back to a numeric suffix (covers null regionTags, 3+ rows sharing a
 * name, and region-suffixed slugs colliding with a real name).
 */
export function assignSlugs<T extends SlugRow>(
  rows: T[]
): (T & { slug: string })[] {
  const used = new Set<string>();
  return rows.map((row) => {
    let base = slugify(row.name);
    if (!/[a-z]/.test(base) && CJK.test(row.name)) {
      base = idSlug(row) ?? base;
    }
    let slug = base;
    if (used.has(slug) && row.regionTag) {
      slug = `${base}-${row.regionTag}`;
    }
    for (let n = 2; used.has(slug); n++) {
      slug = `${base}-${n}`;
    }
    used.add(slug);
    return { ...row, slug };
  });
}

/**
 * Re-key `row` in the order `reference` uses, unknown keys last. The DB export
 * emits columns in schema order; an offline export that copied the datamine's
 * key order would otherwise rewrite every line of the committed files.
 */
function orderLike(reference: Row | undefined, row: Row): Row {
  if (!reference) {
    return row;
  }
  const out: Row = {};
  for (const k of Object.keys(reference)) {
    if (k in row) {
      out[k] = jsonbOrder(row[k]);
    }
  }
  for (const k of Object.keys(row)) {
    if (!(k in out)) {
      out[k] = jsonbOrder(row[k]);
    }
  }
  return out;
}

/**
 * Postgres `jsonb` stores object keys sorted by length, then bytewise, and
 * the DB export writes the jsonb columns (skills, vertebrae, ...) back out in
 * that order. Apply the same order to nested values so an offline export is
 * byte-identical to a DB export of the same content.
 */
function jsonbOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(jsonbOrder);
  }
  if (value && typeof value === 'object') {
    const obj = value as Row;
    const keys = Object.keys(obj).sort(
      (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
    );
    const out: Row = {};
    for (const k of keys) {
      out[k] = jsonbOrder(obj[k]);
    }
    return out;
  }
  return value;
}

/** The rows a data file currently holds, or none if it is absent/unreadable. */
async function existingRows(
  dataDir: string,
  file: string,
  key: string
): Promise<Row[]> {
  try {
    const payload = JSON.parse(await readFile(join(dataDir, file), 'utf-8'));
    const rows = payload?.[key];
    return Array.isArray(rows) ? (rows as Row[]) : [];
  } catch {
    return [];
  }
}

function rowId(row: Row): string {
  return String(row.id ?? row.name);
}

/**
 * Keep the committed file's row order for rows it already has; new rows go
 * last in incoming order. The DB export orders by whatever the select
 * returns, so without this every refresh would shuffle thousands of lines.
 */
function orderRowsLike(existing: Row[], rows: Row[]): Row[] {
  if (existing.length === 0) {
    return rows;
  }
  const incoming = new Map(rows.map((r) => [rowId(r), r]));
  const out: Row[] = [];
  for (const prev of existing) {
    const row = incoming.get(rowId(prev));
    if (row) {
      out.push(row);
      incoming.delete(rowId(prev));
    }
  }
  return [...out, ...incoming.values()];
}

const FILES = [
  ['dolls', 'dolls.json', 'dolls'],
  ['weapons', 'weapons.json', 'weapons'],
  ['keys', 'keys.json', 'keys'],
  ['effects', 'effects.json', 'effects'],
  ['attachmentSets', 'attachment-sets.json', 'attachmentSets'],
] as const;

/** Write the five content files. Returns the row counts written. */
export async function writeDataFiles(
  rows: ContentRows,
  dataDir = DATA_DIR
): Promise<Record<keyof ContentRows, number>> {
  await mkdir(dataDir, { recursive: true });
  const now = new Date().toISOString();

  const out: ContentRows = {
    dolls: assignSlugs(rows.dolls),
    weapons: assignSlugs(rows.weapons),
    keys: rows.keys,
    effects: rows.effects,
    attachmentSets: rows.attachmentSets,
  };

  await Promise.all(
    FILES.map(async ([field, file, key]) => {
      const existing = await existingRows(dataDir, file, key);
      const ordered = orderRowsLike(existing, out[field]).map((r) =>
        orderLike(existing[0], r)
      );
      await writeFile(
        join(dataDir, file),
        JSON.stringify({ syncedAt: now, [key]: ordered }, null, 2) + '\n'
      );
    })
  );

  return {
    dolls: out.dolls.length,
    weapons: out.weapons.length,
    keys: out.keys.length,
    effects: out.effects.length,
    attachmentSets: out.attachmentSets.length,
  };
}

/**
 * Rebuild `effect-matrix.json` and `effect-tags.json` from the files just
 * written, and copy the datamine's `cn-translated.json` sidecar (which strings
 * its manual CN→EN registry produced, for the "translated from CN" badge) when
 * a source directory carrying one is given. Not DB content.
 */
export async function deriveArtifacts(
  dataDir = DATA_DIR,
  srcDir?: string
): Promise<void> {
  await deriveEffectMatrix(dataDir);
  await deriveEffectTags(dataDir);
  if (srcDir) {
    try {
      await copyFile(
        join(srcDir, 'cn-translated.json'),
        join(dataDir, 'cn-translated.json')
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

/** Load one of the datamine's app-formatted files (`{ <key>: [...] }`). */
export async function loadContentFile(
  dir: string,
  file: string,
  key: string
): Promise<Row[]> {
  const payload = JSON.parse(await readFile(join(dir, file), 'utf-8'));
  const rows = payload[key];
  if (!Array.isArray(rows)) {
    throw new Error(`${file} has no array at key "${key}"`);
  }
  return rows as Row[];
}

/** Load all five app-formatted files from a datamine `out-app` directory. */
export async function loadContentDir(dir: string): Promise<ContentRows> {
  return {
    dolls: (await loadContentFile(dir, 'dolls.json', 'dolls')) as SlugRow[],
    weapons: (await loadContentFile(
      dir,
      'weapons.json',
      'weapons'
    )) as SlugRow[],
    keys: await loadContentFile(dir, 'keys.json', 'keys'),
    effects: await loadContentFile(dir, 'effects.json', 'effects'),
    attachmentSets: await loadContentFile(
      dir,
      'attachment-sets.json',
      'attachmentSets'
    ),
  };
}

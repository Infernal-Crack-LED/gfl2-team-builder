#!/usr/bin/env node
/**
 * Seed the content tables from the datamine's app-formatted output.
 *
 *   npm run seed:datamine -- --src ../out-app            (dry run, default)
 *   npm run seed:datamine -- --src ../out-app --execute  (write to DB)
 *   npm run seed:datamine -- --src ../out-app --execute --export
 *
 * Reads `dolls.json`, `weapons.json`, `keys.json`, `effects.json`,
 * `attachment-sets.json` produced by `python -m gfl2dm.appformat` (already in
 * this schema's raw shape: uuidv5 ids derived from game ids, markers
 * rewritten, jsonb blocks assembled) and upserts them.
 *
 * Dry run (default) connects read-only: it reports incoming vs current row
 * counts, id overlap, and rows that would be deleted, and writes NOTHING.
 * `--export` additionally regenerates data/*.json + derived artifacts after
 * seeding (the same paths `runSync` uses), so the committed JSON and the DB
 * cannot drift.
 *
 * Replacement semantics: rows whose id is absent from the incoming set are
 * DELETED (the datamine is the complete source of truth for content tables).
 * User data (`user_profiles`) and `doll_recommendations` are untouched here —
 * see purge-dandegate.ts and import-recommendations.ts.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { notInArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { attachmentSets, dolls, effects, keys, weapons } from '../db/schema.js';

type Row = Record<string, unknown>;

async function loadJson(
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

/** Strip fields that are export-time derivations, not columns. */
function stripDerived(row: Row, fields: string[]): Row {
  const copy = { ...row };
  for (const f of fields) {
    delete copy[f];
  }
  return copy;
}

const CHUNK = 200;

async function upsertChunked(
  table: typeof dolls | typeof weapons | typeof keys | typeof effects,
  rows: Row[],
  conflictTarget: { id: unknown }
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) {
      continue;
    }
    const cols = Object.keys(chunk[0] as Row);
    const setClause = Object.fromEntries(
      cols
        .filter((c) => c !== 'id')
        .map((c) => [c, sql.raw(`excluded."${camelToSnake(c)}"`)])
    );
    await db
      .insert(table)
      .values(chunk as never)
      .onConflictDoUpdate({
        target: conflictTarget.id as never,
        set: { ...setClause, syncedAt: sql`now()` } as never,
      });
  }
}

function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const doExport = args.includes('--export');
  const srcIdx = args.indexOf('--src');
  const src = resolve((srcIdx >= 0 && args[srcIdx + 1]) || '../out-app');

  const incoming = {
    dolls: await loadJson(src, 'dolls.json', 'dolls'),
    weapons: await loadJson(src, 'weapons.json', 'weapons'),
    keys: await loadJson(src, 'keys.json', 'keys'),
    effects: await loadJson(src, 'effects.json', 'effects'),
    attachmentSets: await loadJson(
      src,
      'attachment-sets.json',
      'attachmentSets'
    ),
  };

  // `slug` is derived at export time from `name`; it is not a column.
  const dollRows = incoming.dolls.map((d) => stripDerived(d, ['slug']));
  const weaponRows = incoming.weapons.map((w) => stripDerived(w, ['slug']));

  const tables = [
    { name: 'dolls', table: dolls, idCol: dolls.id, rows: dollRows },
    { name: 'weapons', table: weapons, idCol: weapons.id, rows: weaponRows },
    { name: 'keys', table: keys, idCol: keys.id, rows: incoming.keys },
    {
      name: 'effects',
      table: effects,
      idCol: effects.id,
      rows: incoming.effects,
    },
  ] as const;

  console.log(
    `Source: ${src}${execute ? '' : '   (DRY RUN — nothing will be written)'}`
  );
  for (const t of tables) {
    const incomingIds = new Set(t.rows.map((r) => String(r.id)));
    const current = await db.select({ id: t.idCol }).from(t.table as never);
    const currentIds = new Set(current.map((r: { id: string }) => r.id));
    const kept = [...currentIds].filter((id) => incomingIds.has(id)).length;
    const removed = currentIds.size - kept;
    console.log(
      `${t.name.padEnd(16)} incoming ${String(t.rows.length).padStart(5)} | ` +
        `current ${String(currentIds.size).padStart(5)} | ` +
        `id overlap ${kept} | would delete ${removed}`
    );
  }
  const currentSets = await db
    .select({ name: attachmentSets.name })
    .from(attachmentSets);
  console.log(
    `attachment sets  incoming ${incoming.attachmentSets.length} | current ${currentSets.length}`
  );

  if (!execute) {
    console.log('\nDry run complete. Re-run with --execute to write.');
    process.exit(0);
  }

  for (const t of tables) {
    const incomingIds = t.rows.map((r) => String(r.id));
    await upsertChunked(t.table as never, t.rows, { id: t.idCol });
    await db.delete(t.table as never).where(notInArray(t.idCol, incomingIds));
    console.log(`${t.name}: upserted ${t.rows.length}, pruned rows not in set`);
  }

  const setNames = incoming.attachmentSets.map((a) => String(a.name));
  for (const a of incoming.attachmentSets) {
    await db
      .insert(attachmentSets)
      .values(a as never)
      .onConflictDoUpdate({
        target: attachmentSets.name,
        set: {
          piecesRequired: sql`excluded.pieces_required`,
          description: sql`excluded.description`,
          syncedAt: sql`now()`,
        } as never,
      });
  }
  if (setNames.length > 0) {
    await db
      .delete(attachmentSets)
      .where(notInArray(attachmentSets.name, setNames));
  }
  console.log(`attachment sets: upserted ${setNames.length}`);

  if (doExport) {
    const { exportJson, DATA_DIR } = await import('../sync/export.js');
    await exportJson();
    const { deriveEffectMatrix } = await import('../derive/effectMatrix.js');
    const { deriveEffectTags } = await import('../derive/effectTags.js');
    await deriveEffectMatrix(DATA_DIR);
    await deriveEffectTags(DATA_DIR);
    // sidecar, not DB content: which strings the datamine's manual CN->EN
    // registry produced, for the site's "translated from CN" badge
    const { copyFileSync, existsSync } = await import('node:fs');
    const sidecar = resolve(src, 'cn-translated.json');
    if (existsSync(sidecar)) {
      copyFileSync(sidecar, resolve(DATA_DIR, 'cn-translated.json'));
    }
    console.log('Exported data/*.json and derived artifacts.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

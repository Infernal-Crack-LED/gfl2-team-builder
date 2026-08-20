#!/usr/bin/env node
/**
 * Purge every Dandegate-era row from the database.
 *
 *   npm run purge:dandegate              (dry run, default — read-only)
 *   npm run purge:dandegate -- --execute
 *
 * What goes:
 *   - all content tables (dolls, weapons, keys, effects, attachment_sets) —
 *     their UUIDs were minted by Dandegate; the datamine seed replaces them
 *   - user_profiles rows of kind 'gfl2-share' (short share links, all owners
 *     including 'anon' and 'bot') — the codes inside embed Dandegate ids
 *   - doll_recommendations — its weapon/key id arrays are Dandegate UUIDs;
 *     re-imported from the in-house sheet source afterwards
 *   - infographics — scraped rows from the same era; the bot re-scrapes
 *   - gfl2_sync_runs — audit rows of the retired Dandegate sync
 *
 * What stays:
 *   - user_profiles rows of every other kind — saved builds and teams are
 *     kept per the maintainer's decision. NOTE: bumping BUILD_VERSION makes
 *     their stored codes undecodable (by design — old codes must be rejected,
 *     not decoded against ids that now mean something different).
 *
 * Also remember (not automatable from here): the server's render-cache/
 * directory holds share-card PNGs keyed by content hash — bump
 * RENDERER_VERSION or clear the directory on deploy.
 */
import 'dotenv/config';
import { eq, ne, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import {
  attachmentSets,
  dollRecommendations,
  dolls,
  effects,
  gfl2SyncRuns,
  infographics,
  keys,
  userProfiles,
  weapons,
} from '../db/schema.js';

const SHARE_KIND = 'gfl2-share';

async function count(table: PgTable): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
}

async function main() {
  const execute = process.argv.includes('--execute');

  const contentTables = [
    { name: 'dolls', table: dolls },
    { name: 'weapons', table: weapons },
    { name: 'keys', table: keys },
    { name: 'effects', table: effects },
    { name: 'attachment_sets', table: attachmentSets },
    { name: 'doll_recommendations', table: dollRecommendations },
    { name: 'infographics', table: infographics },
    { name: 'gfl2_sync_runs', table: gfl2SyncRuns },
  ] as const;

  console.log(execute ? 'EXECUTING purge:' : 'DRY RUN (read-only):');
  for (const t of contentTables) {
    const n = await count(t.table);
    console.log(
      `  ${t.name.padEnd(22)} ${String(n).padStart(6)} rows -> delete ALL`
    );
  }

  const [shares] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userProfiles)
    .where(eq(userProfiles.kind, SHARE_KIND));
  const shareByOwner = await db
    .select({
      owner: sql<string>`case when discord_id in ('anon','bot') then discord_id else 'user' end`,
      n: sql<number>`count(*)::int`,
    })
    .from(userProfiles)
    .where(eq(userProfiles.kind, SHARE_KIND))
    .groupBy(sql`1`);
  const [kept] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userProfiles)
    .where(ne(userProfiles.kind, SHARE_KIND));
  const keptKinds = await db
    .select({ kind: userProfiles.kind, n: sql<number>`count(*)::int` })
    .from(userProfiles)
    .where(ne(userProfiles.kind, SHARE_KIND))
    .groupBy(userProfiles.kind);

  console.log(
    `  user_profiles (${SHARE_KIND.padEnd(11)}) ${String(shares?.n ?? 0).padStart(6)} rows -> delete ` +
      `(${shareByOwner.map((r) => `${r.owner}: ${r.n}`).join(', ') || 'none'})`
  );
  console.log(
    `  user_profiles (other kinds)  ${String(kept?.n ?? 0).padStart(6)} rows -> KEEP ` +
      `(${keptKinds.map((r) => `${r.kind}: ${r.n}`).join(', ') || 'none'})`
  );

  if (!execute) {
    console.log('\nDry run complete. Re-run with --execute to delete.');
    process.exit(0);
  }

  for (const t of contentTables) {
    await db.delete(t.table);
    console.log(`  deleted all rows from ${t.name}`);
  }
  await db.delete(userProfiles).where(eq(userProfiles.kind, SHARE_KIND));
  console.log(`  deleted user_profiles kind='${SHARE_KIND}'`);

  console.log('\nPurge complete. Next steps:');
  console.log(
    '  1. npm run seed:datamine -- --src <out-app> --execute --export'
  );
  console.log('  2. npm run import:recs -- --execute');
  console.log(
    '  3. clear render-cache/ on the server (or rely on the RENDERER_VERSION bump)'
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

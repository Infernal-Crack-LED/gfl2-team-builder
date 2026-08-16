/**
 * Export committed JSON artifacts from the database. Runs after the sync
 * upserts and writes `data/dolls.json`, `data/weapons.json`, `data/keys.json`,
 * `data/effects.json` — the build inputs the web app imports at build time.
 *
 * Slugs are derived at export time: `slugify(name)` (lowercase, spaces →
 * hyphens). If a collision is detected (same slug, different id), the
 * second occurrence gets `<slug>-<regionTag>` to guarantee uniqueness.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../db/index.js';
import { dolls, effects, keys, weapons, attachmentSets } from '../db/schema.js';

const DATA_DIR = join(import.meta.dirname, '..', '..', 'data');

export { DATA_DIR };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Ensure slugs are unique — append regionTag on collision. */
function assignSlugs<T extends { name: string; slug?: string; regionTag: string | null }>(
  rows: T[]
): (T & { slug: string })[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    let slug = slugify(row.name);
    const count = seen.get(slug) ?? 0;
    if (count > 0 && row.regionTag) {
      slug = `${slug}-${row.regionTag}`;
    }
    seen.set(slugify(row.name), count + 1);
    return { ...row, slug };
  });
}

export async function exportJson(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const dollRows = await db.select().from(dolls);
  const weaponRows = await db.select().from(weapons);
  const keyRows = await db.select().from(keys);
  const effectRows = await db.select().from(effects);
  const attachmentSetRows = await db.select().from(attachmentSets);

  const now = new Date().toISOString();

  // Dolls — strip internal timestamps, add slug
  const dollsOut = assignSlugs(
    dollRows.map(({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest)
  );

  // Weapons — strip internal timestamps, add slug
  const weaponsOut = assignSlugs(
    weaponRows.map(({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest)
  );

  // Keys — strip internal timestamps
  const keysOut = keyRows.map(
    ({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest
  );

  // Effects — strip internal timestamps
  const effectsOut = effectRows.map(
    ({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest
  );

  // Attachment sets — strip internal timestamps
  const attachmentSetsOut = attachmentSetRows.map(
    ({ syncedAt: _s, ...rest }) => rest
  );

  await Promise.all([
    writeFile(
      join(DATA_DIR, 'dolls.json'),
      JSON.stringify({ syncedAt: now, dolls: dollsOut }, null, 2) + '\n'
    ),
    writeFile(
      join(DATA_DIR, 'weapons.json'),
      JSON.stringify({ syncedAt: now, weapons: weaponsOut }, null, 2) + '\n'
    ),
    writeFile(
      join(DATA_DIR, 'keys.json'),
      JSON.stringify({ syncedAt: now, keys: keysOut }, null, 2) + '\n'
    ),
    writeFile(
      join(DATA_DIR, 'effects.json'),
      JSON.stringify({ syncedAt: now, effects: effectsOut }, null, 2) + '\n'
    ),
    writeFile(
      join(DATA_DIR, 'attachment-sets.json'),
      JSON.stringify({ syncedAt: now, attachmentSets: attachmentSetsOut }, null, 2) + '\n'
    ),
  ]);

  console.log(
    `Exported JSON: ${dollsOut.length} dolls, ${weaponsOut.length} weapons, ${keysOut.length} keys, ${effectsOut.length} effects, ${attachmentSetsOut.length} attachment sets → data/`
  );
}

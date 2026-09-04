/**
 * Export committed JSON artifacts from the database. Runs after the sync
 * upserts and writes `data/dolls.json`, `data/weapons.json`, `data/keys.json`,
 * `data/effects.json` — the build inputs the web app imports at build time.
 *
 * The file writing (slug derivation, key order, syncedAt stamp) lives in
 * `writeData.ts` so `npm run export:datamine` can produce the same files
 * without a database.
 */

import { db } from '../db/index.js';
import { dolls, effects, keys, weapons, attachmentSets } from '../db/schema.js';
import { DATA_DIR, writeDataFiles } from './writeData.js';

export { DATA_DIR };

export async function exportJson(): Promise<void> {
  const dollRows = await db.select().from(dolls);
  const weaponRows = await db.select().from(weapons);
  const keyRows = await db.select().from(keys);
  const effectRows = await db.select().from(effects);
  const attachmentSetRows = await db.select().from(attachmentSets);

  // Strip internal timestamps; slugs are added by writeDataFiles.
  const counts = await writeDataFiles({
    dolls: dollRows.map(({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest),
    weapons: weaponRows.map(
      ({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest
    ),
    keys: keyRows.map(({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest),
    effects: effectRows.map(
      ({ syncedAt: _s, apiUpdatedAt: _a, ...rest }) => rest
    ),
    attachmentSets: attachmentSetRows.map(({ syncedAt: _s, ...rest }) => rest),
  });

  console.log(
    `Exported JSON: ${counts.dolls} dolls, ${counts.weapons} weapons, ${counts.keys} keys, ${counts.effects} effects, ${counts.attachmentSets} attachment sets → data/`
  );
}

#!/usr/bin/env node
/**
 * Offline export: write `data/*.json` and the derived artifacts straight from
 * the datamine's app-formatted output, with no database.
 *
 *   npm run export:datamine -- --src ../gfl2-datamine/out-app
 *
 * `seed:datamine --export` upserts into Postgres and then exports what the DB
 * holds. That round trip is the identity — the datamine already emits the raw
 * column shape, and the committed files matched its output row for row — so
 * the dataset the site builds from can be refreshed from any checkout. The
 * database still needs `seed:datamine --execute` before the bot and the API
 * serve the same content; this script does not touch it.
 */
import { resolve } from 'node:path';
import {
  DATA_DIR,
  deriveArtifacts,
  loadContentDir,
  writeDataFiles,
} from '../sync/writeData.js';

async function main() {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf('--src');
  const src = resolve(
    (srcIdx >= 0 && args[srcIdx + 1]) || '../gfl2-datamine/out-app'
  );

  const rows = await loadContentDir(src);
  const counts = await writeDataFiles(rows, DATA_DIR);
  console.log(
    `Wrote data/*.json from ${src}: ${counts.dolls} dolls, ${counts.weapons} weapons, ` +
      `${counts.keys} keys, ${counts.effects} effects, ${counts.attachmentSets} attachment sets`
  );

  await deriveArtifacts(DATA_DIR, src);
  console.log(
    'Derived effect-matrix.json and effect-tags.json; copied cn-translated.json.'
  );
  console.log(
    'The database was not updated — run `npm run seed:datamine -- --src <dir> --execute` for the bot/API.'
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

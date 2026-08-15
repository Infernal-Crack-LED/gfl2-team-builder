#!/usr/bin/env node
import 'dotenv/config';
import { runSync } from '../sync/run.js';

async function main() {
  const trigger = process.argv[2] ?? 'cli';
  console.log(`Starting sync (trigger: ${trigger})...`);

  const summary = await runSync(trigger);

  console.log('\n--- Sync complete ---');
  console.log(`Status:  ${summary.status}`);
  console.log(`Dolls:   ${summary.dolls}`);
  console.log(`Weapons: ${summary.weapons}`);
  console.log(`Keys:    ${summary.keys}`);
  console.log(`Effects: ${summary.effects}`);

  if (summary.errors.length > 0) {
    console.log(`\nErrors (${summary.errors.length}):`);
    for (const err of summary.errors) {
      console.log(`  - ${err}`);
    }
  }

  process.exit(summary.status === 'error' ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

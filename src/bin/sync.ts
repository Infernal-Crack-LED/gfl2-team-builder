#!/usr/bin/env node
import 'dotenv/config';
import { runSync } from '../sync/run.js';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const trigger = args.find((a) => !a.startsWith('-')) ?? 'cli';

  const summary = await runSync({ trigger, force });

  console.log('\n--- Sync complete ---');
  console.log(`Status:          ${summary.status}`);
  console.log(`Changed:         ${summary.changed}`);
  console.log(
    `Dolls:           ${summary.dolls} (skipped ${summary.skipped.dolls})`
  );
  console.log(
    `Weapons:         ${summary.weapons} (skipped ${summary.skipped.weapons})`
  );
  console.log(
    `Keys:            ${summary.keys} (skipped ${summary.skipped.keys})`
  );
  console.log(
    `Effects:         ${summary.effects} (skipped ${summary.skipped.effects})`
  );
  console.log(`Attachment sets: ${summary.attachmentSets}`);
  console.log(`Infographics:    ${summary.infographics}`);

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

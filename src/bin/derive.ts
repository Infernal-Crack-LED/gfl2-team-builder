#!/usr/bin/env node
/**
 * Standalone derivation — rebuilds `data/effect-matrix.json` and
 * `data/effect-tags.json` from the committed JSON artifacts without touching
 * the database. Runs automatically at the end of `npm run sync`; use this
 * directly to re-derive after hand-editing data or to print the QA report
 * (`--report`).
 */

import { join } from 'node:path';
import { deriveEffectMatrix } from '../derive/effectMatrix.js';
import { deriveEffectTags } from '../derive/effectTags.js';

const DATA_DIR = join(import.meta.dirname, '..', '..', 'data');

async function main() {
  const report = process.argv.includes('--report');

  const { file, stats } = await deriveEffectMatrix(DATA_DIR);
  const { file: tagsFile, stats: tagStats } = await deriveEffectTags(DATA_DIR);

  console.log(
    `Effect matrix: ${file.effects.length} effects ` +
      `(${stats.effectsWithSources} with sources, ${stats.effectsWithInteractions} with interactions) → data/effect-matrix.json`
  );
  console.log(
    `Effect tags: ${tagStats.effectsTagged}/${tagStats.effectsTotal} effects tagged ` +
      `(${Object.keys(tagsFile.vocabulary).length} tags in vocabulary) → data/effect-tags.json`
  );

  if (!report) {
    return;
  }

  console.log('\n--- Edges by relation ---');
  for (const [relation, count] of Object.entries(stats.edgesByRelation)) {
    console.log(`  ${relation.padEnd(12)} ${count}`);
  }

  console.log('\n--- Edges by source kind ---');
  for (const [kind, count] of Object.entries(stats.edgesByKind).sort()) {
    console.log(`  ${kind.padEnd(16)} ${count}`);
  }

  console.log('\n--- Effects per tag ---');
  for (const [tag, count] of Object.entries(tagStats.tagCounts).sort()) {
    const label = tagsFile.vocabulary[tag]?.label ?? tag;
    console.log(`  ${label.padEnd(22)} ${count}`);
  }

  if (tagStats.untagged.length > 0) {
    console.log(`\n--- Untagged effects (${tagStats.untagged.length}) ---`);
    for (const name of tagStats.untagged) {
      console.log(`  ${name}`);
    }
  }

  if (file.unresolvedRefs.length > 0) {
    console.log(`\n--- Unresolved effect refs (${file.unresolvedRefs.length}) ---`);
    for (const ref of file.unresolvedRefs) {
      console.log(`  ${ref.effectId}  in ${ref.foundIn}`);
    }
  }

  if (stats.mentions.length > 0) {
    console.log(`\n--- Unclassified "mentions" edges (${stats.mentions.length}) ---`);
    for (const m of stats.mentions) {
      console.log(`  [${m.effectName ?? '?'}] ${m.source}`);
      console.log(`      ${m.snippet}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

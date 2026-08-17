#!/usr/bin/env node
/**
 * Fetches every image the site serves itself:
 * - UI icons (class / phase / ammo / Imago factor) from iopwiki
 * - skill, summon and key art mirrored off the Dandegate CDN
 *
 * Pass --force to re-download art that is already present.
 */
import { mirrorAssets } from '../sync/assets.js';
import { fetchIcons, ICON_DIR } from '../sync/wikiIcons.js';

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const force = process.argv.includes('--force');

  console.log('Fetching GFL2 UI icons from iopwiki...');
  const manifest = await fetchIcons();
  console.log(`  ${manifest.icons.length} icons -> ${ICON_DIR}`);
  console.log(`  License: ${manifest.license} (${manifest.source})`);

  console.log('\nMirroring game art from the Dandegate CDN...');
  const assets = await mirrorAssets(force);
  console.log(`  Referenced: ${assets.found}`);
  console.log(`  Downloaded: ${assets.downloaded} (${mb(assets.bytes)})`);
  console.log(`  Already present: ${assets.skipped}`);

  if (assets.errors.length > 0) {
    console.log(`\nErrors (${assets.errors.length}):`);
    for (const err of assets.errors) {
      console.log(`  - ${err}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

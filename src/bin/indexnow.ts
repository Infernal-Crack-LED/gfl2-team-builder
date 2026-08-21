/**
 * Tell IndexNow which pages changed.
 *
 *   npm run indexnow                 # dry run (default) — submits nothing
 *   npm run indexnow -- --submit     # actually POST
 *   npm run indexnow -- --all        # every crawlable URL, not just data pages
 *
 * Run after a content sync (`npm run seed:datamine` → rebuild → deploy). The
 * protocol is an update notification, so the default batch is the pages whose
 * text a sync actually rewrites — the dolls, weapons, keys and the catalogues
 * and facets that list them. The landing page and the legal pages are static
 * and are left out; announcing an unchanged page teaches the endpoint to
 * discount the ones that did change.
 *
 * Bing, Yandex, Naver and Seznam consume this. Google does not participate —
 * see src/share/indexnow.ts.
 *
 * Dry run by default, matching `import:recs`: this reaches OUT to a third party
 * and names URLs on a live site, so the harmless call is the one you get for
 * free and the real one has to be asked for.
 */
import { fileURLToPath } from 'node:url';
import { SITE } from '../share/pageMeta.js';
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY_FILE,
  describeIndexNowStatus,
  indexNowPayload,
} from '../share/indexnow.js';
import { allDolls, allFacets, allWeapons } from '../server/gameData.js';
import { generateSitemap } from './build-sitemap.js';

/** The URLs a data sync rewrites. */
function changedUrls(): string[] {
  return [
    `${SITE}/characters`,
    `${SITE}/weapons`,
    `${SITE}/keys`,
    ...allFacets().map((f) => SITE + f.path),
    ...allDolls().flatMap((d) => [
      `${SITE}/characters/${d.slug}`,
      `${SITE}/builder/${d.slug}`,
    ]),
    ...allWeapons().map((w) => `${SITE}/weapons/${w.slug}`),
  ];
}

/** Everything in the sitemap — for a one-off announcement of the whole site. */
function allUrls(): string[] {
  return [...generateSitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1] as string
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const submit = argv.includes('--submit');
  const urls = argv.includes('--all') ? allUrls() : changedUrls();
  const payload = indexNowPayload(SITE, urls);

  console.log(
    `indexnow: ${payload.urlList.length} URLs, key file ${payload.keyLocation}`
  );
  if (!submit) {
    console.log('  dry run — pass --submit to POST. First five:');
    for (const url of payload.urlList.slice(0, 5)) {
      console.log(`    ${url}`);
    }
    return;
  }

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const { ok, message } = describeIndexNowStatus(res.status);
  console.log(`  ${res.status} — ${message}`);
  if (!ok) {
    if (res.status === 403) {
      console.error(
        `  Check that ${SITE}/${INDEXNOW_KEY_FILE} is live and returns the key.`
      );
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

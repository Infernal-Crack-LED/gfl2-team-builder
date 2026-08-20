/**
 * Generate web/public/sitemap.xml from the canonical route table + every doll,
 * weapon and doll-builder page.
 *
 *   npm run sitemap
 *
 * Hand-maintaining this file meant the 64 doll pages and 185 weapon pages — the
 * bulk of the site's indexable surface — were never listed at all. Run after a
 * sync adds rows; `sitemap.test.ts` fails if the committed file has drifted, so
 * a forgotten run cannot ship silently.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_META, SITE } from '../share/pageMeta.js';
import { allDolls, allWeapons } from '../server/gameData.js';

const OUT = path.resolve('web', 'public', 'sitemap.xml');

/**
 * Crawl priority per route. `saved` is deliberately absent: it renders one
 * visitor's own saved builds behind a Discord session (and is served
 * `noindex` — see pageMeta.ts NOINDEX_KEYS).
 */
const ROUTE_PRIORITY: Record<string, number> = {
  home: 1.0,
  characters: 0.9,
  weapons: 0.8,
  keys: 0.8,
  'team-builder': 0.8,
  builder: 0.8,
  tools: 0.7,
  infographics: 0.7,
  credits: 0.3,
  dev: 0.3,
  usage: 0.3,
  privacy: 0.2,
  terms: 0.2,
};

/** Detail-page priorities: the doll profile outranks its build planner. */
const DOLL_PRIORITY = 0.7;
const WEAPON_PRIORITY = 0.6;
const BUILDER_PRIORITY = 0.5;

/** Route key → path. Mirror of web/src/router.ts hrefFor. */
function pathForRoute(key: string): string {
  if (key === 'home') {
    return '/';
  }
  if (key === 'infographics') {
    return '/tools/infographics';
  }
  return `/${key}`;
}

export function generateSitemap(): string {
  const routes = Object.keys(ROUTE_META)
    .map((key) => ({ path: pathForRoute(key), priority: ROUTE_PRIORITY[key] }))
    .filter((r): r is { path: string; priority: number } =>
      // A route with no priority is deliberately unlisted (only /saved today).
      Number.isFinite(r.priority)
    );

  // Every doll and weapon gets a page, so every one of them belongs here —
  // including `preview` rows. A page the site links from its own grid but
  // withholds from the sitemap is an inconsistent crawl policy, and thin
  // content is a content problem, not a discovery problem.
  const dolls = [...allDolls()].map((d) => d.slug).sort();
  const weapons = [...allWeapons()].map((w) => w.slug).sort();

  const urls = [
    ...routes,
    ...dolls.map((slug) => ({
      path: `/characters/${slug}`,
      priority: DOLL_PRIORITY,
    })),
    ...weapons.map((slug) => ({
      path: `/weapons/${slug}`,
      priority: WEAPON_PRIORITY,
    })),
    ...dolls.map((slug) => ({
      path: `/builder/${slug}`,
      priority: BUILDER_PRIORITY,
    })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${SITE}${u.path}</loc>\n    <priority>${u.priority.toFixed(1)}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function main(): void {
  const xml = generateSitemap();
  writeFileSync(OUT, xml, 'utf8');
  const count = (xml.match(/<url>/g) ?? []).length;
  console.log(`sitemap: wrote ${count} URLs to ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

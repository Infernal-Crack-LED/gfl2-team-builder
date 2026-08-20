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
import {
  allDolls,
  allFacets,
  allWeapons,
  dataSyncedAt,
} from '../server/gameData.js';

const OUT = path.resolve('web', 'public', 'sitemap.xml');

/**
 * Crawl priority per route. Two routes are deliberately absent:
 *   - `saved` renders one visitor's own saved builds behind a Discord session
 *     (and is served `noindex` — see pageMeta.ts NOINDEX_KEYS).
 *   - `dev` is an about-the-author page. It stays reachable and indexable if
 *     Google finds it via the footer; it just isn't worth spending crawl
 *     budget nominating alongside the pages that are the site's actual reason
 *     to exist.
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
  usage: 0.3,
  privacy: 0.2,
  terms: 0.2,
};

/** Detail-page priorities: the doll profile outranks its build planner. */
const DOLL_PRIORITY = 0.7;
const WEAPON_PRIORITY = 0.6;
const BUILDER_PRIORITY = 0.5;
/** Between the catalogues and the detail pages — a facet is a hub, not a leaf. */
const FACET_PRIORITY = 0.75;

/**
 * Routes whose content is rendered FROM data/*.json, so a sync is what changes
 * them and `dataSyncedAt()` is a true <lastmod>. Every other route (the
 * landing page, the interactive tools, credits and the legal pages) is hand-
 * written and changes on its own schedule — stamping those with the sync date
 * would claim an edit that never happened, and a sitemap that cries wolf is
 * one Google stops reading lastmod from at all.
 */
const DATA_DERIVED_ROUTES = new Set(['characters', 'weapons', 'keys']);

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
  const lastmod = dataSyncedAt();

  const routes = Object.keys(ROUTE_META)
    .map((key) => ({
      path: pathForRoute(key),
      priority: ROUTE_PRIORITY[key],
      lastmod: DATA_DERIVED_ROUTES.has(key) ? lastmod : null,
    }))
    .filter(
      (r): r is { path: string; priority: number; lastmod: string | null } =>
        // A route with no priority is one of UNLISTED_ROUTES.
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
      lastmod,
    })),
    ...weapons.map((slug) => ({
      path: `/weapons/${slug}`,
      priority: WEAPON_PRIORITY,
      lastmod,
    })),
    ...dolls.map((slug) => ({
      path: `/builder/${slug}`,
      priority: BUILDER_PRIORITY,
      lastmod,
    })),
    // Facet pages rank above individual detail pages: each one answers a
    // category query ("gfl2 sentinel dolls") that no single doll page can, and
    // each is a hub linking dozens of them.
    ...allFacets().map((f) => ({
      path: f.path,
      priority: FACET_PRIORITY,
      lastmod,
    })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${SITE}${u.path}</loc>\n` +
        (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : '') +
        `    <priority>${u.priority.toFixed(1)}</priority>\n  </url>`
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

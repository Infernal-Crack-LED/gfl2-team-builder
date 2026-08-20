import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateSitemap } from './build-sitemap';
import { allDolls, allWeapons } from '../server/gameData';
import { ROUTE_META, SITE } from '../share/pageMeta';
import { resolvePage } from '../server/pageMeta';

const committed = readFileSync(
  path.resolve('web', 'public', 'sitemap.xml'),
  'utf8'
);

describe('sitemap', () => {
  it('has not drifted from the committed file (run `npm run sitemap`)', () => {
    expect(committed).toBe(generateSitemap());
  });

  it('lists every doll, weapon and builder page', () => {
    const xml = generateSitemap();
    for (const d of allDolls()) {
      expect(xml).toContain(`<loc>${SITE}/characters/${d.slug}</loc>`);
      expect(xml).toContain(`<loc>${SITE}/builder/${d.slug}</loc>`);
    }
    for (const w of allWeapons()) {
      expect(xml).toContain(`<loc>${SITE}/weapons/${w.slug}</loc>`);
    }
  });

  it('lists every route the server serves a 200 for, except the unlisted', () => {
    // /saved is per-visitor and noindex; /dev is an about-the-author page that
    // does not need crawl budget nominated for it.
    const unlisted = new Set(['saved', 'dev']);
    const xml = generateSitemap();
    for (const key of Object.keys(ROUTE_META)) {
      const path =
        key === 'home'
          ? '/'
          : key === 'infographics'
            ? '/tools/infographics'
            : `/${key}`;
      const listed = xml.includes(`<loc>${SITE}${path}</loc>`);
      expect(listed, key).toBe(!unlisted.has(key));
    }
  });

  it('lists nothing the server would 404 or redirect', () => {
    const locs = [...generateSitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1]
    );
    expect(locs.length).toBeGreaterThan(300);
    for (const loc of locs) {
      const url = new URL(loc);
      const page = resolvePage(url);
      expect(page.status, loc).toBe(200);
      expect(SITE + page.canonicalPath, loc).toBe(loc);
    }
  });
});

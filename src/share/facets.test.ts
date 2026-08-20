/**
 * Facet taxonomy — the pure rules.
 *
 * Kept free of node and server imports on purpose: `web/tsconfig.json` includes
 * `../src/share/**` so the web build typechecks shared modules, which means a
 * test here that reached for `src/server/*` would drag `node:fs` into the web
 * compile. The data-driven half of these guards (real memberships, real
 * resolution, real intros) lives in `src/server/pageMeta.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  FACET_GROUPS,
  MIN_FACET_MEMBERS,
  facetSlug,
  facetsFor,
} from './facets';

const CLASS_GROUP = FACET_GROUPS.find((g) => g.key === 'class')!;

describe('facet taxonomy rules', () => {
  it('covers class, phase and weapon type — and nothing else', () => {
    expect(FACET_GROUPS.map((g) => g.key).sort()).toEqual([
      'class',
      'phase',
      'type',
    ]);
  });

  it('builds one path segment per dimension, never a combination', () => {
    const rows = [
      { class: 'Big', phase: 'Burn' },
      { class: 'Big', phase: 'Burn' },
      { class: 'Big', phase: 'Burn' },
    ] as unknown as Record<string, unknown>[];
    for (const f of facetsFor(CLASS_GROUP, rows)) {
      // /characters/class/big — three segments. A fourth would mean a
      // cross-product page, which is what this taxonomy exists to not build.
      expect(f.path.replace(/^\//, '').split('/')).toHaveLength(3);
    }
  });

  it('drops a facet whose membership is below the floor', () => {
    const rows = [
      { class: 'Big' },
      { class: 'Big' },
      { class: 'Big' },
      { class: 'Small' },
    ] as unknown as Record<string, unknown>[];
    expect(facetsFor(CLASS_GROUP, rows).map((f) => f.slug)).toEqual(['big']);
  });

  it('counts members and orders by descending count', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      class: i < 6 ? 'Big' : 'Mid',
    })) as unknown as Record<string, unknown>[];
    const built = facetsFor(CLASS_GROUP, rows);
    expect(built.map((f) => [f.slug, f.count])).toEqual([
      ['big', 6],
      ['mid', 4],
    ]);
  });

  it('ignores rows with a missing or empty value', () => {
    const rows = [
      { class: 'Big' },
      { class: 'Big' },
      { class: 'Big' },
      { class: '' },
      {},
    ] as unknown as Record<string, unknown>[];
    const built = facetsFor(CLASS_GROUP, rows);
    expect(built).toHaveLength(1);
    expect(built[0]!.count).toBe(3);
  });

  it('needs at least three members to call something a category', () => {
    expect(MIN_FACET_MEMBERS).toBeGreaterThanOrEqual(3);
  });

  it('slugs to url-safe text', () => {
    expect(facetSlug('Assault Rifle')).toBe('assault-rifle');
    expect(facetSlug('Sentinel')).toBe('sentinel');
    expect(facetSlug('Sub-machine  Gun')).toBe('sub-machine-gun');
  });
});

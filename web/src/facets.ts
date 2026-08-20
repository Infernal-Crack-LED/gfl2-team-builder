/**
 * Client half of the facet taxonomy.
 *
 * The rules, the slugs, the intros and the minimum membership all come from
 * `src/share/facets.ts` — the same module the server resolves against — so the
 * page a visitor navigates to is the page a crawler was served. All this adds
 * is the lookup over the client's own copy of the rows.
 */
import { allDolls, allWeapons, type Doll, type Weapon } from './data';
import { FACET_GROUPS, facetsFor, type Facet } from '../../src/share/facets';

export type { Facet } from '../../src/share/facets';
export {
  facetHeading,
  introFor,
  facetTitle,
  facetDescription,
} from '../../src/share/facets';

/** Every facet, built once from the client's rows. */
const ALL: Facet[] = FACET_GROUPS.flatMap((group) =>
  facetsFor(
    group,
    (group.entity === 'doll' ? allDolls : allWeapons) as unknown as Record<
      string,
      unknown
    >[]
  )
);

const byPath = new Map(ALL.map((f) => [f.path, f]));

export function allFacets(): Facet[] {
  return ALL;
}

/**
 * The facet for a location pathname, or null when the path is not one. Matches
 * the server's normalization: lowercased, trailing slash dropped.
 */
export function facetFromPath(pathname: string): Facet | null {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return byPath.get(normalized) ?? null;
}

/** Facets of one group — the links a catalogue page lists. */
export function facetsInGroup(key: string): Facet[] {
  return ALL.filter((f) => f.group.key === key);
}

/** The rows a facet page lists, in name order. */
export function facetMembers(facet: Facet): (Doll | Weapon)[] {
  const rows: (Doll | Weapon)[] =
    facet.group.entity === 'doll' ? allDolls : allWeapons;
  return rows
    .filter(
      (r) =>
        (r as unknown as Record<string, unknown>)[facet.group.field] ===
        facet.value
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

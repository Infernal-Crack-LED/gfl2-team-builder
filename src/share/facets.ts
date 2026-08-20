/**
 * Facet landing pages — `/characters/class/<slug>`, `/characters/phase/<slug>`
 * and `/weapons/type/<slug>`.
 *
 * WHY they exist: "gfl2 sentinel dolls" and "gfl2 corrosion characters" are
 * real searches that no one answers completely — the guide sites name three or
 * four examples inside a tier list. The site already holds every row, so a page
 * per facet answers the query exhaustively and keeps answering it: a new doll
 * joins her facet on the next data sync, with no page to rewrite.
 *
 * WHY the taxonomy is a hand-listed table and not a cross-product: faceted
 * navigation is the standard way a site accidentally grows thousands of thin
 * near-duplicates. The rules that keep this from happening, all enforced by
 * facets.test.ts:
 *
 *   1. ONE dimension per page. There is no /class/sentinel/phase/burn, ever.
 *   2. A facet needs at least MIN_FACET_MEMBERS rows to get a page. That is
 *      what keeps Resonance (a single doll today) out — a "category" with one
 *      member is a duplicate of that member's own page.
 *   3. Every facet is generated FROM the data, so a value that disappears
 *      upstream takes its page with it rather than 404ing from a stale list.
 *   4. Every page is in the sitemap and linked from its parent catalogue, so
 *      none of them are orphans only a sitemap knows about.
 *
 * Intros are keyed by slug and hand-written. A facet with no intro still gets
 * a page (see `introFor`) — degrade, never vanish — but the generic wording is
 * a prompt to write a real one.
 */

/** Which catalogue a facet filters, and therefore which URL prefix it sits under. */
export type FacetEntity = 'doll' | 'weapon';

export interface FacetGroup {
  /** URL segment: `/characters/<key>/<slug>`. */
  key: string;
  entity: FacetEntity;
  /** The row field this group reads. */
  field: 'class' | 'phase' | 'weaponType';
  /** Plural noun for headings — "Sentinel dolls", "Assault Rifle weapons". */
  noun: string;
  base: string;
}

export const FACET_GROUPS: FacetGroup[] = [
  {
    key: 'class',
    entity: 'doll',
    field: 'class',
    noun: 'dolls',
    base: '/characters',
  },
  {
    key: 'phase',
    entity: 'doll',
    field: 'phase',
    noun: 'dolls',
    base: '/characters',
  },
  {
    key: 'type',
    entity: 'weapon',
    field: 'weaponType',
    noun: 'weapons',
    base: '/weapons',
  },
];

/**
 * Below this, a facet is not a category — it is one row wearing a category's
 * clothes, and its page would duplicate that row's own detail page.
 */
export const MIN_FACET_MEMBERS = 3;

export interface Facet {
  group: FacetGroup;
  /** URL slug, e.g. `sentinel`. */
  slug: string;
  /** The exact value as it appears in the data, e.g. `Sentinel`. */
  value: string;
  path: string;
  count: number;
}

/** Lowercase, non-alphanumerics collapsed to single hyphens. */
export function facetSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Build every facet that clears MIN_FACET_MEMBERS, from the rows given. Sorted
 * by descending count so the biggest categories lead the index links.
 */
export function facetsFor(
  group: FacetGroup,
  rows: readonly Record<string, unknown>[]
): Facet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[group.field];
    if (typeof value === 'string' && value !== '') {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_FACET_MEMBERS)
    .map(([value, count]) => ({
      group,
      slug: facetSlug(value),
      value,
      path: `${group.base}/${group.key}/${facetSlug(value)}`,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

// --- Copy -------------------------------------------------------------------

/**
 * Hand-written intros, keyed by `<group.key>/<slug>`.
 *
 * Deliberately DESCRIPTIVE, not evaluative: they say what the category is and
 * what the page lists, and leave "which is best" to the tier lists. That keeps
 * them true without anyone having to re-judge them each patch, and it is the
 * honest posture for a data site — the page's value is that the list is
 * complete, not that it has an opinion.
 */
const INTROS: Record<string, string> = {
  'class/sentinel':
    'Sentinels are the front-line damage dealers of Girls’ Frontline 2: Exilium. Every Sentinel-class doll is listed here with her phase, weapon type and rarity.',
  'class/support':
    'Support dolls buff allies, apply debuffs and control the field rather than carrying damage themselves. Every Support-class doll in the game is listed here.',
  'class/vanguard':
    'Vanguards open engagements and pressure the enemy line. Every Vanguard-class doll is listed here with her phase, weapon type and rarity.',
  'class/bulwark':
    'Bulwarks are the durable front-liners, built to hold position and absorb damage. Every Bulwark-class doll in the game is listed here.',
  'phase/physical':
    'Physical is the non-elemental damage phase. Every doll who deals Physical damage is listed here, with her class, weapon type and rarity.',
  'phase/corrosion':
    'Corrosion dolls deal damage over time and punish stacked debuffs. Every Corrosion-phase doll is listed here, with her class and weapon type.',
  'phase/burn':
    'Burn dolls apply direct elemental damage and burning effects. Every Burn-phase doll is listed here, with her class and weapon type.',
  'phase/hydro':
    'Hydro dolls deal water-phase damage. Every Hydro-phase doll is listed here, with her class, weapon type and rarity.',
  'phase/freeze':
    'Freeze dolls slow and lock down enemies alongside their damage. Every Freeze-phase doll is listed here, with her class and weapon type.',
  'phase/electric':
    'Electric dolls deal lightning-phase damage. Every Electric-phase doll is listed here, with her class, weapon type and rarity.',
  'type/assault-rifle':
    'Assault Rifles are the most common weapon class in Girls’ Frontline 2: Exilium. Every one is listed here with its rarity, primary attribute and imprint doll.',
  'type/submachine-gun':
    'Submachine Guns trade range for close-quarters output. Every SMG in the game is listed here with its rarity, primary attribute and imprint doll.',
  'type/sniper-rifle':
    'Sniper Rifles deliver high single-target damage at range. Every Sniper Rifle is listed here with its rarity, primary attribute and imprint doll.',
  'type/handgun':
    'Handguns are the sidearm class, carried by dolls built around utility and mobility. Every Handgun is listed here with its rarity and imprint doll.',
  'type/shotgun':
    'Shotguns hit hardest up close and at wide angles. Every Shotgun in the game is listed here with its rarity, primary attribute and imprint doll.',
  'type/blade':
    'Blades are the melee weapon class. Every Blade is listed here with its rarity, primary attribute and the doll who imprints it.',
  'type/machine-gun':
    'Machine Guns sustain fire across multiple targets. Every Machine Gun is listed here with its rarity, primary attribute and imprint doll.',
};

/** Page heading — "Sentinel dolls", "Assault Rifle weapons". */
export function facetHeading(facet: Facet): string {
  return `${facet.value} ${facet.group.noun}`;
}

/**
 * The intro paragraph. An unlisted facet (a class or phase added upstream)
 * still renders a usable page rather than an empty one.
 */
export function introFor(facet: Facet): string {
  return (
    INTROS[`${facet.group.key}/${facet.slug}`] ??
    `Every ${facet.value} ${facet.group.noun.replace(/s$/, '')} in Girls’ Frontline 2: Exilium, listed with its key attributes.`
  );
}

export function facetTitle(facet: Facet): string {
  const what = facet.group.entity === 'doll' ? 'Dolls' : 'Weapons';
  return `${facet.value} ${what} — GFL2 ${facet.value} ${facet.group.noun === 'dolls' ? 'Character' : 'Weapon'} List`;
}

export function facetDescription(facet: Facet): string {
  return `All ${facet.count} ${facet.value} ${facet.group.noun} in Girls’ Frontline 2: Exilium. ${introFor(facet)}`.slice(
    0,
    300
  );
}

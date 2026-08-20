/**
 * The landing page's own words — the hero line and the feature grid.
 *
 * Shared, not web-local, for the same reason pageMeta.ts is: the home page is a
 * crawl surface, and `noJsBody.ts` has to render the same copy the React page
 * shows. Keeping one array here means a reworded blurb changes both at once and
 * the crawler can never index a sentence the visitor doesn't see.
 */

/** The six route keys the feature grid links to (a subset of web's `Route`). */
export type HomeFeatureRoute =
  'team-builder' | 'builder' | 'characters' | 'weapons' | 'keys' | 'tools';

export interface HomeFeature {
  route: HomeFeatureRoute;
  /** Canonical path — what the no-JS body puts in `href`. */
  href: string;
  title: string;
  blurb: string;
  cta: string;
}

/**
 * The hero paragraph, split around the game's name so the React page can bold
 * it and the no-JS body can emit the same sentence as plain text — one source,
 * two renderings, no chance of the copy drifting apart.
 */
export const GAME_NAME = "Girls' Frontline 2: Exilium";
export const HOME_HERO_BEFORE = 'Plan, build, and share ';
export const HOME_HERO_AFTER =
  ' squads. Browse every doll and weapon, assemble teams, craft build cards, ' +
  'and compare key effects — all in one place.';

/** The whole hero line as flat text. */
export const HOME_HERO = HOME_HERO_BEFORE + GAME_NAME + HOME_HERO_AFTER;

export const HOME_SECTION_TITLE = 'Everything you need to plan a squad';

export const HOME_FEATURES: HomeFeature[] = [
  {
    route: 'team-builder',
    href: '/team-builder',
    title: 'Team Builder',
    blurb:
      'Assemble up to five dolls and see team effects, elemental synergies, and damage-type coverage at a glance.',
    cta: 'Build a team',
  },
  {
    route: 'builder',
    href: '/builder',
    title: 'Character Builder',
    blurb:
      'Pick a doll, set their weapon, refinement, keys, vertebra, and stats, then share the build as a card or short link.',
    cta: 'Build a character',
  },
  {
    route: 'characters',
    href: '/characters',
    title: 'Character Catalog',
    blurb:
      'Browse every doll with full kits, key recommendations, weapons, attachment sets, and community build cards.',
    cta: 'Browse characters',
  },
  {
    route: 'weapons',
    href: '/weapons',
    title: 'Weapon Catalog',
    blurb:
      'Compare all weapons, their stats, effects, imprints, and which dolls want them most.',
    cta: 'Browse weapons',
  },
  {
    route: 'keys',
    href: '/keys',
    title: 'Key Catalogue',
    blurb:
      'Read every key in the game, filter by effect tags, and find the best fits for your squad.',
    cta: 'Browse keys',
  },
  {
    route: 'tools',
    href: '/tools',
    title: 'Card Tools',
    blurb:
      'Download or host shareable infographics for builds, squads, weapons, recommendations, and pull odds.',
    cta: 'Open tools',
  },
];

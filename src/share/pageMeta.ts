/**
 * Per-URL page metadata — ONE table, both sides.
 *
 * Crawlers (Google, Discord, Twitter, Slack, ChatGPT…) do not run JS, so the
 * title/description/canonical a link unfurls with has to be baked into the HTML
 * the server returns (src/server/pageMeta.ts). The SPA then re-syncs the same
 * head on client navigation (web/src/useDocumentHead.ts). Both read THIS
 * module, so the two can never describe the same URL differently — the
 * playbook's "route meta lives in all tables at once" rule, enforced by
 * construction instead of by a parity test.
 *
 * Lives in `share/` for the same reason `assets.ts` does: it is imported by the
 * web bundle AND the server, so it must stay free of node and DOM APIs.
 */

/** Canonical host. Every canonical/og:url is absolute against this. */
export const SITE = 'https://refittingroom.app';

export interface PageMeta {
  title: string;
  description: string;
  /** Short breadcrumb label (BreadcrumbList + crumb nav). */
  label: string;
}

/**
 * Route key → meta. Keys are the first path segment (`''` → home), except
 * `infographics`, which is reached at `/tools/infographics`.
 *
 * Adding a page means: a route in web/src/router.ts, an entry here, and a line
 * in src/bin/build-sitemap.ts (its drift test fails until the sitemap is
 * regenerated).
 */
export const ROUTE_META = {
  home: {
    title: "Refitting Room — Girls' Frontline 2: Exilium Squad Planner",
    description:
      "Build and plan your Girls' Frontline 2: Exilium squad. Browse dolls and weapons, filter by class, phase, and weapon type, and assemble your team.",
    label: 'Home',
  },
  characters: {
    title: "GFL2 Characters — Every Doll's Kit, Skills & Stats",
    description:
      "Browse every doll in Girls' Frontline 2: Exilium. Filter by class, phase, weapon type, ammo, and rarity, then open a doll for her full kit and stats.",
    label: 'Characters',
  },
  weapons: {
    title: 'GFL2 Weapons — Traits, Effects & Imprint Stats',
    description:
      "Browse every weapon in Girls' Frontline 2: Exilium. Filter by rarity, weapon type, and primary attribute, then view traits and effects.",
    label: 'Weapons',
  },
  'team-builder': {
    title: 'Refitting Room — Visual Squad Planner',
    description:
      'Build your GFL2 squad visually. Filter the full doll roster, place dolls in 4 or 5 slots, and plan your team composition.',
    label: 'Team Builder',
  },
  // Slug-less /builder is the doll picker; /builder/<slug> gets its own meta
  // from builderPageMeta().
  builder: {
    title: 'GFL2 Doll Builder — Weapons, Keys & Vertebrae Planner',
    description:
      "Plan a doll build in Girls' Frontline 2: Exilium. Pick a weapon, unlock affinity and common keys, choose vertebra segments, then save or share the build.",
    label: 'Doll Builder',
  },
  keys: {
    title: 'GFL2 Keys — Fixed, Expansion & Common Key Database',
    description:
      "Every fixed, expansion, and common key in Girls' Frontline 2: Exilium, with stats and effects. Filter by key type, stat bonus, and the class or phase of the doll they belong to.",
    label: 'Keys',
  },
  tools: {
    title: 'GFL2 Tools — Builders, Key Database & Infographics Creator',
    description:
      "Every Girls' Frontline 2: Exilium tool on the site: the team builder, the character builder, the key catalogue, and the infographics creator.",
    label: 'Tools',
  },
  infographics: {
    title:
      'GFL2 Infographics Creator — Build, Squad, Recommendation & Pull Cards',
    description:
      "Make shareable Girls' Frontline 2: Exilium infographics: compose a doll build card, a squad card, an investment recommendation card or a pull-odds card, preview it live, then download the PNG or copy a hosted image link.",
    label: 'Infographics',
  },
  saved: {
    title: 'Saved builds — Refitting Room',
    description:
      'Your saved GFL2 character builds and squads, tied to your Discord account.',
    label: 'Saved',
  },
  credits: {
    title: 'Credits — Refitting Room',
    description: 'The data sources and tools behind the Refitting Room.',
    label: 'Credits',
  },
  dev: {
    title: 'Meet the dev — Refitting Room',
    description:
      'Who builds the Refitting Room and the Helen Discord bot, and where to find the rest of the projects.',
    label: 'Dev',
  },
  privacy: {
    title: 'Privacy Policy — Refitting Room',
    description:
      'What data Helen and the Refitting Room website collect, how it is used, and your choices.',
    label: 'Privacy',
  },
  terms: {
    title: 'Terms of Service — Refitting Room',
    description:
      'The terms governing use of the Helen Discord bot and the Refitting Room website.',
    label: 'Terms',
  },
  usage: {
    title: 'Usage & Permissions — Refitting Room',
    description:
      "What you may reuse from the Refitting Room and on what terms, which material belongs to Sunborn and is shown under fair use, and whom to ask for the community sources this site doesn't own.",
    label: 'Usage',
  },
} satisfies Record<string, PageMeta>;

export type RouteKey = keyof typeof ROUTE_META;

/** Meta for a route key, or undefined when the key is not a route. */
export function routeMetaFor(key: string): PageMeta | undefined {
  return Object.hasOwn(ROUTE_META, key)
    ? ROUTE_META[key as RouteKey]
    : undefined;
}

/** Served with the 404 status on unknown paths (soft 404s are an SEO bug). */
export const NOT_FOUND_META: PageMeta = {
  title: 'Page not found — Refitting Room',
  description:
    "The requested page could not be found. Browse the Refitting Room for GFL2 dolls, weapons, keys, and the squad planner for Girls' Frontline 2: Exilium.",
  label: 'Not Found',
};

// --- Detail pages -----------------------------------------------------------
// The builders below are the ONLY place a detail title/description is worded.
// DollPage/WeaponPage/DollBuilderPage call them for the client head; the server
// calls them for the crawler head, off the same data/*.json rows.

/** `/characters/<slug>` — a doll's profile. */
export function dollPageMeta(doll: {
  name: string;
  class?: string | null;
  phase?: string | null;
}): PageMeta {
  return {
    title: `${doll.name} — GFL2 Doll Kit & Stats`,
    description: `${doll.name}: ${doll.class ?? 'Unknown class'} ${doll.phase ?? ''} doll in Girls' Frontline 2: Exilium. View skills, keys, and stats.`,
    label: doll.name,
  };
}

/** `/weapons/<slug>` — a weapon's profile. */
export function weaponPageMeta(weapon: {
  name: string;
  weaponType?: string | null;
  rarity?: string | null;
}): PageMeta {
  return {
    title: `${weapon.name} — GFL2 Weapon Stats & Trait`,
    description: `${weapon.name}: ${weapon.weaponType ?? 'Unknown'} ${weapon.rarity ?? ''} weapon in Girls' Frontline 2: Exilium. View trait, effect, and stats.`,
    label: weapon.name,
  };
}

/** `/builder/<slug>` — that doll's build planner. */
export function builderPageMeta(doll: { name: string }): PageMeta {
  return {
    title: `${doll.name} Builder — GFL2 Weapon, Keys & Vertebrae Planner`,
    description: `Plan ${doll.name}'s build in Girls' Frontline 2: Exilium: pick a weapon, unlock keys, choose vertebra segments, and share the build with a link.`,
    label: `${doll.name} Builder`,
  };
}

// --- Canonical paths --------------------------------------------------------

/**
 * Canonical form of a path: lowercase (callers lowercase), no duplicate
 * slashes, no trailing slash except the root. Idempotent — the server 301s to
 * this form, so a non-converging normalizer would be a redirect loop.
 */
export function normalizeCanonicalPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }
  return pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
}

/** Absolute canonical URL for a path (query strings are never canonical). */
export function canonicalUrl(pathname: string): string {
  return SITE + normalizeCanonicalPath(pathname);
}

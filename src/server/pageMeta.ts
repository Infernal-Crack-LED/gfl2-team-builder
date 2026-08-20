/**
 * Per-URL embed metadata — the server half of the system, ported from
 * nikke-sim's `src/server/static.ts` TAB_META/UNIT_META layer.
 *
 * WHY it exists: crawlers do not run JS. Without this, every one of the ~320
 * crawlable URLs on the site returns index.html's home-page title, description
 * and canonical — 64 doll pages and 185 weapon pages all claiming to be the
 * landing page, which is both an unfurl bug (every Discord link previews as
 * "Refitting Room — squad planner") and a duplicate-title SEO bug.
 *
 * WHAT it does, per request, for the SPA-fallback HTML:
 *   1. resolvePage() maps the URL to a route key or a doll/weapon/builder
 *      entity, its meta (from src/share/pageMeta.ts — the SAME table the client
 *      head sync reads) and a 200/404 status. Unknown paths are hard 404s, not
 *      soft-200 shells.
 *   2. injectPageMeta() rewrites the title, description, canonical and the
 *      OG/Twitter tag pairs, plus a per-entity og:image (the portrait/art the
 *      site already self-hosts) when one exists — nikke-sim resolves its per-tab
 *      image through a build-time manifest; here the mirrored game art IS the
 *      manifest, and a missing file degrades to the generic /og.png.
 *   3. injectBreadcrumbLd() adds the BreadcrumbList the client never emits.
 *
 * No user-agent sniffing anywhere: everyone gets the same enriched HTML.
 *
 * Share-card URLs (?b=/?id=) layer ogInject.ts ON TOP of this, so the card
 * image wins over the page image while the canonical still points at the clean
 * URL.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  NOT_FOUND_META,
  ROUTE_META,
  SITE,
  builderPageMeta,
  canonicalUrl,
  dollPageMeta,
  normalizeCanonicalPath,
  routeMetaFor,
  weaponPageMeta,
  type PageMeta,
  type RouteKey,
} from '../share/pageMeta.js';
import { localAssetUrl } from '../share/assets.js';
import {
  appendJsonLd,
  removeMetaTag,
  setLinkHref,
  setMetaTag,
  setTitle,
} from './htmlHead.js';
import {
  getDoll,
  getFacet,
  getWeaponBySlug,
  type DollEntry,
  type WeaponEntry,
} from './gameData.js';
import {
  facetDescription,
  facetHeading,
  facetTitle,
  type Facet,
} from '../share/facets.js';

/** What kind of page a URL resolved to — picks the no-JS body and crumbs. */
export type PageKind =
  'route' | 'doll' | 'weapon' | 'builder' | 'facet' | 'not-found';

export interface ResolvedPage {
  kind: PageKind;
  /** Route key for `kind === 'route'`, the entity slug otherwise. */
  key: string;
  meta: PageMeta;
  canonicalPath: string;
  status: 200 | 404;
  doll?: DollEntry;
  weapon?: WeaponEntry;
  facet?: Facet;
}

/**
 * Paths that used to be (or look like they should be) canonical, 301'd so link
 * equity lands on the real URL instead of only being hinted at via
 * <link rel="canonical">. `/teambuilder` is a live alias the client router
 * still accepts, so the redirect is what keeps one page from having two URLs.
 */
const LEGACY_REDIRECT: Record<string, string> = {
  '/teambuilder': '/team-builder',
  '/index.html': '/',
};

/**
 * The 301 target for a request path, or null to serve it as-is. Covers the
 * alias table plus non-canonical spellings (trailing slash, doubled slashes,
 * uppercase) — normalizeCanonicalPath is idempotent, so this cannot loop.
 */
export function redirectTargetFor(pathname: string): string | null {
  const normalized = normalizeCanonicalPath(pathname.toLowerCase());
  const alias = LEGACY_REDIRECT[normalized];
  if (alias !== undefined) {
    return alias;
  }
  // Static assets keep their path byte-for-byte: `/assets/Foo-A1b2C3d4.js` is
  // case-sensitive on disk, so lowercasing it would 301 straight into a 404.
  // Only page URLs get the canonical-spelling treatment.
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return null;
  }
  return normalized === pathname ? null : normalized;
}

/** Map a URL to its page, its meta, and the status the HTML should carry. */
export function resolvePage(url: URL): ResolvedPage {
  const canonicalPath = normalizeCanonicalPath(
    decodePathname(url.pathname).toLowerCase()
  );
  const segs = canonicalPath
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

  const notFound = (): ResolvedPage => ({
    kind: 'not-found',
    key: 'not-found',
    // 404s canonicalize to the root: an unknown URL must not nominate itself
    // as the canonical version of anything.
    meta: NOT_FOUND_META,
    canonicalPath: '/',
    status: 404,
  });

  if (segs.length === 0) {
    return {
      kind: 'route',
      key: 'home',
      meta: ROUTE_META.home,
      canonicalPath: '/',
      status: 200,
    };
  }

  const first = segs[0] ?? '';
  const second = segs[1];

  // Facets are three-segment paths under a catalogue (/characters/class/
  // sentinel), so they must be checked BEFORE the detail branches below, which
  // treat any third segment as a 404. An unknown facet value — or one whose
  // membership fell under MIN_FACET_MEMBERS — is a real 404, not a soft page.
  if (segs.length === 3 && (first === 'characters' || first === 'weapons')) {
    const facet = getFacet(canonicalPath);
    return facet
      ? {
          kind: 'facet',
          key: `${facet.group.key}/${facet.slug}`,
          meta: facetPageMeta(facet),
          canonicalPath,
          status: 200,
          facet,
        }
      : notFound();
  }

  if (first === 'characters' && second !== undefined) {
    if (segs.length > 2) {
      return notFound();
    }
    const doll = getDoll(second);
    return doll
      ? {
          kind: 'doll',
          key: doll.slug,
          meta: dollPageMeta(doll),
          canonicalPath,
          status: 200,
          doll,
        }
      : notFound();
  }

  if (first === 'weapons' && second !== undefined) {
    if (segs.length > 2) {
      return notFound();
    }
    const weapon = getWeaponBySlug(second);
    return weapon
      ? {
          kind: 'weapon',
          key: weapon.slug,
          meta: weaponPageMeta(weapon),
          canonicalPath,
          status: 200,
          weapon,
        }
      : notFound();
  }

  if (first === 'builder' && second !== undefined) {
    if (segs.length > 2) {
      return notFound();
    }
    const doll = getDoll(second);
    return doll
      ? {
          kind: 'builder',
          key: doll.slug,
          meta: builderPageMeta(doll),
          canonicalPath,
          status: 200,
          doll,
        }
      : notFound();
  }

  // /tools/infographics is the one nested route with its own meta; any other
  // /tools child is a 404 rather than a silent fall-back to the tool index.
  if (first === 'tools' && second !== undefined) {
    return second === 'infographics' && segs.length === 2
      ? {
          kind: 'route',
          key: 'infographics',
          meta: ROUTE_META.infographics,
          canonicalPath,
          status: 200,
        }
      : notFound();
  }

  const routeMeta = segs.length === 1 ? routeMetaFor(first) : undefined;
  if (routeMeta) {
    return {
      kind: 'route',
      key: first,
      meta: routeMeta,
      canonicalPath,
      status: 200,
    };
  }

  return notFound();
}

/** Title/description/label for a facet page, from the shared taxonomy. */
function facetPageMeta(facet: Facet): PageMeta {
  return {
    title: facetTitle(facet),
    description: facetDescription(facet),
    label: facetHeading(facet),
  };
}

/** `%20`-style escapes decoded, malformed sequences left alone (never throws). */
function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

// --- Per-URL embed image ----------------------------------------------------

export interface PageImage {
  /** Absolute URL on this origin. */
  url: string;
  alt: string;
  /**
   * True when the image is the site's 1200×630 card, i.e. the og:image:width /
   * og:image:height already in index.html still describe it.
   */
  wide: boolean;
}

// Mirrored art lives under web/public and is copied into dist by vite; check
// both so this works from a build (dist) and from `npm run dev:server` (source).
const ASSET_ROOTS = [path.resolve('dist'), path.resolve('web', 'public')];
const assetExists = new Map<string, boolean>();

/** Is this /-rooted public path actually a file we ship? Memoized per boot. */
function publicAssetExists(urlPath: string): boolean {
  const cached = assetExists.get(urlPath);
  if (cached !== undefined) {
    return cached;
  }
  const rel = urlPath.replace(/^\/+/, '');
  const found = ASSET_ROOTS.some((root) => {
    const file = path.join(root, rel);
    return file.startsWith(root + path.sep) && existsSync(file);
  });
  assetExists.set(urlPath, found);
  return found;
}

/**
 * The embed image for a page: the doll's portrait or the weapon's art (both
 * already mirrored into /game-assets — never hotlinked from the CDN), else
 * undefined so index.html's generic /og.png survives untouched.
 *
 * These are portrait/square tiles, not 1200×630 cards, so callers switch the
 * card type to `summary` and drop the wide dimensions.
 */
export function pageImageFor(page: ResolvedPage): PageImage | undefined {
  const remote =
    page.kind === 'doll' || page.kind === 'builder'
      ? page.doll?.avatarUrl
      : page.kind === 'weapon'
        ? page.weapon?.imageUrl
        : null;
  if (!remote) {
    return undefined;
  }
  const local = localAssetUrl(remote);
  if (!local.startsWith('/') || !publicAssetExists(local)) {
    return undefined;
  }
  const name = page.doll?.name ?? page.weapon?.name ?? '';
  return {
    url: SITE + local,
    alt: page.kind === 'weapon' ? `${name} weapon art` : `${name} portrait`,
    wide: false,
  };
}

// --- Breadcrumbs ------------------------------------------------------------

interface Crumb {
  name: string;
  item: string;
}

/**
 * The crumb trail for a page, or null for the root and for 404s. Mirrors the
 * on-page `.unit-crumbs` nav: a doll page sits under Characters, a builder page
 * under Tools › Doll Builder.
 */
export function breadcrumbFor(page: ResolvedPage): Crumb[] | null {
  if (page.status === 404 || page.canonicalPath === '/') {
    return null;
  }
  const home: Crumb = { name: 'Home', item: canonicalUrl('/') };
  const leaf: Crumb = {
    name: page.meta.label,
    item: SITE + page.canonicalPath,
  };
  const crumb = (key: RouteKey): Crumb => ({
    name: ROUTE_META[key].label,
    item: canonicalUrl(hrefForRouteKey(key)),
  });

  const trail = (() => {
    switch (page.kind) {
      case 'doll':
        return [home, crumb('characters'), leaf];
      case 'weapon':
        return [home, crumb('weapons'), leaf];
      case 'builder':
        return [home, crumb('tools'), crumb('builder'), leaf];
      case 'facet':
        // A facet sits directly under its catalogue: Home › Characters ›
        // Sentinel dolls. The group ("class") gets no crumb of its own —
        // /characters/class is not a page.
        return [
          home,
          crumb(
            page.facet?.group.entity === 'weapon' ? 'weapons' : 'characters'
          ),
          leaf,
        ];
      default:
        break;
    }
    if (page.key === 'infographics') {
      return [home, crumb('tools'), leaf];
    }
    if (
      page.key === 'team-builder' ||
      page.key === 'builder' ||
      page.key === 'keys' ||
      page.key === 'saved'
    ) {
      return [home, crumb('tools'), leaf];
    }
    return [home, leaf];
  })();

  // Drop any ancestor whose URL is the leaf's own URL (e.g. /tools itself),
  // then dedupe by URL so no two positions point at the same page.
  const leafUrl = leaf.item;
  return trail
    .filter((c, i, a) => i === a.length - 1 || c.item !== leafUrl)
    .filter((c, i, a) => a.findIndex((x) => x.item === c.item) === i);
}

/** Route key → path. Mirror of web/src/router.ts hrefFor. */
function hrefForRouteKey(key: RouteKey): string {
  if (key === 'home') {
    return '/';
  }
  if (key === 'infographics') {
    return '/tools/infographics';
  }
  return `/${key}`;
}

// --- Injection --------------------------------------------------------------

/**
 * Routes that must never be indexed: /saved renders one visitor's own saved
 * builds behind a Discord session, so there is nothing there for a crawler.
 */
const NOINDEX_KEYS = new Set(['saved']);

/**
 * Rewrite index.html's head for this URL: title, description, canonical, the
 * OG/Twitter pair, and the per-entity embed image when one exists.
 */
export function injectPageMeta(html: string, page: ResolvedPage): string {
  const { title, description } = page.meta;
  const canonical = SITE + page.canonicalPath;

  let out = setTitle(html, title);
  out = setMetaTag(out, 'name', 'description', description);
  out = setLinkHref(out, 'canonical', canonical);
  out = setMetaTag(out, 'property', 'og:title', title);
  out = setMetaTag(out, 'property', 'og:description', description);
  out = setMetaTag(out, 'property', 'og:url', canonical);
  out = setMetaTag(out, 'name', 'twitter:title', title);
  out = setMetaTag(out, 'name', 'twitter:description', description);

  if (page.status === 404 || NOINDEX_KEYS.has(page.key)) {
    out = setMetaTag(out, 'name', 'robots', 'noindex, follow');
  }

  const image = pageImageFor(page);
  if (image) {
    out = setMetaTag(out, 'property', 'og:image', image.url);
    out = setMetaTag(out, 'property', 'og:image:alt', image.alt);
    out = setMetaTag(out, 'name', 'twitter:image', image.url);
    if (!image.wide) {
      // The baked 1200×630 dimensions describe /og.png, not a portrait tile —
      // a wrong width/height makes Discord reserve the wrong box, and
      // summary_large_image would upscale a 256px tile into a banner.
      out = removeMetaTag(out, 'property', 'og:image:width');
      out = removeMetaTag(out, 'property', 'og:image:height');
      out = setMetaTag(out, 'name', 'twitter:card', 'summary');
    }
  }
  return out;
}

/**
 * Add the BreadcrumbList JSON-LD (the client never emits one, so this is the
 * only source). Idempotent — a second pass is a no-op.
 */
export function injectBreadcrumbLd(html: string, page: ResolvedPage): string {
  if (html.includes('"@type":"BreadcrumbList"')) {
    return html;
  }
  const crumbs = breadcrumbFor(page);
  if (!crumbs) {
    return html;
  }
  return appendJsonLd(html, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  });
}

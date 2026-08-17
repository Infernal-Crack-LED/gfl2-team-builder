/**
 * Per-route client-side <head> sync. Updates <title>, meta description, OG
 * tags, and <link rel="canonical"> on every SPA navigation. Detail pages
 * (DollPage, WeaponPage) set their own head so the full dataset doesn't land
 * in the eager entry chunk.
 */
import { useEffect } from 'react';

// TODO: replace with the real domain when known (phase 2 — canonical host)
const SITE = 'https://refittingroom.app';

interface HeadMeta {
  title: string;
  description: string;
}

// Per-route SEO metadata. Titles are keyword-rich and unique per page.
export const META: Record<string, HeadMeta> = {
  home: {
    title: "Refitting Room — Girls' Frontline 2: Exilium Squad Planner",
    description:
      "Build and plan your Girls' Frontline 2: Exilium squad. Browse dolls and weapons, filter by class, phase, and weapon type, and assemble your team.",
  },
  characters: {
    title: "GFL2 Characters — Every Doll's Kit, Skills & Stats",
    description:
      "Browse every doll in Girls' Frontline 2: Exilium. Filter by class, phase, weapon type, ammo, and rarity, then open a doll for her full kit and stats.",
  },
  weapons: {
    title: 'GFL2 Weapons — Traits, Effects & Imprint Stats',
    description:
      "Browse every weapon in Girls' Frontline 2: Exilium. Filter by rarity, weapon type, and primary attribute, then view traits and effects.",
  },
  'team-builder': {
    title: 'Refitting Room — Visual Squad Planner',
    description:
      'Build your GFL2 squad visually. Filter the full doll roster, place dolls in 4 or 5 slots, and plan your team composition.',
  },
  // Fallback for /builder URLs — detail URLs set their own per-doll head via
  // setDetailMeta (skipped in the sync below), this covers the slug-less edge.
  builder: {
    title: 'GFL2 Doll Builder — Weapons, Keys & Vertebrae Planner',
    description:
      "Plan a doll build in Girls' Frontline 2: Exilium. Pick a weapon, unlock affinity and common keys, choose vertebra segments, then save or share the build.",
  },
  keys: {
    title: 'GFL2 Keys — Fixed, Expansion & Common Key Database',
    description:
      "Every fixed, expansion, and common key in Girls' Frontline 2: Exilium, with stats and effects. Filter by key type, stat bonus, and the class or phase of the doll they belong to.",
  },
  tools: {
    title: 'GFL2 Tools — Builders, Key Database & Infographics Creator',
    description:
      "Every Girls' Frontline 2: Exilium tool on the site: the team builder, the character builder, the key catalogue, and the infographics creator.",
  },
  saved: {
    title: 'Saved builds — Refitting Room',
    description:
      'Your saved GFL2 character builds and squads, tied to your Discord account.',
  },
  credits: {
    title: 'Credits — Refitting Room',
    description: 'The data sources and tools behind the Refitting Room.',
  },
  dev: {
    title: 'Meet the dev — Refitting Room',
    description:
      'Who builds the Refitting Room and the Helen Discord bot, and where to find the rest of the projects.',
  },
  privacy: {
    title: 'Privacy Policy — Refitting Room',
    description:
      'What data Helen and the Refitting Room website collect, how it is used, and your choices.',
  },
  terms: {
    title: 'Terms of Service — Refitting Room',
    description:
      'The terms governing use of the Helen Discord bot and the Refitting Room website.',
  },
};

const DEFAULT_META = META.home;

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setOg(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Canonical paths: lowercase, no trailing slash except root.
function normalizeCanonicalPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }
  return pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
}

function tabKey(): string {
  const seg = normalizeCanonicalPath(window.location.pathname.toLowerCase())
    .replace(/^\/+|\/+$/g, '')
    .split('/')[0];
  if (seg && Object.hasOwn(META, seg)) {
    return seg;
  }
  return 'home';
}

// Sync <title>, <meta description>, OG tags, and <link rel="canonical"> to
// the current route. Detail pages (/characters/<slug>, /weapons/<slug>)
// handle their own head so the full dataset stays out of the eager chunk.
export function useDocumentHead() {
  useEffect(() => {
    function sync() {
      const pathname = normalizeCanonicalPath(
        window.location.pathname.toLowerCase()
      );

      // Detail pages (and /tools sub-pages, e.g. the infographics creator)
      // set their own head — skip here.
      const segs = pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (
        (segs[0] === 'characters' ||
          segs[0] === 'weapons' ||
          segs[0] === 'builder' ||
          segs[0] === 'tools') &&
        segs[1]
      ) {
        return;
      }

      const key = tabKey();
      const m = META[key] ?? DEFAULT_META;
      const canonicalPath = normalizeCanonicalPath(pathname);
      const canonical = SITE + canonicalPath;

      document.title = m.title;
      setMeta('description', m.description);
      setOg('og:title', m.title);
      setOg('og:description', m.description);
      setOg('og:url', canonical);
      setMeta('twitter:title', m.title);
      setMeta('twitter:description', m.description);
      setCanonical(canonical);
    }

    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
}

// --- Helpers for detail pages to set their own head ---

export function setDetailMeta(title: string, description: string) {
  document.title = title;
  setMeta('description', description);
  setOg('og:title', title);
  setOg('og:description', description);
  setOg('og:url', SITE + normalizeCanonicalPath(window.location.pathname));
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  setCanonical(SITE + normalizeCanonicalPath(window.location.pathname));
}

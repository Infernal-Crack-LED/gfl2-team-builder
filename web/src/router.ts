/**
 * Tiny path router — no dependency. Every view is addressed by URL PATH (not a
 * hash), so each is independently crawlable. The static server (phase 2) will
 * SPA-fallback every unknown path to index.html.
 *
 * Ported from nikke-sim's router.ts with the GFL2 route set.
 */
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

export type Route =
  | 'home'
  | 'characters'
  | 'character'
  | 'weapons'
  | 'weapon'
  | 'team-builder'
  | 'builder'
  | 'credits';

// Flat list of nav/analytics routes. Parameterized routes (/characters/<slug>,
// /weapons/<slug>, /builder/<slug>) are excluded — hrefFor('character') would
// produce a dead slug-less path. Detail routes are detected by a present
// second segment.
export const ROUTES: Route[] = [
  'home',
  'characters',
  'weapons',
  'team-builder',
  'credits',
];

// Map the first path segment to a Route. Unknown segments → home.
export function routeFromPath(pathname: string): Route {
  const seg = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')[0]
    ?.toLowerCase();

  if (!seg) {
    return 'home';
  }
  if (seg === 'characters') {
    // If a second segment exists, this is a detail page
    const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
    return parts.length > 1 ? 'character' : 'characters';
  }
  if (seg === 'weapons') {
    const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
    return parts.length > 1 ? 'weapon' : 'weapons';
  }
  if (seg === 'team-builder' || seg === 'teambuilder') {
    return 'team-builder';
  }
  if (seg === 'builder') {
    // A builder without a doll slug is meaningless — /builder alone lands on
    // the character roster instead of a dead page.
    const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
    return parts.length > 1 ? 'builder' : 'characters';
  }
  if (seg === 'credits') {
    return 'credits';
  }
  return 'home';
}

export function slugFromPath(pathname: string): string | null {
  const segs = pathname
    .toLowerCase()
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/');
  if (
    segs[0] !== 'characters' &&
    segs[0] !== 'weapons' &&
    segs[0] !== 'builder'
  ) {
    return null;
  }
  return segs[1] ?? null;
}

// href for a route — a real path so links are hyperlinkable and crawlable
export const hrefFor = (route: Route): string => {
  if (route === 'home') {
    return '/';
  }
  if (route === 'team-builder') {
    return '/team-builder';
  }
  return `/${route}`;
};

/** Build a detail-page href from a slug. */
export const hrefForDoll = (slug: string): string => `/characters/${slug}`;
export const hrefForWeapon = (slug: string): string => `/weapons/${slug}`;
export const hrefForBuilder = (slug: string): string => `/builder/${slug}`;

// SPA navigation: update the URL via pushState (no full reload), then notify
// every listener with a popstate event.
export function navigate(url: string): void {
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Single subscription to the browser location pathname.
export function useLocationPathname(): string {
  const [pathname, setPathname] = useState<string>(
    () => window.location.pathname
  );
  useEffect(() => {
    const onNav = () =>
      setPathname((p) =>
        p === window.location.pathname ? p : window.location.pathname
      );
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);
  return pathname;
}

export function useRoute(): Route {
  const pathname = useLocationPathname();
  const route = routeFromPath(pathname);
  const prev = useRef(route);
  useEffect(() => {
    if (route !== prev.current) {
      prev.current = route;
      window.scrollTo(0, 0);
    }
  }, [route]);
  return route;
}

// Single subscription that yields both the route and the detail slug. Use this
// in Root instead of calling useRoute separately — one popstate listener, one
// re-render per navigation.
export function useRouteAndSlug(): { route: Route; slug: string | null } {
  const pathname = useLocationPathname();
  const route = routeFromPath(pathname);
  const slug = slugFromPath(pathname);
  const prev = useRef(route);
  useEffect(() => {
    if (route !== prev.current) {
      prev.current = route;
      window.scrollTo(0, 0);
    }
  }, [route]);
  return { route, slug };
}

// Click handler for in-app anchor links. Lets Ctrl/Cmd/Shift/Alt-clicks and
// middle-clicks fall through to the browser; otherwise converts the click into
// an SPA navigate.
export function onSpaLinkClick(
  href: string
): (e: MouseEvent<HTMLAnchorElement>) => void {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };
}

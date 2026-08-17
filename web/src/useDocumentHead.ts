/**
 * Per-route client-side <head> sync. Updates <title>, meta description, OG
 * tags, and <link rel="canonical"> on every SPA navigation. Detail pages
 * (DollPage, WeaponPage) set their own head so the full dataset doesn't land
 * in the eager entry chunk.
 *
 * The copy itself lives in src/share/pageMeta.ts — the same table the server
 * injects for crawlers (src/server/pageMeta.ts), so a visitor and a crawler can
 * never see a different title for the same URL.
 */
import { useEffect } from 'react';
import {
  ROUTE_META,
  SITE,
  normalizeCanonicalPath,
  routeMetaFor,
} from '../../src/share/pageMeta';

export {
  dollPageMeta,
  weaponPageMeta,
  builderPageMeta,
} from '../../src/share/pageMeta';

const DEFAULT_META = ROUTE_META.home;

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

function tabKey(): string {
  const seg = normalizeCanonicalPath(window.location.pathname.toLowerCase())
    .replace(/^\/+|\/+$/g, '')
    .split('/')[0];
  if (seg && Object.hasOwn(ROUTE_META, seg)) {
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
      const m = routeMetaFor(key) ?? DEFAULT_META;
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

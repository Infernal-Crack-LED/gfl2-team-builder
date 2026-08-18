/**
 * Pre-warms and caches recommendation card images for the /doll command.
 *
 * The server at refittingroom.app renders rec cards on-demand and caches them
 * with content-addressed filenames (immutable URLs). The first request for a
 * given rec code triggers rendering, which takes a few seconds — subsequent
 * requests are served instantly from the cache.
 *
 * This module pre-warms the server's render cache by requesting every doll's
 * rec card at bot startup (see events/ready.ts), so when a user types
 * `/doll name:alva`, the image is already rendered and Discord's image proxy
 * picks it up instantly.
 *
 * Pattern mirrors nikke-sim's manifest pre-generation: the image set is
 * bounded and small (one rec card per doll with community defaults), so
 * pre-rendering the whole set at startup is cheap.
 *
 * CACHING:
 *   - Rec codes (from /api/v1/rec-defaults/:slug) are cached in memory
 *     keyed by doll slug. They change only when the DB row is updated, so
 *     a TTL of 5 minutes with stale-on-error is safe.
 *   - Pre-warming triggers server-side rendering; the server's own render
 *     cache (RenderCache with LRU eviction) handles the PNG bytes.
 */

import { getSiteUrl, loadGfl2Data } from './data.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
/** After a failed refresh, wait this long before trying again. */
const RETRY_MS = 30 * 1000;

interface RecCodeEntry {
  code: string;
  imageUrl: string;
}

let codeCache: Map<string, RecCodeEntry> = new Map();
let cachedAt = 0;
let inflight: Promise<void> | null = null;

/** The base URL for the site's API (no trailing slash). */
function apiBase(): string {
  return getSiteUrl();
}

/**
 * Fetch the rec-defaults code for a single doll slug, or null if the doll
 * has no community recommendations.
 */
async function fetchRecCode(slug: string): Promise<RecCodeEntry | null> {
  const url = `${apiBase()}/api/v1/rec-defaults/${slug}`;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as { code?: string };
  if (!json.code) {
    return null;
  }
  return {
    code: json.code,
    imageUrl: `${apiBase()}/api/v1/img/rec.png?b=${encodeURIComponent(json.code)}`,
  };
}

/**
 * Pre-warm a single rec card image by requesting it. The server renders and
 * caches the PNG; subsequent requests (from Discord's image proxy) are instant.
 * Fire-and-forget — a failed warm is logged but not fatal.
 */
async function warmImage(imageUrl: string): Promise<void> {
  try {
    // Follow the 302 to the cache URL to trigger rendering.
    const res = await fetch(imageUrl, { redirect: 'follow' });
    if (!res.ok) {
      console.warn(`[imageCache] warm failed for ${imageUrl}: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[imageCache] warm failed for ${imageUrl}:`, err);
  }
}

/**
 * Load all rec-defaults codes and pre-warm their images. Cached for
 * CACHE_TTL_MS with single-flight and stale-on-error.
 */
export async function preloadImageCache(): Promise<void> {
  if (codeCache.size > 0 && Date.now() - cachedAt < CACHE_TTL_MS) {
    return;
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    try {
      const { dolls } = await loadGfl2Data();
      const newCache = new Map<string, RecCodeEntry>();

      // Fetch rec codes concurrently (bounded by doll count, typically ~50).
      const entries = await Promise.all(
        dolls.map(async (doll) => {
          const entry = await fetchRecCode(doll.slug);
          return entry ? ([doll.slug, entry] as const) : null;
        })
      );

      for (const entry of entries) {
        if (entry) {
          newCache.set(entry[0], entry[1]);
        }
      }

      // Pre-warm all images concurrently.
      await Promise.all(
        [...newCache.values()].map((e) => warmImage(e.imageUrl))
      );

      codeCache = newCache;
      cachedAt = Date.now();
      console.log(
        `[imageCache] loaded ${codeCache.size} rec card(s), images pre-warmed`
      );
    } catch (err) {
      if (codeCache.size > 0) {
        console.warn('[imageCache] refresh failed; serving stale copy:', err);
        cachedAt = Date.now() - CACHE_TTL_MS + RETRY_MS;
        return;
      }
      throw err;
    }
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Get the pre-cached rec card image URL for a doll slug, or null if the
 * doll has no community recommendations. Triggers a cache refresh if the
 * TTL has expired.
 */
export async function getRecCardImageUrl(slug: string): Promise<string | null> {
  if (codeCache.size === 0 || Date.now() - cachedAt >= CACHE_TTL_MS) {
    await preloadImageCache();
  }
  return codeCache.get(slug)?.imageUrl ?? null;
}

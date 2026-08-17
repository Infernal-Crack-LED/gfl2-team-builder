/**
 * Static-asset cache policy and conditional-request handling.
 *
 * Two classes only:
 *   - content-hashed URLs (vite bundles, the render-cache images, fonts) —
 *     immutable forever, because the URL changes when the bytes do.
 *   - everything else — `no-cache`, because it is rebuilt at a fixed URL on
 *     every deploy (index.html, the mirrored game art, robots/sitemap/llms).
 *
 * `no-cache` means "revalidate", not "don't store", so the second class needs a
 * validator or every page view re-downloads ~900 mirrored game-art tiles in
 * full. A weak size+mtime ETag turns those into 304s.
 */

export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const NO_CACHE = 'no-cache';

/** Vite emits `assets/<name>-<hash8>.<ext>`. */
const VITE_HASHED = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.[^/]+$/;
/** Self-hosted font subsets are versioned by deploy and license-stable. */
const FONT_FILE = /\.woff2?$/;

/**
 * The Cache-Control for a `/`-rooted request path. `/api/v1/img/*` sets its own
 * headers (imgApi.ts) and never reaches here.
 */
export function cacheControlFor(urlPath: string): string {
  if (urlPath.endsWith('index.html')) {
    return NO_CACHE;
  }
  if (VITE_HASHED.test(urlPath) || FONT_FILE.test(urlPath)) {
    return IMMUTABLE;
  }
  return NO_CACHE;
}

/** Weak validator: size + mtime, the cheapest thing that is correct here. */
export function etagFor(stat: { size: number; mtimeMs: number }): string {
  return `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
}

/**
 * RFC 7232 precedence: If-None-Match (including `*`) decides on its own, and
 * If-Modified-Since is consulted only when If-None-Match is absent — at
 * HTTP-date (whole second) granularity, so the mtime is floored to match.
 * Multiple If-None-Match headers arrive comma-joined, which is also the
 * header's own list syntax.
 */
export function isNotModified(
  etag: string,
  mtimeMs: number,
  ifNoneMatch: string | undefined,
  ifModifiedSince: string | undefined
): boolean {
  if (ifNoneMatch !== undefined) {
    const tags = ifNoneMatch.split(',').map((v) => v.trim());
    return tags.includes(etag) || tags.includes('*');
  }
  if (ifModifiedSince === undefined) {
    return false;
  }
  const since = Date.parse(ifModifiedSince);
  return Number.isFinite(since) && since >= Math.floor(mtimeMs / 1000) * 1000;
}

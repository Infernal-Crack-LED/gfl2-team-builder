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

/**
 * Weak validator: size + mtime, the cheapest thing that is correct here.
 *
 * `encoding` distinguishes the brotli variant from the identity one. Without
 * it both would validate against the same ETag, and a shared cache that stored
 * the `.br` bytes could hand them to a client that never asked for brotli.
 */
export function etagFor(
  stat: { size: number; mtimeMs: number },
  encoding?: string
): string {
  const suffix = encoding === undefined ? '' : `-${encoding}`;
  return `W/"${stat.size}-${Math.floor(stat.mtimeMs)}${suffix}"`;
}

/**
 * Does this Accept-Encoding actually ask for brotli? Matches the `br` token
 * (case-insensitive, parameters ignored) and honours an explicit `br;q=0`
 * refusal — a client that names the encoding only to reject it must still get
 * the identity bytes.
 */
export function acceptsBrotli(acceptEncoding: string | undefined): boolean {
  if (acceptEncoding === undefined) {
    return false;
  }
  for (const part of acceptEncoding.split(',')) {
    const [token, ...params] = part.trim().split(';');
    if ((token ?? '').trim().toLowerCase() !== 'br') {
      continue;
    }
    const q = params
      .map((p) => p.trim().toLowerCase())
      .find((p) => p.startsWith('q='));
    return q === undefined || Number(q.slice(2)) > 0;
  }
  return false;
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

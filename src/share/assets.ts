/**
 * Remote → local game-art URL mapping, shared by the mirror script and the
 * web app so the two can never disagree about where a file lands.
 *
 * The site self-hosts every icon it renders: hotlinking the Dandegate CDN
 * would put a request on someone else's server for every skill and key tile
 * on every page view. `npm run assets` mirrors the art referenced by
 * data/*.json into web/public/game-assets/, and `localAssetUrl` rewrites the
 * URLs the data still carries.
 *
 * The mapping is a pure function of the URL rather than a lookup table, so
 * the web bundle carries no manifest. The cost is that a freshly synced doll
 * points at a local file that does not exist until the mirror runs again —
 * callers handle that by falling back to the remote URL on image error.
 */

/** CDN whose art the mirror is allowed to pull. */
export const ASSET_CDN_HOST = 'cdn.dandegate.net';

/** Public path prefix for mirrored art. */
export const ASSET_BASE = '/game-assets';

/**
 * CDN categories the mirror covers, each with the longest edge kept for it —
 * roughly 2x the largest size the UI renders, so the art stays crisp on
 * retina without carrying the source resolution.
 *
 * Deliberately absent: `doll-images` (full character art and skins, not icons
 * — megabytes for images no page renders inline) and `range-maps` (nothing
 * renders them yet). Adding either is a line here plus a mirror re-run.
 */
export const MIRRORED_CATEGORIES = {
  skills: 128,
  summons: 128,
  keys: 128,
  /** Portraits — 130px in the doll grid, 96px on a doll page. */
  dolls: 256,
  weapons: 256,
} as const;

export type MirroredCategory = keyof typeof MIRRORED_CATEGORIES;

function isMirrored(category: string): category is MirroredCategory {
  return Object.hasOwn(MIRRORED_CATEGORIES, category);
}

export interface RemoteAsset {
  url: string;
  category: MirroredCategory;
  /** Content-hash basename, e.g. `abc123.webp`. */
  filename: string;
  /** Path under web/public, e.g. `game-assets/keys/abc123.webp`. */
  localPath: string;
  /** Longest edge to keep for this category. */
  maxEdge: number;
}

/**
 * Parse a CDN URL into its mirror target, or null when it is not art this
 * mirror handles (wrong host, uncovered category, unsafe filename).
 *
 * Only the basename is kept. Most art sits directly under its category
 * (`/keys/<hash>.webp`) but some is nested under a name-slug directory
 * (`/keys/<key-name>/<hash>.webp`) whose text is human-authored — it carries
 * apostrophes, commas, ampersands and en-dashes that have no business in a
 * served path. Dropping it is safe because the basename is a content hash:
 * two URLs that flatten to the same name are the same bytes (the sole case,
 * a summon reachable via two slugs, was verified byte-identical).
 */
export function parseRemoteAsset(url: string): RemoteAsset | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== ASSET_CDN_HOST) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const category = segments[0] as string;
  if (!isMirrored(category)) {
    return null;
  }

  // Path-traversal / shell-hostile names never reach the filesystem.
  const filename = decodeURIComponent(segments[segments.length - 1] as string);
  if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.startsWith('.')) {
    return null;
  }

  return {
    url,
    category,
    filename,
    localPath: `game-assets/${category}/${filename}`,
    maxEdge: MIRRORED_CATEGORIES[category],
  };
}

/**
 * The URL the app should render for a piece of CDN art: the mirrored copy
 * when we handle that category, otherwise the input unchanged.
 */
export function localAssetUrl(url: string): string;
export function localAssetUrl(url: null | undefined): null;
export function localAssetUrl(url: string | null | undefined): string | null;
export function localAssetUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const asset = parseRemoteAsset(url);
  return asset ? `${ASSET_BASE}/${asset.category}/${asset.filename}` : url;
}

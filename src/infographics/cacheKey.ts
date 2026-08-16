/**
 * Content-addressed cache keys for rendered cards.
 *
 * WHY content-addressed: Discord (and other embed crawlers) cache embed
 * images by URL essentially forever. A handed-out `/api/v1/img/build.png?b=…`
 * URL must therefore resolve to the SAME pixels permanently — so the redirect
 * target is named by a hash of (renderer version, kind, canonical decoded
 * payload). Bump RENDERER_VERSION on ANY visual change (layout, theme,
 * fonts, crop) and every previously handed-out URL keeps its old image while
 * new links render fresh.
 */
import { createHash } from 'node:crypto';

export const RENDERER_VERSION = 1;

export type RenderKind = 'build' | 'team';

/** Deterministic JSON: object keys sorted recursively, so logically equal
 * payloads hash identically regardless of source key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

export function renderCacheKey(kind: RenderKind, payload: unknown): string {
  return createHash('sha256')
    .update(`${RENDERER_VERSION}|${kind}|${stableStringify(payload)}`)
    .digest('hex')
    .slice(0, 16);
}

export function renderCacheFilename(kind: RenderKind, payload: unknown): string {
  return `${kind}.${renderCacheKey(kind, payload)}.png`;
}

/** Must match the cache-route guard in src/server/imgApi.ts. */
export const CACHE_FILENAME_RE = /^(build|team)\.[0-9a-f]{16}\.png$/;

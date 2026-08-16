/**
 * Share-link boot helpers for the per-doll builder page (/builder/<slug>).
 *
 * Two URL contracts carry a build into the page:
 *   ?b=<code>   — the full DollBuild code inlined in the URL. Self-contained,
 *                 works logged out, but long.
 *   ?id=<uuid>  — a saved-profiles row id (kind 'gfl2-share'); the code lives
 *                 server-side, so the URL stays short. Requires a fetch.
 *
 * Both are best-effort by design: junk params, wrong-doll codes, and failed
 * fetches all degrade to "no build" — a bad share link must never break the
 * page or clobber the default state. These helpers are pure (the fetcher is
 * injected) so they are unit-testable without a DOM or network.
 */
import { decodeDollBuild } from '../../src/share/buildCode';
import type { DollBuild } from '../../src/share/buildCode';

/**
 * Profiles kind for idempotent share rows (distinct from BUILD_KIND, which is
 * the user's named saves). Rows are named via shareProfileName(code) so
 * re-sharing an unchanged build reuses the same row — and the same URL.
 */
export const SHARE_PROFILE_KIND = 'gfl2-share';

// Saved-profile ids are server-generated UUIDs. Validating the shape before
// fetching keeps junk ?id= values from ever hitting the API.
const PROFILE_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Read a build from the `?b=` param. Returns null when the param is missing,
 * fails to decode, or belongs to a different doll (a build for another doll
 * applied here would be nonsense — ignore it rather than clobber state).
 */
export function bootBuildFromCodeParam(
  search: string,
  dollSlug: string
): DollBuild | null {
  const code = new URLSearchParams(search).get('b');
  if (!code) {
    return null;
  }
  const build = decodeDollBuild(code);
  if (!build || build.doll !== dollSlug) {
    return null;
  }
  return build;
}

/** Read a validated `?id=` param, or null when missing/malformed. */
export function bootIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('id');
  if (!id || !PROFILE_ID_RE.test(id)) {
    return null;
  }
  return id;
}

/**
 * Minimal Response shape the loader needs — injected so tests can substitute
 * a stub and the page can pass the real `fetch`.
 */
export type ShareFetcher = (url: string) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

/**
 * Fetch and decode a shared build by profile-row id. ANY failure — network
 * error, non-OK status (the /public endpoint may 404 for deleted rows), a
 * body without a string `code`, an undecodable code, or a code for another
 * doll — resolves to null. The id stays in the URL so a refresh re-resolves.
 */
export async function fetchSharedBuild(
  id: string,
  dollSlug: string,
  fetcher: ShareFetcher = fetch
): Promise<DollBuild | null> {
  try {
    const res = await fetcher(`/api/profiles/${encodeURIComponent(id)}/public`);
    if (!res.ok) {
      return null;
    }
    // The endpoint mirrors the SavedProfile shape; only `code` matters here.
    const body: unknown = await res.json();
    const code =
      body && typeof body === 'object'
        ? (body as { code?: unknown }).code
        : null;
    if (typeof code !== 'string') {
      return null;
    }
    const build = decodeDollBuild(code);
    return build && build.doll === dollSlug ? build : null;
  } catch {
    return null;
  }
}

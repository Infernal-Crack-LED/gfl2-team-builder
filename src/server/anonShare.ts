/**
 * Rules for ANONYMOUS share rows — the ones POST /api/share mints with no
 * session, so a logged-out user can still hand out a short link.
 *
 * These live in one module because three places have to agree on them: the
 * mint route (app.ts), the retention sweep (index.ts), and the tests. Getting
 * them out of sync means either orphaned rows or a link that dies early.
 *
 * The asymmetry with logged-in shares is deliberate. A signed-in user's share
 * row is owned, attributable and capped per account, so it keeps forever. An
 * anonymous row is owned by nobody, can never be listed or deleted through the
 * API (SavedPage hides the share kind; DELETE is scoped by discord_id), and is
 * writable by anyone who can reach the endpoint — so it gets a retention
 * window and a hard ceiling instead.
 */

/**
 * Owner column value for session-less rows. A sentinel rather than NULL: the
 * column is NOT NULL and part of the (discord_id, kind, name) unique index, so
 * a fixed string keeps hash-named dedup working — every anonymous share of the
 * same build collapses onto one row and yields the same id.
 *
 * Not a valid Discord snowflake (those are digits), so it can never collide
 * with a real user's rows.
 */
export const ANON_OWNER = 'anon';

/** Anonymous short links expire three days after their last write. */
export const ANON_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Hard ceiling on live anonymous rows. Retention bounds the STEADY state; this
 * bounds the worst case, since a burst can insert far faster than an hourly
 * sweep reclaims. At ~1KB a row this is a few tens of MB — well under any
 * plausible volume, and high enough that real traffic never reaches it.
 */
export const ANON_ROW_CAP = 20_000;

/** Rows written before this instant are expired. */
export function anonExpiryCutoff(now: number): Date {
  return new Date(now - ANON_RETENTION_MS);
}

/**
 * Best-effort client identity for rate limiting, from X-Forwarded-For.
 *
 * Each proxy APPENDS the address it saw, so with one trusted proxy in front
 * (Railway's edge) the LAST entry is the address that proxy observed — i.e.
 * the real client. Earlier entries are whatever the client itself sent and are
 * trivially forged, which is exactly why the first entry is the wrong one to
 * key on. Returns null when the header is absent or empty so the caller can
 * fall back to the socket address.
 */
export function clientIpFromForwardedFor(
  header: string | undefined
): string | null {
  if (!header) {
    return null;
  }
  const parts = header
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

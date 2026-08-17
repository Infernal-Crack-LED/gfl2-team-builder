/**
 * How long an anonymous share row lives — the ONE definition.
 *
 * Both sides need this number and they must not drift: the server sweeps on
 * it, and the client prints it in the expiry hint under the short-link button.
 * A hand-mirrored copy on each side means the UI can promise three days while
 * the sweep enforces something else, so it lives here with the other
 * DOM-free, dependency-free share contracts (buildCode, keyLabels).
 */

/** Days an anonymous short link survives after its last write. */
export const ANON_SHARE_RETENTION_DAYS = 3;

/** The same window in milliseconds, for date math. */
export const ANON_SHARE_RETENTION_MS =
  ANON_SHARE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

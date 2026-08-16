/**
 * Shared rules for PUBLIC profile reads (no auth). Both
 * /api/profiles/:id/public (app.ts) and the ?id= expansion in the image API
 * (imgApi.ts) must agree on exactly these, so they live in one module.
 */

/**
 * Kinds readable BY ID without a session. Adding a kind here makes every row
 * of that kind world-readable to anyone who knows the uuid — only add kinds
 * whose content is designed to be shared publicly. 'gfl2-share' rows are
 * minted by the client's share flow (named via shareProfileName()).
 */
export const PUBLIC_KINDS = ['gfl2-share'] as const;

/**
 * Profile ids are Postgres uuids. Anything not uuid-shaped is a 404 BEFORE
 * the DB query — no probing channel, no driver errors on garbage input.
 */
export const PUBLIC_PROFILE_ID_RE = /^[0-9a-f-]{36}$/i;

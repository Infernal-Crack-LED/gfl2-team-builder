/**
 * Bot-side shortlink minter for /sharedoll and /shareteam.
 *
 * Mints a `gfl2-share` row directly in the DB (the bot shares the Postgres
 * connection with the web server) and returns a short `?id=<uuid>` URL that
 * fits well within Discord's 2048-char embed limit. The web page resolves
 * the code from the DB via `GET /api/profiles/:id/public`.
 *
 * Bot-minted rows use discord_id = 'bot' so they survive the anonymous
 * retention sweep (which only targets 'anon' rows). Re-minting the same
 * code is idempotent — shareProfileName(code) hashes to the same name,
 * so the upsert just bumps updated_at.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { userProfiles } from '../../../db/schema.js';
import { shareProfileName } from '../../../share/buildCode.js';
import { getSiteUrl } from './data.js';

const SHARE_KIND = 'gfl2-share';
const BOT_OWNER = 'bot';

/** Mint (or reuse) a share row and return its UUID. */
async function mintShareId(code: string): Promise<string> {
  const name = shareProfileName(code);

  const existing = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.discordId, BOT_OWNER),
        eq(userProfiles.kind, SHARE_KIND),
        eq(userProfiles.name, name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0]!.id;
  }

  const [row] = await db
    .insert(userProfiles)
    .values({
      discordId: BOT_OWNER,
      kind: SHARE_KIND,
      name,
      code,
    })
    .returning({ id: userProfiles.id });

  return row!.id;
}

/**
 * Short URL for a doll build. Falls back to the long `?b=` form if minting
 * fails (DB unreachable, etc.) so the embed still works.
 */
export async function dollShortLink(
  slug: string,
  code: string
): Promise<string> {
  const site = getSiteUrl();
  try {
    const id = await mintShareId(code);
    return `${site}/builder/${encodeURIComponent(slug)}?id=${id}`;
  } catch {
    return `${site}/builder/${encodeURIComponent(slug)}?b=${encodeURIComponent(code)}`;
  }
}

/**
 * Short URL for a team build. Falls back to the long `?b=` form if minting
 * fails.
 */
export async function teamShortLink(code: string): Promise<string> {
  const site = getSiteUrl();
  try {
    const id = await mintShareId(code);
    return `${site}/team-builder?id=${id}`;
  } catch {
    return `${site}/team-builder?b=${encodeURIComponent(code)}`;
  }
}

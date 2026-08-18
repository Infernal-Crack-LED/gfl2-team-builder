/**
 * Bot-side reader for TapTap infographic URLs.
 *
 * The actual scraping lives in src/sync/taptap.ts and is invoked by the
 * sync script. This module reads pre-scraped URLs from the `infographics`
 * DB table so the bot never hits TapTap at request time.
 *
 * Row IDs: 'team', 'tierlist-v6', 'tierlist-v0'.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { infographics } from '../../../db/schema.js';

export interface InfographicData {
  imageUrl: string;
  momentId: string | null;
  title: string | null;
}

/** Read a single infographic row by its stable ID. */
export async function getInfographic(
  id: string
): Promise<InfographicData | null> {
  const rows = await db
    .select({
      imageUrl: infographics.imageUrl,
      momentId: infographics.momentId,
      title: infographics.title,
    })
    .from(infographics)
    .where(eq(infographics.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return row;
}

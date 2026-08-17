/**
 * Share-card labels for keys, shared by the browser preview and the server
 * renderer so the two can never disagree about what a card says.
 *
 * DOM-free and dependency-free — imported by both the web bundle and the Node
 * server, same contract as buildCode.ts / genericKeys.ts.
 */

/** The shape both `web/src/data.ts` Key and `src/server/gameData.ts` KeyEntry satisfy. */
export interface KeyLike {
  keyTitle: string | null;
  displayTitle: string | null;
  dollId: string | null;
}

/**
 * The slot number of a fixed key: Dandegate encodes it ONLY in the display
 * title ("Fixed Key 3 - Meal Prep" → 3), there is no numeric field. Returns
 * null for anything that doesn't match, so a re-sync that changes the title
 * format degrades to "no number" rather than to a wrong one.
 */
export function fixedKeySlot(key: KeyLike): number | null {
  const match = /^Fixed Key\s+(\d+)\b/i.exec(key.displayTitle ?? '');
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * How a common key is identified on a share card: by the DOLL it is sourced
 * from, since that is how players refer to them ("Suomi's common"). The
 * stat-only generics (see genericKeys.ts) have no source doll, so they name
 * themselves instead.
 */
export function commonKeySource(
  key: KeyLike,
  dollName: string | null | undefined
): string {
  if (dollName) {
    return dollName;
  }
  return key.keyTitle ?? key.displayTitle ?? 'Common Key';
}

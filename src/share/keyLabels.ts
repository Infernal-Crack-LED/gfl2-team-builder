/**
 * Share-card labels for keys, shared by the browser preview and the server
 * renderer so the two can never disagree about what a card says.
 *
 * DOM-free and dependency-free — imported by both the web bundle and the Node
 * server, same contract as buildCode.ts.
 */

/** The shape both `web/src/data.ts` Key and `src/server/gameData.ts` KeyEntry satisfy. */
export interface KeyLike {
  keyTitle: string | null;
  displayTitle: string | null;
  dollId: string | null;
  level?: number | null;
}

/**
 * The slot number of a fixed key. The datamine stores it as `level` (1–6,
 * the game's own slot order); the Dandegate-era data encoded it ONLY in the
 * display title ("Fixed Key 3 - Meal Prep" → 3), kept as the fallback for
 * old artifacts. Returns null when neither yields a slot, so a title-format
 * change degrades to "no number" rather than to a wrong one.
 */
export function fixedKeySlot(key: KeyLike): number | null {
  const level = key.level;
  if (typeof level === 'number' && level >= 1 && level <= 6) {
    return level;
  }
  const match = /^Fixed Key\s+(\d+)\b/i.exec(key.displayTitle ?? '');
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * The little chip next to a key title. `level` is the game's SLOT number,
 * which means different things per type (maintainer-specified):
 *   - Fixed keys:     the key NUMBER (slot 1–6) → "Fixed Key 3"
 *   - Expansion keys: slot 8 is the base key (no chip), slot 9 its second
 *                     tier → "Lv.2"
 *   - Common keys:    slot 7, but commons have no levels → no chip
 * Returns null for "show no chip".
 */
export function keyLevelChip(
  keyType: string | null,
  level: number | null | undefined
): string | null {
  if (level == null) {
    return null;
  }
  if (keyType === 'Fixed Key') {
    return `Fixed Key ${level}`;
  }
  if (keyType === 'Expansion Key' && level === 9) {
    return 'Lv.2';
  }
  return null;
}

/**
 * How a common key is identified on a share card: by the DOLL it is sourced
 * from, since that is how players refer to them ("Suomi's common"). The
 * stat-only pool keys have no source doll, so they name
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

/**
 * How a common key reads in a picker: "<Doll Name> - <Key Name>". Dandegate's
 * own display title is "Common Key - <Key Name>", which wastes the prefix on
 * something every entry in the list already is; the source doll is what
 * players actually search by. Generics have no source doll, so they keep the
 * upstream title.
 */
export function commonKeyLabel(
  key: KeyLike,
  dollName: string | null | undefined
): string {
  const name = key.keyTitle ?? key.displayTitle ?? 'Common Key';
  if (dollName) {
    return `${dollName} - ${name}`;
  }
  return key.displayTitle ?? name;
}

/**
 * How a fixed key reads in a picker: "<slot> - <Key Name>". The slot is the
 * unlock order, so leading with it lets a list of six read as a sequence.
 * Falls back to the bare name when the title carries no slot number.
 */
export function fixedKeyLabel(key: KeyLike): string {
  const name = key.keyTitle ?? key.displayTitle ?? 'Key';
  const slot = fixedKeySlot(key);
  return slot != null ? `${slot} - ${name}` : name;
}

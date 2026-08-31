/**
 * Rotation helpers shared by the wire codecs (share/buildCode.ts), the canvas
 * card renderers (src/infographics/core/*) and the HTML previews (web/src) —
 * one module so a rotation trims, splits and summarizes the same way on every
 * surface. DOM-free and dependency-free, like buildCode.ts.
 *
 * A rotation is up to 7 turns (T1–T7), each turn a free-text list of skill
 * entries ("Ult, S2, S1"). An empty INTERIOR turn is meaningful ("no action
 * this turn"), so only trailing empties are trimmed.
 */

export const MAX_ROTATION_TURNS = 7;
/** Per-turn character cap — a layout budget (the longest sheet cell is 66). */
export const MAX_ROTATION_TURN_LEN = 80;
/** Vertebrae range label cap, e.g. 'V2 - V6'. */
export const MAX_ROTATION_VERT_LEN = 24;
/** Condition suffix cap, e.g. 'with Expansion Key and Springfield'. */
export const MAX_ROTATION_COND_LEN = 80;
/** Rotation notes cap — the same layout-budget rationale as MAX_REC_NOTES. */
export const MAX_ROTATION_NOTES = 280;

/** Drop TRAILING empty turns; interior gaps stay. Nulls read as empty. */
export function trimRotation(
  turns: readonly (string | null | undefined)[] | null | undefined
): string[] {
  const out = (turns ?? []).map((t) => (typeof t === 'string' ? t : ''));
  while (out.length > 0 && (out[out.length - 1] as string).trim() === '') {
    out.pop();
  }
  return out;
}

/**
 * Encode-side normalization: at most 7 turns, each trimmed and cut at the
 * layout cap, then trailing-trimmed. [] means "no rotation" — callers omit
 * the field entirely rather than encoding an empty array.
 */
export function normalizeRotation(
  turns: readonly (string | null | undefined)[] | null | undefined
): string[] {
  return trimRotation(
    (turns ?? [])
      .slice(0, MAX_ROTATION_TURNS)
      .map((t) =>
        typeof t === 'string' ? t.trim().slice(0, MAX_ROTATION_TURN_LEN) : ''
      )
  );
}

/** One turn's skill entries — comma-separated in the turn text. */
export function splitRotationEntries(turn: string): string[] {
  return turn
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e !== '');
}

/** One-line "T1 Ult, S1 › T2 S2" summary (team card rows), or null. */
export function rotationSummary(
  turns: readonly (string | null | undefined)[] | null | undefined
): string | null {
  const line = trimRotation(turns)
    .map((t, i) => (t.trim() === '' ? null : `T${i + 1} ${t}`))
    .filter((s): s is string => s !== null)
    .join(' › ');
  return line === '' ? null : line;
}

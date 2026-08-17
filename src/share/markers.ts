/**
 * `[<kind>:<id>]` marker grammar — shared by the web app and the server.
 *
 * Game text from Dandegate refers to effects, summons, skills and keys by id
 * inside square brackets. Five kinds appear in the committed data
 * (`effect` 2035×, `summon` 203×, `dollSkill` 140×, `skillsummon` 16×, `key`
 * 1× across doll skill text alone), and 47 of them carry a doll-variant suffix
 * (`[effect:<uuid>|doll:florence]`) where only the part before the `|` keys a
 * lookup.
 *
 * Lives in `share/` because BOTH renderers must agree: the React pages resolve
 * markers into `<span title>` refs, and the server's no-JS bodies resolve them
 * into plain text. A grammar that differs by one kind means the crawler indexes
 * text the visitor never sees, which is exactly what the same-source rule in
 * docs/frontend-conventions.md §6 forbids. Each side keeps its own id→name
 * index (built from the same `data/*.json`), but the pattern, the id
 * normalization and the unresolved-name fallback are defined once, here.
 *
 * Node- and DOM-free, like every other `share/` module.
 */

export type MarkerKind =
  'effect' | 'summon' | 'dollSkill' | 'skillsummon' | 'key';

export const MARKER_KINDS: readonly MarkerKind[] = [
  'effect',
  'summon',
  'dollSkill',
  'skillsummon',
  'key',
];

/** Human-readable noun per kind, for the unresolved fallback. */
export const KIND_NOUN: Record<MarkerKind, string> = {
  effect: 'effect',
  summon: 'summon',
  dollSkill: 'skill',
  skillsummon: 'summon skill',
  key: 'key',
};

/**
 * Matches every marker kind, case-insensitively, with any id payload. Kept
 * module-private and WITHOUT the `g` flag: a shared global regex carries
 * `lastIndex` between callers, and `splitMarkers` builds its own global copy.
 * (`src/derive/effectMatrix.ts` has its own pattern and resets `lastIndex` by
 * hand — the failure mode this avoids.)
 */
const MARKER_SOURCE = /\[(effect|summon|dollSkill|skillsummon|key):([^\]]+)\]/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "humiliation-mark" → "Humiliation Mark". */
export function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Best-effort name for a marker whose id isn't in the dataset. Slug-form ids
 * are their own name; UUIDs carry nothing readable, so they degrade to
 * "unlisted effect" rather than a hex dump. A raw marker in the middle of a
 * sentence is the one thing neither renderer may ever emit.
 */
export function fallbackMarkerName(kind: MarkerKind, id: string): string {
  return UUID_RE.test(id) ? `unlisted ${KIND_NOUN[kind]}` : humanizeSlug(id);
}

/** Canonical kind for a case-insensitive match; unknown text reads as effect. */
export function canonicalKind(rawKind: string): MarkerKind {
  const lowered = rawKind.toLowerCase();
  return MARKER_KINDS.find((k) => k.toLowerCase() === lowered) ?? 'effect';
}

/** `<uuid>|doll:<slug>` → `<uuid>`: only the head keys a lookup. */
export function markerId(rawId: string): string {
  return rawId.split('|')[0] ?? rawId;
}

/** One resolved marker reference. */
export interface MarkerRef {
  kind: MarkerKind;
  id: string;
  name: string;
  /** false when `name` came from fallbackMarkerName, not a real lookup. */
  resolved: boolean;
}

export type MarkerSegment = string | MarkerRef;

/**
 * Split text into plain strings and marker refs. `lookup` returns a display
 * name for a (kind, id) pair or null; misses fall back to
 * `fallbackMarkerName`, so every ref carries a readable name.
 */
export function splitMarkers(
  text: string | null | undefined,
  lookup: (kind: MarkerKind, id: string) => string | null
): MarkerSegment[] {
  if (!text) {
    return [];
  }
  const segments: MarkerSegment[] = [];
  const re = new RegExp(MARKER_SOURCE.source, `${MARKER_SOURCE.flags}g`);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }
    const kind = canonicalKind(match[1] ?? '');
    const id = markerId(match[2] ?? '');
    const name = lookup(kind, id);
    segments.push(
      name
        ? { kind, id, name, resolved: true }
        : { kind, id, name: fallbackMarkerName(kind, id), resolved: false }
    );
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }
  return segments;
}

/**
 * The same resolution flattened to plain text — what a no-JS body or a card
 * renderer needs. Names replace markers inline, so the sentence reads the way
 * it does on the hydrated page.
 */
export function markersToText(
  text: string | null | undefined,
  lookup: (kind: MarkerKind, id: string) => string | null
): string {
  return splitMarkers(text, lookup)
    .map((s) => (typeof s === 'string' ? s : s.name))
    .join('');
}

/**
 * Index `{ id, name }` rows into a id→name map and hand the rows back, so a
 * caller can walk nested rows (a summon's skills) in the same pass. Shared so
 * the two sides cannot index different sources for the same kind.
 */
export function indexNamedRows(
  target: Map<string, string>,
  rows: unknown
): Record<string, unknown>[] {
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  for (const row of list) {
    const id = typeof row?.id === 'string' ? row.id : null;
    const name = typeof row?.name === 'string' ? row.name : null;
    if (id && name) {
      target.set(id, name);
    }
  }
  return list;
}

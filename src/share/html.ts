/**
 * Tiptap HTML → plain text. Lives in `share/` because both sides need it: the
 * sync pipeline strips skill/effect/key text on the way into data/*.json, and
 * the web app strips the nested blobs (vertebrae, remolding pattern) that the
 * pipeline passes through raw.
 */

/**
 * Strip Tiptap HTML to plain text. Preserves `[effect:<uuid>]` markers (they
 * are not HTML tags, so the regex ignores them). Block tags become newlines,
 * so callers can split on `\n` to recover paragraphs.
 */
export function stripHtml(html: string | null | undefined): string | null {
  if (html == null) {
    return null;
  }
  if (html === '') {
    return null;
  }

  const text = html
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text || null;
}

// --- Effect details ---
// `effectDetails` is usually plain text, but ~a quarter of effects carry a
// JSON string instead: `{"mainDetails": ..., "upgrades": [...]}`, where the
// upgrades are the V3/V6 rewrites of the effect. Running stripHtml over that
// whole string wrecks it — `</p>` becomes a raw newline inside a JSON string
// literal and `&quot;` becomes a bare quote — which is how the JSON ended up
// on the page verbatim. Parse first, strip the pieces, then present them.

/** One V-level rewrite of an effect (upgradeName is "V3", "V6", …). */
export interface EffectUpgrade {
  name: string | null;
  details: string | null;
}

export interface EffectDetails {
  main: string | null;
  upgrades: EffectUpgrade[];
}

/**
 * JSON.parse, tolerating the raw control characters an earlier stripHtml pass
 * may have injected into string literals. Returns null when it isn't JSON.
 */
function parseLooseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Re-escape the control chars, then try once more.
    const repaired = trimmed
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function detailString(value: unknown): string | null {
  return typeof value === 'string' ? stripHtml(value) : null;
}

/**
 * Read an `effectDetails` value into its main text plus V-level upgrades.
 * Plain-text details (the common case) come back as `main` with no upgrades,
 * and anything unparseable falls back to the stripped raw string — a page
 * shows prose or nothing, never a serialized object.
 */
export function parseEffectDetails(
  raw: string | null | undefined
): EffectDetails {
  if (!raw) {
    return { main: null, upgrades: [] };
  }
  const parsed = parseLooseJson(raw);
  if (parsed == null || typeof parsed !== 'object') {
    return { main: stripHtml(raw), upgrades: [] };
  }

  const obj = parsed as Record<string, unknown>;
  const rawUpgrades = Array.isArray(obj.upgrades) ? obj.upgrades : [];
  const upgrades = rawUpgrades
    .map((u) => u as Record<string, unknown>)
    .map((u) => ({
      name: typeof u?.upgradeName === 'string' ? u.upgradeName : null,
      details: detailString(u?.upgradeDetails),
      order: typeof u?.order === 'number' ? u.order : Number.MAX_SAFE_INTEGER,
    }))
    .filter((u) => u.details != null)
    .sort((a, b) => a.order - b.order)
    .map(({ name, details }) => ({ name, details }));

  return { main: detailString(obj.mainDetails), upgrades };
}

/**
 * Strip HTML for storage in data/*.json, JSON blobs included. Keeps a JSON
 * `effectDetails` valid by stripping inside its string values instead of over
 * the serialized text.
 */
export function stripDetailsHtml(
  raw: string | null | undefined
): string | null {
  if (raw == null || raw === '') {
    return null;
  }
  const parsed = parseLooseJson(raw);
  if (parsed == null || typeof parsed !== 'object') {
    return stripHtml(raw);
  }
  return JSON.stringify(stripStrings(parsed));
}

/** Recursively stripHtml every string in a parsed blob. */
function stripStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripHtml(value) ?? '';
  }
  if (Array.isArray(value)) {
    return value.map(stripStrings);
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        stripStrings(v),
      ])
    );
  }
  return value;
}

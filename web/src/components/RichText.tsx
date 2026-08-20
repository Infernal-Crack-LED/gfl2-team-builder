/**
 * Shared renderer for game text. Every description in the dataset is Tiptap
 * HTML sprinkled with `[<kind>:<uuid>]` markers; rendering it raw shows tags
 * and UUIDs. This module is the one place that turns it into readable prose:
 * strip the tags, split on the block breaks stripHtml leaves behind, and swap
 * each marker for the thing it names.
 *
 * DollPage, DollBuilderPage and WeaponPage all render through here so a
 * reference looks the same everywhere.
 */
import {
  getEffectById,
  getEffectDetails,
  isCnTranslated,
  resolveEffectMarkers,
  type MarkerKind,
  type TextRef,
  type TextSegment,
} from '../data';
import { stripHtml } from '../../../src/share/html';

const CN_TL_TOOLTIP =
  'Translated from CN — subject to change on Global release';

/**
 * Hover badge for text the datamine translated by hand from the CN client.
 * Renders nothing when the text is not in the registry, so it can be placed
 * unconditionally next to any name: <>{skill.name}<CnMark text={skill.name} /></>.
 * Pass an array to badge when ANY of several fields is registry-translated.
 */
export function CnMark({
  text,
}: {
  text: string | null | undefined | (string | null | undefined)[];
}) {
  const hit = Array.isArray(text)
    ? text.some((t) => isCnTranslated(t))
    : isCnTranslated(text);
  if (!hit) {
    return null;
  }
  return (
    <sup className="cn-tl" data-tooltip={CN_TL_TOOLTIP}>
      *
    </sup>
  );
}

/** Tooltip prefix per marker kind — tells the reader what a reference points at. */
const KIND_LABEL: Record<MarkerKind, string> = {
  effect: 'Effect',
  summon: 'Summon',
  dollSkill: 'Skill',
  skillsummon: 'Summon skill',
  key: 'Key',
};

/** Tooltip text for a marker: effect details when we have them. */
function refTitle(ref: TextRef): string {
  if (!ref.resolved) {
    return `${KIND_LABEL[ref.kind]} not in the synced dataset (${ref.id})`;
  }
  if (ref.kind === 'effect') {
    const effect = getEffectById(ref.id);
    // Tooltips get the base text only — the V-level rewrites belong on the
    // effect's own card, not crammed into a title attribute.
    const details = effect && getEffectDetails(effect).main;
    if (details) {
      return details;
    }
  }
  return `${KIND_LABEL[ref.kind]}: ${ref.name}`;
}

/** Render pre-resolved segments inline, references as <span data-tooltip>. */
export function RenderText({ segments }: { segments: TextSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        typeof seg === 'string' ? (
          <span key={i}>{seg}</span>
        ) : (
          <span
            key={i}
            className={
              seg.resolved
                ? `effect-ref ref-${seg.kind}`
                : 'effect-ref ref-unresolved'
            }
            data-tooltip={refTitle(seg)}
          >
            {seg.name}
          </span>
        )
      )}
    </>
  );
}

// --- Colour runs ------------------------------------------------------------
// The datamine converts the game's own highlight tags into exactly one HTML
// shape: `<span style="color: rgb(r, g, b);">…</span>`. That is the ONLY tag
// we render as styling; everything else is stripped. Runs never nest.

const COLOR_SPAN_RE =
  /<span style="color: (rgb\(\d+, \d+, \d+\));">([\s\S]*?)<\/span>/g;

interface ColorRun {
  color: string | null;
  text: string;
}

/**
 * Strip tags/entities WITHOUT trimming — a run's leading/trailing spaces are
 * the separators between coloured and plain text ("For each <span>1 tile
 * </span> removed"); stripHtml's trim would fuse the words together.
 */
function stripInline(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Split one paragraph into colour runs; unknown tags are stripped. */
function colorRuns(paragraph: string): ColorRun[] {
  const runs: ColorRun[] = [];
  let last = 0;
  for (const m of paragraph.matchAll(COLOR_SPAN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      runs.push({ color: null, text: paragraph.slice(last, idx) });
    }
    runs.push({ color: m[1] ?? null, text: m[2] ?? '' });
    last = idx + m[0].length;
  }
  if (last < paragraph.length) {
    runs.push({ color: null, text: paragraph.slice(last) });
  }
  return runs
    .map((r) => ({ ...r, text: stripInline(r.text) }))
    .filter((r) => r.text !== '');
}

/**
 * One paragraph of game text, inline: colour highlights preserved, markers
 * resolved, every other tag stripped. The building block for both RichText
 * and single-line call sites (card previews).
 */
export function RichTextInline({ text }: { text: string | null | undefined }) {
  if (!text) {
    return null;
  }
  return (
    <>
      {colorRuns(text).map((run, i) =>
        run.color ? (
          <span key={i} style={{ color: run.color }}>
            <RenderText segments={resolveEffectMarkers(run.text)} />
          </span>
        ) : (
          <RenderText key={i} segments={resolveEffectMarkers(run.text)} />
        )
      )}
    </>
  );
}

/**
 * Full game text → paragraphs. Handles both already-stripped fields (skill
 * descriptions, stripped during sync) and the raw HTML blobs the sync
 * pipeline passes through (vertebrae, imagoforms) — stripHtml is a no-op on
 * text that has no tags.
 *
 * Renders nothing at all when there's no text, so callers can decide what
 * their own empty state looks like.
 */
export function RichText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) {
    return null;
  }
  // Block breaks first (the same ones stripHtml collapses), so colour spans
  // are split per paragraph; stripping happens per run inside RichTextInline.
  const paragraphs = text
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => stripHtml(p) != null);
  if (paragraphs.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <RichTextInline text={p} />
          {i === paragraphs.length - 1 && <CnMark text={text} />}
        </p>
      ))}
    </div>
  );
}

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
  resolveEffectMarkers,
  type MarkerKind,
  type TextRef,
  type TextSegment,
} from '../data';
import { stripHtml } from '../../../src/share/html';

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
  const clean = stripHtml(text);
  if (!clean) {
    return null;
  }
  // stripHtml turns </p>, <br> and </li> into newlines — those are the
  // paragraph breaks the source HTML intended.
  const paragraphs = clean.split('\n').filter((p) => p.trim() !== '');
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <RenderText segments={resolveEffectMarkers(p)} />
        </p>
      ))}
    </div>
  );
}

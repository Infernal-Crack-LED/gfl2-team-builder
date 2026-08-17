/**
 * HTML/CSS recommendation card preview — mirrors the server-side canvas
 * recCard (src/infographics/core/recCard.ts) layout and colors.
 *
 * PORTRAIT, logical width 760; height computed from the SAME discrete-data
 * formula as recCardHeight (list lengths, section presence, the notes line
 * budget) — the constants below are a copy and must stay in sync. Download/copy
 * of the PNG lives in CardImageActions, shared with the other previews.
 */
import { useRef } from 'react';
import { assetUrl, PHASE_COLORS } from '../data';
import { CardImageActions } from './CardImageActions';

/** Cards are stamped with the DOMAIN — mirrors CARD_WORDMARK in core/theme.ts. */
const CARD_WORDMARK = 'refittingroom.app';

/** Site accent, the fallback tint for an unknown/missing element. */
const SITE_ACCENT = '#5b9dff';

const MUTED_PLACEHOLDER = '—';

/** Geometry copied from core/recCard.ts — see that file for the reasoning. */
const HEADER_H = 128;
const IDENT_TOP = HEADER_H + 14;
const PORTRAIT = 148;
const SEC_CONTENT_DROP = 46;
const BP_CHIP_H = 34;
const WEAPON_ROW_H = 56;
const WEAPON_ROW_GAP = 10;
const SET_LINE = 30;
const KEY_CHIP_H = 32;
const META_LINE = 28;
const NOTES_LINE = 24;
const NOTES_PAD = 12;
const NOTES_CHARS_PER_LINE = 70;
const NOTES_MAX_LINES = 5;
const FOOTER_H = 28;
/** Must match `transform: scale(…)` on .rec-card. */
const PREVIEW_SCALE = 0.55;

export interface RecCardPreviewData {
  dollName: string | null;
  dollClass: string | null;
  dollPhase: string | null;
  dollRarity: string | null;
  /** Ordered investment breakpoints ('V0'…'V6' / 'R1'…'R6'), best-first. */
  breakpoints: string[];
  /** The optimal investment point ('V3R1', 'V6', 'R6'…), or null. */
  optimal: string | null;
  /** Recommended weapons, best first (up to 3). */
  weapons: { name: string; imageUrl: string | null }[];
  /** Recommended attachment set names, best first (up to 3). */
  attachmentSets: string[];
  /** Fixed key slot numbers in PRIORITY (unlock) order — not sorted. */
  fixedKeySlots: number[];
  expansionKeyName: string | null;
  /** Common keys in priority order, labelled by their source doll. */
  commonKeySources: string[];
  statPrefs: string[];
  notes: string | null;
  portraitUrl: string | null;
}

/** Deterministic notes line budget — mirrors notesLineCount in recCard.ts. */
function notesLineCount(notes: string): number {
  return Math.min(
    NOTES_MAX_LINES,
    Math.max(1, Math.ceil(notes.length / NOTES_CHARS_PER_LINE))
  );
}

/** Mirror of recCardHeight — the scaled shell needs the card's real height. */
function recCardHeight(data: RecCardPreviewData): number {
  const weapons =
    SEC_CONTENT_DROP +
    Math.max(1, data.weapons.length) * WEAPON_ROW_H +
    (Math.max(1, data.weapons.length) - 1) * WEAPON_ROW_GAP;
  const sets =
    SEC_CONTENT_DROP + Math.max(1, data.attachmentSets.length) * SET_LINE;
  const keys =
    SEC_CONTENT_DROP +
    KEY_CHIP_H +
    (data.expansionKeyName ? META_LINE : 0) +
    (data.commonKeySources.length > 0 ? META_LINE : 0);
  const notes = data.notes
    ? SEC_CONTENT_DROP + notesLineCount(data.notes) * NOTES_LINE + 2 * NOTES_PAD
    : 0;
  return (
    IDENT_TOP +
    PORTRAIT +
    (SEC_CONTENT_DROP + BP_CHIP_H) + // roadmap
    weapons +
    sets +
    keys +
    (SEC_CONTENT_DROP + META_LINE) + // stats
    notes +
    FOOTER_H
  );
}

/**
 * A PRIORITY chip run — accent chips in the given order with '›' separators;
 * mirrors drawPriorityChips. Shared by the roadmap and the fixed-key line.
 */
function PriorityChips({
  tokens,
  accent,
  small,
}: {
  tokens: string[];
  accent: string;
  /** Fixed-key chips: 40×32 instead of the roadmap's 60×34. */
  small?: boolean;
}) {
  if (tokens.length === 0) {
    return <span className="rec-card-muted">{MUTED_PLACEHOLDER}</span>;
  }
  return (
    <div className={'rec-card-chips' + (small ? ' small' : '')}>
      {tokens.map((token, i) => (
        // Index keys: the same token can't repeat, but a chip run is
        // positional either way.
        <span key={`${token}-${i}`} className="rec-card-chipseq">
          {i > 0 && <span className="rec-card-chip-arrow">›</span>}
          <span className="rec-card-chip" style={{ background: accent }}>
            {token}
          </span>
        </span>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="rec-card-sechead">
      <span className="rec-card-label">{children}</span>
    </div>
  );
}

export function RecCardPreview({ data }: { data: RecCardPreviewData }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const accent = PHASE_COLORS[data.dollPhase ?? ''] ?? SITE_ACCENT;
  const subtitle = [data.dollClass, data.dollPhase, data.dollRarity]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' · ');
  const fixedTokens = data.fixedKeySlots
    .filter((s) => s >= 1 && s <= 6)
    .map(String);

  return (
    <div className="card-preview-wrapper">
      <div
        className="card-preview-scale"
        style={{ height: Math.ceil(recCardHeight(data) * PREVIEW_SCALE) }}
      >
        <div ref={cardRef} className="rec-card">
          {/* Accent stripe — the doll's element color */}
          <div className="rec-card-stripe" style={{ background: accent }} />

          {/* Header — same geometry as the squad card's */}
          <div className="rec-card-header">
            <h2 className="rec-card-title">Recommendation</h2>
            <div className="rec-card-mark">
              <span className="rec-card-brand">{CARD_WORDMARK}</span>
              <img
                className="card-mark-icon"
                src="/nikkesim-icon.png"
                alt=""
                crossOrigin="anonymous"
              />
            </div>
            <div className="rec-card-divider" />
          </div>

          {/* Identity: portrait, name, subtitle, optimal pill */}
          <div className="rec-card-ident">
            <div className="rec-card-portrait-frame">
              {data.portraitUrl ? (
                // assetUrl, not <GameIcon>: html-to-image needs crossOrigin
                // and a src that never swaps mid-export.
                <img
                  className="rec-card-portrait"
                  src={assetUrl(data.portraitUrl)}
                  alt=""
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="rec-card-portrait-empty" aria-hidden="true">
                  ?
                </div>
              )}
            </div>
            <div className="rec-card-ident-info">
              <p className="rec-card-name">
                {data.dollName ?? MUTED_PLACEHOLDER}
              </p>
              <p className="rec-card-subtitle">
                {subtitle || MUTED_PLACEHOLDER}
              </p>
              {data.optimal && (
                <span
                  className="rec-card-optimal"
                  style={{ background: accent }}
                >
                  Optimal {data.optimal}
                </span>
              )}
            </div>
          </div>

          {/* Investment roadmap */}
          <SectionLabel>INVESTMENT ROADMAP</SectionLabel>
          <div className="rec-card-roadmap">
            <PriorityChips tokens={data.breakpoints} accent={accent} />
          </div>

          {/* Weapons, ranked */}
          <SectionLabel>WEAPONS</SectionLabel>
          {data.weapons.length === 0 ? (
            <div className="rec-card-weapon-row is-empty">
              <span className="rec-card-muted">{MUTED_PLACEHOLDER}</span>
            </div>
          ) : (
            data.weapons.map((weapon, i) => (
              <div key={`${weapon.name}-${i}`} className="rec-card-weapon-row">
                <span className="rec-card-rank" style={{ color: accent }}>
                  {i + 1}
                </span>
                {weapon.imageUrl && (
                  <img
                    className="rec-card-weapon-art"
                    src={assetUrl(weapon.imageUrl)}
                    alt=""
                    crossOrigin="anonymous"
                  />
                )}
                <span className="rec-card-weapon-name">{weapon.name}</span>
              </div>
            ))
          )}

          {/* Attachment sets, ranked */}
          <SectionLabel>ATTACHMENT SETS</SectionLabel>
          {data.attachmentSets.length === 0 ? (
            <div className="rec-card-set-line">
              <span className="rec-card-muted">{MUTED_PLACEHOLDER}</span>
            </div>
          ) : (
            data.attachmentSets.map((set, i) => (
              <div key={set} className="rec-card-set-line">
                <span className="rec-card-rank" style={{ color: accent }}>
                  {i + 1}
                </span>
                <span className="rec-card-set-name">{set}</span>
              </div>
            ))
          )}

          {/* Keys: fixed priority chips; exp/common lines only when present */}
          <SectionLabel>KEYS</SectionLabel>
          <div className="rec-card-keyline">
            <span className="rec-card-keytitle" style={{ color: accent }}>
              Fixed
            </span>
            <PriorityChips tokens={fixedTokens} accent={accent} small />
          </div>
          {data.expansionKeyName && (
            <div className="rec-card-metaline">
              <span className="rec-card-keytitle" style={{ color: accent }}>
                Expansion
              </span>
              <span className="rec-card-metavalue">
                {data.expansionKeyName}
              </span>
            </div>
          )}
          {data.commonKeySources.length > 0 && (
            <div className="rec-card-metaline">
              <span className="rec-card-keytitle" style={{ color: accent }}>
                Common
              </span>
              <span className="rec-card-metavalue">
                {data.commonKeySources.join(' › ')}
              </span>
            </div>
          )}

          {/* Stats */}
          <SectionLabel>STATS</SectionLabel>
          <div className="rec-card-metaline">
            {data.statPrefs.length === 0 ? (
              <span className="rec-card-muted">{MUTED_PLACEHOLDER}</span>
            ) : (
              <span className="rec-card-metavalue">
                {data.statPrefs.join(' > ')}
              </span>
            )}
          </div>

          {/* Notes */}
          {data.notes && (
            <>
              <SectionLabel>NOTES</SectionLabel>
              <div className="rec-card-notes">
                <p
                  className="rec-card-notes-text"
                  style={{ WebkitLineClamp: notesLineCount(data.notes) }}
                >
                  {data.notes}
                </p>
              </div>
            </>
          )}

          <div className="rec-card-foot" />
        </div>
      </div>

      <CardImageActions
        cardRef={cardRef}
        filename={`${data.dollName ?? 'recommendation'}-rec-card.png`}
        downloadLabel="Download card image"
      />
    </div>
  );
}

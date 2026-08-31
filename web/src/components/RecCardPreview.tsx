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
import { trimRotation } from '../../../src/share/rotation';
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
const COND_KEY_LINE = 22;
const COND_KEY_ROW_PAD = 8;
const COND_KEY_CHARS_PER_LINE = 80;
const COND_KEY_MAX_LINES = 2;
const ROT_HEAD_LINE = 30;
const ROT_COND_LINE = 18;
const ROT_COND_LINES = 2;
const ROT_TURN_LINE = 28;
const ROT_NOTES_LINE = 24;
const ROT_NOTES_PAD = 8;
const ROT_NOTES_CHARS_PER_LINE = 74;
const ROT_NOTES_MAX_LINES = 4;
const FOOTER_H = 28;
/** Must match `transform: scale(…)` on .rec-card. */
const PREVIEW_SCALE = 0.55;

/** Mirrors core/recCard.ts RecCardConditionalKey. */
export interface RecCardPreviewConditionalKey {
  slot: number;
  condition: string | null;
}

/** Mirrors core/recCard.ts RecCardRotation — one variant, one column. */
export interface RecCardPreviewRotation {
  vertebrae: string | null;
  condition: string | null;
  turns: (string | null)[];
  notes: string | null;
}

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
  /** Conditional fixed keys, one row each under the Fixed chips. */
  conditionalKeys?: RecCardPreviewConditionalKey[];
  expansionKeyName: string | null;
  /** Common keys in priority order, labelled by their source doll. */
  commonKeySources: string[];
  statPrefs: string[];
  notes: string | null;
  /** Recommended rotation variants, one column each — the section is
   * omitted when absent / all-empty. */
  rotations?: RecCardPreviewRotation[] | null;
  /** Untouched sheet default — shows the attribution footer with icon. */
  official?: boolean;
  /** Untouched Gunsmoke rotation/fixed-key defaults — shows that credit. */
  gunsmoke?: boolean;
  portraitUrl: string | null;
}

/** Deterministic notes line budget — mirrors notesLineCount in recCard.ts. */
function notesLineCount(notes: string): number {
  return Math.min(
    NOTES_MAX_LINES,
    Math.max(1, Math.ceil(notes.length / NOTES_CHARS_PER_LINE))
  );
}

/** Mirrors condKeyLineCount in recCard.ts. */
function condKeyLineCount(condition: string | null): number {
  if (!condition) {
    return 1;
  }
  return Math.min(
    COND_KEY_MAX_LINES,
    Math.max(1, Math.ceil(condition.length / COND_KEY_CHARS_PER_LINE))
  );
}

/** Mirrors condKeysHeight in recCard.ts. */
function condKeysHeight(data: RecCardPreviewData): number {
  return (data.conditionalKeys ?? []).reduce(
    (h, ck) =>
      h + COND_KEY_ROW_PAD + condKeyLineCount(ck.condition) * COND_KEY_LINE,
    0
  );
}

/** Mirrors rotationNotesLineCount in recCard.ts. */
function rotationNotesLineCount(notes: string): number {
  return Math.min(
    ROT_NOTES_MAX_LINES,
    Math.max(1, Math.ceil(notes.length / ROT_NOTES_CHARS_PER_LINE))
  );
}

/** Mirrors visibleRotations in recCard.ts. */
function visibleRotations(data: RecCardPreviewData): RecCardPreviewRotation[] {
  return (data.rotations ?? []).filter((r) => trimRotation(r.turns).length > 0);
}

/** Mirrors rotationHeader in recCard.ts. */
function rotationHeader(r: RecCardPreviewRotation, i: number): string {
  return r.vertebrae ?? `#${i + 1}`;
}

/** Mirrors rotationNoteText in recCard.ts. */
function rotationNoteText(
  r: RecCardPreviewRotation,
  i: number,
  count: number
): string {
  return count > 1
    ? `${rotationHeader(r, i)}: ${r.notes ?? ''}`
    : (r.notes ?? '');
}

/** Mirrors rotationHeight in recCard.ts. */
function rotationHeight(data: RecCardPreviewData): number {
  const rots = visibleRotations(data);
  if (rots.length === 0) {
    return 0;
  }
  const anyCond = rots.some((r) => r.condition);
  const maxTurns = Math.max(...rots.map((r) => trimRotation(r.turns).length));
  const notesH = rots.reduce(
    (h, r, i) =>
      r.notes
        ? h +
          rotationNotesLineCount(rotationNoteText(r, i, rots.length)) *
            ROT_NOTES_LINE
        : h,
    0
  );
  return (
    SEC_CONTENT_DROP +
    ROT_HEAD_LINE +
    (anyCond ? ROT_COND_LINES * ROT_COND_LINE : 0) +
    maxTurns * ROT_TURN_LINE +
    (notesH > 0 ? notesH + ROT_NOTES_PAD : 0)
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
    condKeysHeight(data) +
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
    rotationHeight(data) +
    notes +
    // attribution footer lines (sheet defaults only)
    (data.official ? 30 : 0) +
    (data.gunsmoke ? 30 : 0) +
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

/** One attribution footer line — mirrors the canvas sheet-glyph credit. */
function SheetCredit({ text }: { text: string }) {
  return (
    <div className="rec-card-attribution">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <rect width="16" height="16" rx="3" fill="#21a463" />
        <rect x="3.5" y="3.5" width="9" height="9" fill="#fff" />
        <rect x="3.5" y="6.3" width="9" height="1.4" fill="#21a463" />
        <rect x="3.5" y="9.4" width="9" height="1.4" fill="#21a463" />
        <rect x="7.3" y="3.5" width="1.4" height="9" fill="#21a463" />
      </svg>
      <span>{text}</span>
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
  const rots = visibleRotations(data);
  const rotTurnsByCol = rots.map((r) => trimRotation(r.turns));
  const rotMaxTurns =
    rotTurnsByCol.length > 0
      ? Math.max(...rotTurnsByCol.map((t) => t.length))
      : 0;

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
                src="/site-icon.png"
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
          {/* Conditional keys: outlined chip + when to take it, one row each */}
          {(data.conditionalKeys ?? []).map((ck, i) => (
            <div
              key={`${ck.slot}-${i}`}
              className="rec-card-condkey"
              style={{ height: condKeyLineCount(ck.condition) * COND_KEY_LINE }}
            >
              <span
                className="rec-card-condkey-title"
                style={{ color: accent }}
              >
                {i === 0 ? 'Cond.' : ''}
              </span>
              <span
                className="rec-card-condkey-chip"
                style={{ borderColor: accent, color: accent }}
              >
                {ck.slot}
              </span>
              <span
                className={
                  'rec-card-condkey-text' +
                  (ck.condition ? '' : ' rec-card-muted')
                }
                style={{ WebkitLineClamp: condKeyLineCount(ck.condition) }}
              >
                {ck.condition ?? MUTED_PLACEHOLDER}
              </span>
            </div>
          ))}
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

          {/* Rotations: one column per variant beside a shared T gutter */}
          {rots.length > 0 && (
            <>
              <SectionLabel>
                {rots.length > 1 ? 'ROTATIONS' : 'ROTATION'}
              </SectionLabel>
              <div className="rec-card-rotrow rec-card-rothead">
                <span className="rec-card-rotgut" />
                {rots.map((r, i) => (
                  <span
                    key={i}
                    className="rec-card-rotv"
                    style={{ color: accent }}
                  >
                    {rotationHeader(r, i)}
                  </span>
                ))}
              </div>
              {rots.some((r) => r.condition) && (
                <div className="rec-card-rotrow rec-card-rotconds">
                  <span className="rec-card-rotgut" />
                  {rots.map((r, i) => (
                    <span key={i} className="rec-card-rotcond">
                      {r.condition}
                    </span>
                  ))}
                </div>
              )}
              {Array.from({ length: rotMaxTurns }, (_, t) => (
                <div key={t} className="rec-card-rotrow rec-card-rotturns">
                  <span
                    className="rec-card-rotgut rec-card-rotgut-label"
                    style={{ color: accent }}
                  >
                    T{t + 1}
                  </span>
                  {rotTurnsByCol.map((turns, i) => {
                    if (t >= turns.length) {
                      // This variant ends earlier — blank, not a dash.
                      return <span key={i} className="rec-card-rotcell" />;
                    }
                    const turn = (turns[t] ?? '').trim();
                    return (
                      <span
                        key={i}
                        className={
                          'rec-card-rotcell' +
                          (turn === '' ? ' rec-card-muted' : '')
                        }
                      >
                        {turn === '' ? MUTED_PLACEHOLDER : turn}
                      </span>
                    );
                  })}
                </div>
              ))}
              {rots.some((r) => r.notes) && (
                <div className="rec-card-rotnotes">
                  {rots.map((r, i) =>
                    r.notes ? (
                      <p
                        key={i}
                        className="rec-card-rotnote"
                        style={{
                          WebkitLineClamp: rotationNotesLineCount(
                            rotationNoteText(r, i, rots.length)
                          ),
                        }}
                      >
                        {rotationNoteText(r, i, rots.length)}
                      </p>
                    ) : null
                  )}
                </div>
              )}
            </>
          )}

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

          {data.official && (
            <SheetCredit text="Recommendation from GFL2 Official Release Info Compilation" />
          )}
          {data.gunsmoke && (
            <SheetCredit text="Recommended Rotation and Fixed Keys from GFL2 EN Gunsmoke Frontline Doll Info sheet" />
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

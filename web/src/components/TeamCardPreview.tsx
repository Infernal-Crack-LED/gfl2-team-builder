/**
 * HTML/CSS squad card preview — mirrors the server-side canvas teamCard
 * (src/infographics/core/teamCard.ts) layout and colors exactly.
 *
 * PORTRAIT, one row per doll, each carrying her whole build inline beside the
 * portrait. Logical width 760; height grows with filled slot count (HEADER 128
 * + rows + FOOTER 24; a row is 200, or 226 with an expansion-key line).
 * Download uses html-to-image at 2× pixel ratio.
 */
import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  assetUrl,
  getDollById,
  getKeyById,
  getWeaponById,
  PHASE_COLORS,
} from '../data';
import type { Doll } from '../data';
import type { DollBuild } from '../../../src/share/buildCode';
import { commonKeySource, fixedKeySlot } from '../../../src/share/keyLabels';

/** Cards are stamped with the DOMAIN — mirrors CARD_WORDMARK in core/theme.ts. */
const CARD_WORDMARK = 'refittingroom.app';

/** Site accent, the fallback tint for an unknown/missing element. */
const SITE_ACCENT = '#5b9dff';

const MUTED_PLACEHOLDER = '—';

/**
 * Card geometry, mirroring core/teamCard.ts (and the .team-card CSS block).
 * Needed here because `transform: scale` does not shrink the card's LAYOUT
 * box: the preview shell has to be told how tall the scaled card actually is,
 * or a short squad leaves a screenful of dead space under it.
 */
const HEADER_H = 128;
const FOOTER_H = 24;
const META_TOP = 147;
const META_LINE = 26;
const BASE_META_LINES = 2;
const META_BOTTOM_PAD = 22;
const PANEL_INSET = 5;
const EMPTY_BODY_H = 96;
/** Must match `transform: scale(…)` on .team-card. */
const PREVIEW_SCALE = 0.55;

function slotHeight(slot: TeamCardSlotData): number {
  const lines = BASE_META_LINES + (slot.expansionKey ? 1 : 0);
  return META_TOP + (lines - 1) * META_LINE + META_BOTTOM_PAD + PANEL_INSET;
}

function cardHeight(slots: TeamCardSlotData[]): number {
  const body =
    slots.length === 0
      ? EMPTY_BODY_H
      : slots.reduce((h, slot) => h + slotHeight(slot), 0);
  return HEADER_H + body + FOOTER_H;
}

/** Exactly the fields core/teamCard.ts's TeamCardSlot carries, minus the portrait. */
export interface TeamCardSlotData {
  dollName: string;
  weaponName: string | null;
  /** Element — tints the left edge of this doll's row. */
  dollPhase: string | null;
  refinement: number | null;
  /** Attachment set bonus name, shown inline after the weapon. */
  attachmentSet: string | null;
  vert: number[];
  fixedKeys: number[];
  expansionKey: string | null;
  commonKeys: string[];
  statPrefs: string[];
  portraitUrl: string | null;
}

/**
 * Doll + build → the card's slot shape. Lives HERE, not in the pages, so the
 * two call sites (team builder, infographics) can never render the same squad
 * differently — and so this resolution stays a mirror of the one the server
 * does in src/server/imgApi.ts.
 */
export function teamCardSlot(
  doll: Doll,
  build: DollBuild | null
): TeamCardSlotData {
  const keys = (build?.keys ?? [])
    .map((id) => getKeyById(id))
    .filter((k): k is NonNullable<typeof k> => k !== undefined);
  const expKey = build?.exp ? getKeyById(build.exp) : undefined;
  return {
    dollName: doll.name,
    weaponName: build?.weapon
      ? (getWeaponById(build.weapon)?.name ?? null)
      : null,
    dollPhase: doll.phase,
    refinement: build?.cal ?? null,
    attachmentSet: build?.set ?? null,
    vert: build?.vert ?? [],
    // Fixed keys show as SLOT NUMBERS, not titles — that is how a squad's key
    // investment is read at a glance. A key whose title carries no number
    // simply contributes no chip.
    fixedKeys: keys
      .map(fixedKeySlot)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b),
    // Short title: displayTitle prefixes every expansion key with "Expansion
    // Key - ", which the card's own EXP label already says.
    expansionKey: expKey
      ? (expKey.keyTitle ?? expKey.displayTitle ?? null)
      : null,
    // Common keys are named by their SOURCE doll ("Suomi", not the key's own
    // title); the stat-only generics have no source and name themselves.
    commonKeys: (build?.ck ?? [])
      .map((id) => getKeyById(id))
      .filter((k): k is NonNullable<typeof k> => k !== undefined)
      .map((k) =>
        commonKeySource(k, k.dollId ? getDollById(k.dollId)?.name : null)
      ),
    statPrefs: build?.stats ?? [],
    portraitUrl: doll.avatarUrl,
  };
}

/** `LABEL  value`, the value degrading to a muted em dash. */
function MetaField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="team-card-meta">
      <span className="team-card-field-label">{label}</span>
      <span
        className={'team-card-meta-value' + (value ? '' : ' is-empty')}
        title={value ?? undefined}
      >
        {value ?? MUTED_PLACEHOLDER}
      </span>
    </div>
  );
}

function SlotRow({ slot }: { slot: TeamCardSlotData }) {
  // Single-select in the builder; the deepest segment wins if a legacy code
  // carried more than one.
  const vert = slot.vert.length > 0 ? Math.max(...slot.vert) : null;
  return (
    <div
      className="team-card-row"
      style={{ height: slotHeight(slot) - 2 * PANEL_INSET }}
    >
      {/* Element-tinted left edge, over the panel's own border. */}
      <span
        className="team-card-element-bar"
        style={{
          background: PHASE_COLORS[slot.dollPhase ?? ''] ?? SITE_ACCENT,
        }}
      />
      <div className="team-card-portrait-frame">
        {slot.portraitUrl ? (
          // assetUrl, not <GameIcon>: html-to-image needs crossOrigin and a
          // src that never swaps mid-export. Same-origin art also can't taint
          // the canvas, which the CDN copy could.
          <img
            className="team-card-portrait"
            src={assetUrl(slot.portraitUrl)}
            alt=""
            crossOrigin="anonymous"
          />
        ) : (
          <div className="team-card-portrait-empty" aria-hidden="true">
            ?
          </div>
        )}
      </div>

      <div className="team-card-info">
        <div className="team-card-line team-card-line-name">
          <span className="team-card-name">{slot.dollName}</span>
          <span className={'team-card-pill' + (vert === null ? '' : ' is-on')}>
            {vert === null ? 'V—' : `V${vert}`}
          </span>
        </div>

        <div className="team-card-line team-card-line-weapon">
          <span
            className={
              'team-card-weapon' + (slot.weaponName ? '' : ' is-empty')
            }
          >
            {slot.weaponName ?? MUTED_PLACEHOLDER}
          </span>
          {slot.attachmentSet && (
            <span className="team-card-set">· {slot.attachmentSet}</span>
          )}
          <span
            className={
              'team-card-pill team-card-pill-sm' +
              (slot.refinement === null ? '' : ' is-on')
            }
          >
            {slot.refinement === null ? 'R—' : `R${slot.refinement}`}
          </span>
        </div>

        {/* One chip per EQUIPPED slot — see drawSlotChips in core/theme.ts. */}
        <div className="team-card-keys">
          <span className="team-card-field-label">FIXED KEYS</span>
          {slot.fixedKeys.length === 0 ? (
            <span className="team-card-meta-value is-empty">
              {MUTED_PLACEHOLDER}
            </span>
          ) : (
            slot.fixedKeys.map((n) => (
              <span key={n} className="team-card-keychip">
                {n}
              </span>
            ))
          )}
        </div>

        {/* The expansion-key line is ABSENT, not "—", when there is no
            expansion key, and the rest stack up into the space. */}
        <div className="team-card-meta-stack">
          {slot.expansionKey && (
            <div className="team-card-meta-row">
              <MetaField label="EXP. KEY" value={slot.expansionKey} />
            </div>
          )}
          <div className="team-card-meta-row">
            <MetaField
              label="COMMON KEYS"
              value={
                slot.commonKeys.length > 0 ? slot.commonKeys.join(' · ') : null
              }
            />
          </div>
          <div className="team-card-meta-row">
            <MetaField
              label="STATS"
              value={
                slot.statPrefs.length > 0 ? slot.statPrefs.join(' › ') : null
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamCardPreview({ slots }: { slots: TeamCardSlotData[] }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || downloading) {
      return;
    }
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#101216',
      });
      const link = document.createElement('a');
      link.download = 'squad-card.png';
      link.href = dataUrl;
      link.click();
    } catch {
      // Download failed silently — the preview is still visible.
    }
    setDownloading(false);
  }, [downloading]);

  return (
    <div className="card-preview-wrapper">
      <div
        className="card-preview-scale"
        style={{ height: Math.ceil(cardHeight(slots) * PREVIEW_SCALE) }}
      >
        <div ref={cardRef} className="team-card">
          {/* Accent stripe — one site-accent bar (see core/teamCard.ts on why
              this isn't per-doll element bands). */}
          <div className="team-card-stripe" />

          {/* Header */}
          <div className="team-card-header">
            <h2 className="team-card-title">Squad</h2>
            <div className="team-card-mark">
              <span className="team-card-brand">{CARD_WORDMARK}</span>
              <img
                className="card-mark-icon"
                src="/nikkesim-icon.png"
                alt=""
                crossOrigin="anonymous"
              />
            </div>
            <div className="team-card-divider" />
          </div>

          {/* Slots */}
          <div className="team-card-body">
            {slots.length === 0 && (
              <p className="team-card-empty">Empty squad</p>
            )}
            {slots.map((slot, i) => (
              <SlotRow key={i} slot={slot} />
            ))}
          </div>

          {/* No footer line — the brand mark in the header stamps the card;
              this is just the bottom breathing room the canvas leaves. */}
          <div className="team-card-foot" />
        </div>
      </div>

      {slots.length > 0 && (
        <button
          type="button"
          className="btn-outline card-preview-download"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? 'Rendering…' : 'Download squad card'}
        </button>
      )}
    </div>
  );
}

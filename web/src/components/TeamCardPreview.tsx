/**
 * HTML/CSS squad card preview — mirrors the server-side canvas teamCard
 * (src/infographics/core/teamCard.ts) layout and colors exactly.
 *
 * PORTRAIT, one row per doll, each carrying her whole build inline beside the
 * portrait. Logical width 760; height grows with filled slot count (HEADER 128
 * + ROW 190 × n + FOOTER 38). Download uses html-to-image at 2× pixel ratio.
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
/** Fixed-key slots a doll can unlock — chips are always drawn 1…6. */
const FIXED_KEY_SLOTS = [1, 2, 3, 4, 5, 6];

/**
 * Card geometry, mirroring core/teamCard.ts (and the .team-card CSS block).
 * Needed here because `transform: scale` does not shrink the card's LAYOUT
 * box: the preview shell has to be told how tall the scaled card actually is,
 * or a short squad leaves a screenful of dead space under it.
 */
const HEADER_H = 128;
const ROW_H = 190;
const FOOTER_H = 38;
const EMPTY_BODY_H = 96;
/** Must match `transform: scale(…)` on .team-card. */
const PREVIEW_SCALE = 0.55;

function cardHeight(n: number): number {
  return HEADER_H + (n === 0 ? EMPTY_BODY_H : ROW_H * n) + FOOTER_H;
}

/** Exactly the fields core/teamCard.ts's TeamCardSlot carries, minus the portrait. */
export interface TeamCardSlotData {
  dollName: string;
  weaponName: string | null;
  /** Element — tints this doll's band of the top accent stripe. */
  dollPhase: string | null;
  refinement: number | null;
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
    <div className="team-card-row">
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
          <span
            className={
              'team-card-pill team-card-pill-sm' +
              (slot.refinement === null ? '' : ' is-on')
            }
          >
            {slot.refinement === null ? 'R—' : `R${slot.refinement}`}
          </span>
        </div>

        <div className="team-card-keys">
          <span className="team-card-field-label">KEYS</span>
          {FIXED_KEY_SLOTS.map((n) => (
            <span
              key={n}
              className={
                'team-card-keychip' +
                (slot.fixedKeys.includes(n) ? ' is-on' : '')
              }
            >
              {n}
            </span>
          ))}
        </div>

        <div className="team-card-meta-row team-card-meta-exp">
          <MetaField label="EXP" value={slot.expansionKey} />
        </div>
        <div className="team-card-meta-row team-card-meta-split">
          <MetaField
            label="CK"
            value={
              slot.commonKeys.length > 0 ? slot.commonKeys.join(' · ') : null
            }
          />
          <MetaField
            label="STATS"
            value={
              slot.statPrefs.length > 0 ? slot.statPrefs.join(' › ') : null
            }
          />
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
        style={{ height: Math.ceil(cardHeight(slots.length) * PREVIEW_SCALE) }}
      >
        <div ref={cardRef} className="team-card">
          {/* Accent stripe — one equal band per doll, in that doll's element
              color, so the squad's elemental spread reads off the top edge. */}
          <div className="team-card-stripe">
            {slots.map((slot, i) => (
              <span
                key={i}
                className="team-card-stripe-band"
                style={{
                  background: PHASE_COLORS[slot.dollPhase ?? ''] ?? SITE_ACCENT,
                }}
              />
            ))}
          </div>

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

          {/* Footer */}
          <span className="team-card-footer">{CARD_WORDMARK}</span>
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

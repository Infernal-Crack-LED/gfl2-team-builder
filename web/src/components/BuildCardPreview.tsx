/**
 * HTML/CSS build card preview — mirrors the server-side canvas buildCard
 * (src/infographics/core/buildCard.ts) layout and colors exactly, so users
 * can see what their share image will look like before downloading.
 *
 * Logical size is 1200×630 (the OG card standard); the component renders at
 * that size inside a scrollable/scaled container. Download/copy of the PNG
 * lives in CardImageActions, shared with the squad and rec previews.
 */
import { useRef } from 'react';
import { assetUrl, PHASE_COLORS } from '../data';
import { CardImageActions } from './CardImageActions';

export interface BuildCardPreviewData {
  dollName: string | null;
  dollClass: string | null;
  dollPhase: string | null;
  dollRarity: string | null;
  weaponName: string | null;
  /** Weapon art URL, drawn inline with the name. */
  weaponImageUrl: string | null;
  /** Fixed key SLOT numbers (1–6) — the card names slots, not titles. */
  fixedKeySlots: number[];
  /** Common keys, labelled by their source doll (see share/keyLabels.ts). */
  commonKeySources: string[];
  expansionKeyName: string | null;
  vert: number[];
  portraitUrl: string | null;
  refinement: number | null;
  /** Attachment set bonus name, shown inline in the weapon row. */
  attachmentSet: string | null;
  statPrefs: string[];
}

/** Cards are stamped with the DOMAIN — mirrors CARD_WORDMARK in core/theme.ts. */
const CARD_WORDMARK = 'refittingroom.app';

/** Site accent, the fallback tint for an unknown/missing element. */
const SITE_ACCENT = '#5b9dff';

export function BuildCardPreview({ data }: { data: BuildCardPreviewData }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const subtitle = [data.dollClass, data.dollPhase, data.dollRarity]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' · ');

  // The card is tinted by the doll's element; the brand mark keeps the site
  // accent, since it identifies the site rather than the build.
  const accent = PHASE_COLORS[data.dollPhase ?? ''] ?? SITE_ACCENT;

  const activeVert = data.vert
    .filter((s) => s >= 1 && s <= 6)
    .sort((a, b) => a - b);

  const activeFixed = data.fixedKeySlots
    .filter((s) => s >= 1 && s <= 6)
    .sort((a, b) => a - b);

  const keyRows: { title: string; value: string }[] = [];
  if (data.commonKeySources.length > 0) {
    keyRows.push({ title: 'Common', value: data.commonKeySources.join(', ') });
  }
  if (data.expansionKeyName) {
    keyRows.push({ title: 'Expansion Key', value: data.expansionKeyName });
  }

  return (
    <div className="card-preview-wrapper">
      <div className="card-preview-scale">
        <div ref={cardRef} className="build-card">
          {/* Accent stripe — the doll's element color */}
          <div className="build-card-stripe" style={{ background: accent }} />

          {/* Brand mark — wordmark + the shared site icon, mirroring
              core/theme.ts drawBrandMark on the server side. */}
          <div className="build-card-mark">
            <span className="build-card-brand">{CARD_WORDMARK}</span>
            <img
              className="card-mark-icon"
              src="/site-icon.png"
              alt=""
              crossOrigin="anonymous"
            />
          </div>

          {/* Portrait */}
          <div className="build-card-portrait-frame">
            {data.portraitUrl ? (
              // assetUrl, not <GameIcon>: html-to-image needs crossOrigin and
              // a src that never swaps mid-export. Same-origin art also can't
              // taint the canvas, which the CDN copy could.
              <img
                className="build-card-portrait"
                src={assetUrl(data.portraitUrl)}
                alt=""
                crossOrigin="anonymous"
              />
            ) : (
              <div className="build-card-portrait-empty" aria-hidden="true">
                ?
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="build-card-info">
            <h2 className="build-card-name">{data.dollName ?? '—'}</h2>
            <p className="build-card-subtitle">{subtitle || '—'}</p>

            {/* Weapon — art, name and refinement on one row */}
            <div className="build-card-section">
              <span className="build-card-label">WEAPON</span>
              <div className="build-card-panel">
                {data.weaponImageUrl && (
                  <img
                    className="build-card-weapon-art"
                    src={assetUrl(data.weaponImageUrl)}
                    alt=""
                    crossOrigin="anonymous"
                  />
                )}
                <span className="build-card-value">
                  {data.weaponName ?? '—'}
                </span>
                {data.refinement != null && (
                  <span
                    className="build-card-refinement"
                    style={{ color: accent }}
                  >
                    R{data.refinement}
                  </span>
                )}
                {data.attachmentSet && (
                  <span className="build-card-set">· {data.attachmentSet}</span>
                )}
              </div>
            </div>

            {/* Keys — fixed slots as chips, then title/value rows */}
            <div className="build-card-section">
              <span className="build-card-label">KEYS</span>
              {/* One chip per EQUIPPED slot — same idiom as the vertebrae
                  below and as the squad card. */}
              <div className="build-card-keyrow build-card-chiprow">
                <span
                  className="build-card-keyrow-title"
                  style={{ color: accent }}
                >
                  Fixed
                </span>
                {activeFixed.length === 0 ? (
                  <span className="build-card-keyrow-value muted-value">—</span>
                ) : (
                  <div className="build-card-chips">
                    {activeFixed.map((n) => (
                      <span
                        key={n}
                        className="build-card-chip on"
                        style={{ background: accent }}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="build-card-keyrows">
                {keyRows.map((row) => (
                  <p key={row.title} className="build-card-keyrow">
                    <span
                      className="build-card-keyrow-title"
                      style={{ color: accent }}
                    >
                      {row.title}
                    </span>
                    <span className="build-card-keyrow-value">{row.value}</span>
                  </p>
                ))}
              </div>
            </div>

            {/* Vertebrae — only the selected segments */}
            <div className="build-card-section">
              <span className="build-card-label">VERTEBRAE</span>
              {activeVert.length === 0 ? (
                <p className="build-card-plain muted-value">—</p>
              ) : (
                <div className="build-card-chips">
                  {activeVert.map((seg) => (
                    <span
                      key={seg}
                      className="build-card-chip on"
                      style={{ background: accent }}
                    >
                      V{seg}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Stats — priority order */}
            <div className="build-card-section">
              <span className="build-card-label">STATS</span>
              <p
                className={
                  'build-card-plain' +
                  (data.statPrefs.length === 0 ? ' muted-value' : '')
                }
              >
                {data.statPrefs.length > 0 ? data.statPrefs.join(' > ') : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <CardImageActions
        cardRef={cardRef}
        filename={`${data.dollName ?? 'build'}-card.png`}
        downloadLabel="Download card image"
      />
    </div>
  );
}

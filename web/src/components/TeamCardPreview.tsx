/**
 * HTML/CSS team card preview — mirrors the server-side canvas teamCard
 * (src/infographics/core/teamCard.ts) layout and colors exactly.
 *
 * Logical width 1040; height grows with filled slot count (HEADER 156 +
 * ROW 84 × n + FOOTER 30). Download uses html-to-image at 2× pixel ratio.
 */
import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { assetUrl, PHASE_COLORS } from '../data';

export interface TeamCardSlotData {
  dollName: string;
  weaponName: string | null;
  /** Element — tints this doll's band of the top accent stripe. */
  dollPhase: string | null;
  portraitUrl: string | null;
}

/** Cards are stamped with the DOMAIN — mirrors CARD_WORDMARK in core/theme.ts. */
const CARD_WORDMARK = 'refittingroom.app';

/** Site accent, the fallback tint for an unknown/missing element. */
const SITE_ACCENT = '#5b9dff';

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
      <div className="card-preview-scale">
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
              <div
                key={i}
                className={'team-card-row' + (i % 2 === 1 ? ' alt' : '')}
              >
                <div className="team-card-portrait-frame">
                  {slot.portraitUrl ? (
                    // assetUrl, not <GameIcon>: html-to-image needs crossOrigin
                    // and a src that never swaps mid-export. Same-origin art
                    // also can't taint the canvas, which the CDN copy could.
                    <img
                      className="team-card-portrait"
                      src={assetUrl(slot.portraitUrl)}
                      alt=""
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div
                      className="team-card-portrait-empty"
                      aria-hidden="true"
                    >
                      ?
                    </div>
                  )}
                </div>
                <div className="team-card-info">
                  <span className="team-card-name">{slot.dollName}</span>
                  <span className="team-card-weapon">
                    {slot.weaponName ?? '—'}
                  </span>
                </div>
              </div>
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

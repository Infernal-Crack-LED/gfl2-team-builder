/**
 * HTML/CSS team card preview — mirrors the server-side canvas teamCard
 * (src/infographics/core/teamCard.ts) layout and colors exactly.
 *
 * Logical width 1040; height grows with filled slot count (HEADER 156 +
 * ROW 84 × n + FOOTER 30). Download uses html-to-image at 2× pixel ratio.
 */
import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';

export interface TeamCardSlotData {
  dollName: string;
  weaponName: string | null;
  portraitUrl: string | null;
}

const SITE_NAME = 'GFL2 Team Builder';

export function TeamCardPreview({
  slots,
}: {
  slots: TeamCardSlotData[];
}) {
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
          {/* Accent stripe */}
          <div className="team-card-stripe" />

          {/* Header */}
          <div className="team-card-header">
            <h2 className="team-card-title">Squad</h2>
            <span className="team-card-brand">{SITE_NAME}</span>
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
                className={
                  'team-card-row' + (i % 2 === 1 ? ' alt' : '')
                }
              >
                <div className="team-card-portrait-frame">
                  {slot.portraitUrl ? (
                    <img
                      className="team-card-portrait"
                      src={slot.portraitUrl}
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
          <span className="team-card-footer">{SITE_NAME}</span>
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

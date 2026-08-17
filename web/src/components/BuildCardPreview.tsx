/**
 * HTML/CSS build card preview — mirrors the server-side canvas buildCard
 * (src/infographics/core/buildCard.ts) layout and colors exactly, so users
 * can see what their share image will look like before downloading.
 *
 * Logical size is 1200×630 (the OG card standard); the component renders at
 * that size inside a scrollable/scaled container. Download uses html-to-image
 * at 2× pixel ratio for retina output, matching the server's DPR=2.
 */
import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';

export interface BuildCardPreviewData {
  dollName: string | null;
  dollClass: string | null;
  dollPhase: string | null;
  dollRarity: string | null;
  weaponName: string | null;
  keyNames: string[];
  vert: number[];
  portraitUrl: string | null;
  refinement: number | null;
  statPrefs: string[];
  commonKeyNames: string[];
}

const SITE_NAME = 'GFL2 Team Builder';
const FOOTER_NOTE = 'GFL2 Team Builder';

export function BuildCardPreview({ data }: { data: BuildCardPreviewData }) {
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
      link.download = `${data.dollName ?? 'build'}-card.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // Download failed silently — the preview is still visible.
    }
    setDownloading(false);
  }, [downloading, data.dollName]);

  const subtitle = [data.dollClass, data.dollPhase, data.dollRarity]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' · ');

  return (
    <div className="card-preview-wrapper">
      <div className="card-preview-scale">
        <div ref={cardRef} className="build-card">
          {/* Accent stripe */}
          <div className="build-card-stripe" />

          {/* Brand mark — wordmark + the shared site icon, mirroring
              core/theme.ts drawBrandMark on the server side. */}
          <div className="build-card-mark">
            <span className="build-card-brand">{SITE_NAME}</span>
            <img
              className="card-mark-icon"
              src="/nikkesim-icon.png"
              alt=""
              crossOrigin="anonymous"
            />
          </div>

          {/* Portrait */}
          <div className="build-card-portrait-frame">
            {data.portraitUrl ? (
              <img
                className="build-card-portrait"
                src={data.portraitUrl}
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

            {/* Weapon */}
            <div className="build-card-section">
              <span className="build-card-label">WEAPON</span>
              <div className="build-card-panel">
                <span className="build-card-value">
                  {data.weaponName ?? '—'}
                </span>
              </div>
            </div>

            {/* Keys */}
            <div className="build-card-section">
              <span className="build-card-label">KEYS</span>
              <p className="build-card-keys">
                {data.keyNames.length > 0 ? data.keyNames.join(' · ') : 'None'}
              </p>
            </div>

            {/* Vertebrae */}
            <div className="build-card-section">
              <span className="build-card-label">VERTEBRAE</span>
              <div className="build-card-chips">
                {[1, 2, 3, 4, 5, 6].map((seg) => (
                  <span
                    key={seg}
                    className={
                      'build-card-chip' + (data.vert.includes(seg) ? ' on' : '')
                    }
                  >
                    V{seg}
                  </span>
                ))}
              </div>
            </div>

            {/* Extras line: refinement, stat prefs, common keys */}
            {(() => {
              const parts: string[] = [];
              if (data.refinement) {
                parts.push(`Ref: R${data.refinement}`);
              }
              if (data.statPrefs.length > 0) {
                parts.push(`Stats: ${data.statPrefs.join(' > ')}`);
              }
              if (data.commonKeyNames.length > 0) {
                parts.push(`CK: ${data.commonKeyNames.join(', ')}`);
              }
              if (parts.length === 0) {
                return null;
              }
              return <p className="build-card-extras">{parts.join('  ·  ')}</p>;
            })()}
          </div>

          {/* Footer */}
          <span className="build-card-footer">{FOOTER_NOTE}</span>
        </div>
      </div>

      <button
        type="button"
        className="btn-outline card-preview-download"
        onClick={handleDownload}
        disabled={downloading}
      >
        {downloading ? 'Rendering…' : 'Download card image'}
      </button>
    </div>
  );
}

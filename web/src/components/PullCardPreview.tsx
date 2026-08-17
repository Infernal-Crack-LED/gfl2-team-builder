/**
 * HTML/CSS pull-odds card preview — mirrors the server-side canvas pullCard
 * (src/infographics/core/pullCard.ts) layout and colors, so the card the site
 * downloads and the card the bot attaches to /pulls are the same picture.
 *
 * Unlike the other three previews this one takes the RENDERER'S OWN data type
 * (PullCardData) rather than a preview-shaped copy: every string on the card
 * is produced by share/pullDisplay.ts, so there is no second place where a
 * probability could be worded or rounded differently. Only the geometry is
 * duplicated — the constants below are a copy of the canvas card's and must
 * stay in sync with it.
 *
 * LANDSCAPE, logical width 760; height is a pure function of the row count.
 * Download/copy of the PNG lives in CardImageActions, shared with the others.
 */
import { useRef, type CSSProperties } from 'react';
import type { PullCardData } from '../../../src/infographics/core/pullCard';
import { CardImageActions } from './CardImageActions';

/** Geometry copied from core/pullCard.ts — see that file for the reasoning. */
const HEADER_H = 132;
const TILE_H = 96;
const SEC_CONTENT_DROP = 46;
const ROW_H = 38;
const META_LINE = 30;
const DETAIL_LINE = 22;
const DETAIL_MAX_LINES = 2;
const DETAIL_PAD = 12;
const FOOTER_H = 26;
/** Must match `transform: scale(…)` on .pull-card. */
const PREVIEW_SCALE = 0.55;

/** Cards are stamped with the DOMAIN — mirrors CARD_WORDMARK in core/theme.ts. */
const CARD_WORDMARK = 'refittingroom.app';

/** Mirror of pullCardHeight — the scaled shell needs the card's real height. */
export function pullCardHeight(rowCount: number): number {
  return (
    HEADER_H +
    TILE_H +
    (SEC_CONTENT_DROP + rowCount * ROW_H) +
    META_LINE +
    (14 + DETAIL_MAX_LINES * DETAIL_LINE + 2 * DETAIL_PAD) +
    FOOTER_H
  );
}

export function PullCardPreview({
  data,
  filename,
}: {
  data: PullCardData;
  filename: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div className="card-preview-wrapper">
      <div
        className="card-preview-scale"
        style={{
          height: Math.ceil(pullCardHeight(data.rows.length) * PREVIEW_SCALE),
        }}
      >
        <div ref={cardRef} className="pull-card">
          {/* Accent stripe — the banner's tint, not a doll's element */}
          <div
            className="pull-card-stripe"
            style={{ background: data.accent }}
          />

          <div className="pull-card-header">
            <h2 className="pull-card-title">{data.title}</h2>
            <p className="pull-card-subtitle">{data.subtitle}</p>
            <div className="pull-card-mark">
              <span className="pull-card-brand">{CARD_WORDMARK}</span>
              <img
                className="card-mark-icon"
                src="/site-icon.png"
                alt=""
                crossOrigin="anonymous"
              />
            </div>
            <div className="pull-card-divider" />
          </div>

          <div className="pull-card-tiles">
            {data.tiles.map((tile) => (
              <div
                key={tile.label}
                className={'pull-card-tile' + (tile.main ? ' is-main' : '')}
                style={
                  tile.main
                    ? ({ '--tile-accent': data.accent } as CSSProperties)
                    : undefined
                }
              >
                <span className="pull-card-tile-label">{tile.label}</span>
                <span
                  className="pull-card-tile-value"
                  style={tile.main ? { color: data.accent } : undefined}
                >
                  {tile.value}
                </span>
                <span className="pull-card-tile-sub">{tile.sub}</span>
              </div>
            ))}
          </div>

          <div className="pull-card-sechead">
            <span className="pull-card-label">CUMULATIVE ODDS</span>
          </div>

          {data.rows.map((row) => (
            <div key={row.tier} className="pull-card-row">
              <span
                className="pull-card-tier"
                style={{ background: data.accent }}
              >
                {row.tier}
              </span>
              <span className="pull-card-copies">{row.copies}</span>
              <span className="pull-card-bar">
                {row.p > 0 && (
                  <span
                    className="pull-card-bar-fill"
                    style={{
                      // Mirrors the canvas's 3px floor: a tier you *could* hit
                      // must not render as an empty track.
                      width: `max(3px, ${Math.min(1, row.p) * 100}%)`,
                      background: data.accent,
                    }}
                  />
                )}
              </span>
              <span className="pull-card-chance">{row.chance}</span>
            </div>
          ))}

          {/* The canvas shrinks this line to fit; CSS can only ellipsize it,
              so the wording is kept short enough that neither has to. */}
          <p className="pull-card-meta">{data.meta}</p>

          <div className="pull-card-detail">
            <p className="pull-card-detail-text">{data.detail}</p>
          </div>

          <div className="pull-card-foot" />
        </div>
      </div>

      <CardImageActions
        cardRef={cardRef}
        filename={filename}
        downloadLabel="Download card image"
      />
    </div>
  );
}

/**
 * HTML/CSS weapon card preview — mirrors the server-side canvas weaponCard
 * (src/infographics/core/weaponCard.ts) layout and colors.
 *
 * Logical size 1200×630; the component renders inside a scrollable/scaled
 * container. Download/copy of the PNG lives in CardImageActions.
 */
import { useRef } from 'react';
import { assetUrl, resolveEffectMarkers } from '../data';
import { CardImageActions } from './CardImageActions';
import { RenderText } from './RichText';

/** Cards are stamped with the DOMAIN — mirrors CARD_WORDMARK in core/theme.ts. */
const CARD_WORDMARK = 'refittingroom.app';

/** Site accent, since weapons have no element. */
const SITE_ACCENT = '#5b9dff';

export interface WeaponCardPreviewData {
  name: string | null;
  rarity: string | null;
  weaponType: string | null;
  primaryAttribute: string | null;
  primaryAttributeStat: number | string | null;
  secondaryAttribute: string | null;
  secondaryAttributeStat: number | string | null;
  trait: string | null;
  effect: string | null;
  imprintDollName: string | null;
  imprintDescription: string | null;
  counterparts: string[];
  regionTag: string | null;
  weaponImageUrl: string | null;
}

export function WeaponCardPreview({ data }: { data: WeaponCardPreviewData }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const primaryStat =
    (data.primaryAttribute ?? '') +
    (data.primaryAttributeStat != null ? ` ${data.primaryAttributeStat}` : '');
  const secondaryStat =
    (data.secondaryAttribute ?? '') +
    (data.secondaryAttributeStat != null
      ? ` ${data.secondaryAttributeStat}`
      : '');

  return (
    <div className="card-preview-wrapper">
      <div className="card-preview-scale">
        <div ref={cardRef} className="weapon-card">
          {/* Accent stripe */}
          <div
            className="weapon-card-stripe"
            style={{ background: SITE_ACCENT }}
          />

          {/* Header */}
          <div className="weapon-card-header">
            <h2 className="weapon-card-title">Weapon</h2>
            <div className="weapon-card-mark">
              <span className="weapon-card-brand">{CARD_WORDMARK}</span>
              <img
                className="card-mark-icon"
                src="/site-icon.png"
                alt=""
                crossOrigin="anonymous"
              />
            </div>
            <div className="weapon-card-divider" />
          </div>

          {/* Left: weapon art */}
          <div className="weapon-card-art">
            {data.weaponImageUrl ? (
              <img
                className="weapon-card-art-img"
                src={assetUrl(data.weaponImageUrl)}
                alt=""
                crossOrigin="anonymous"
              />
            ) : (
              <div className="weapon-card-art-empty" aria-hidden="true">
                ?
              </div>
            )}
          </div>

          {/* Right: identity + stats */}
          <div className="weapon-card-info">
            <h2 className="weapon-card-name">{data.name ?? '—'}</h2>
            <div className="weapon-card-badges">
              {data.rarity && (
                <span className="weapon-card-badge">{data.rarity}</span>
              )}
              {data.weaponType && (
                <span className="weapon-card-badge">{data.weaponType}</span>
              )}
            </div>

            <div className="weapon-card-stats">
              <p className="weapon-card-stat">
                <span className="weapon-card-stat-title">Primary</span>
                <span className="weapon-card-stat-value">
                  {primaryStat || '—'}
                </span>
              </p>
              {data.secondaryAttribute && (
                <p className="weapon-card-stat">
                  <span className="weapon-card-stat-title">Secondary</span>
                  <span className="weapon-card-stat-value">
                    {secondaryStat || '—'}
                  </span>
                </p>
              )}
              {data.imprintDollName && (
                <p className="weapon-card-stat">
                  <span className="weapon-card-stat-title">Imprint</span>
                  <span className="weapon-card-stat-value">
                    {data.imprintDollName}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Bottom: trait / effect */}
          <div className="weapon-card-text">
            <div className="weapon-card-section">
              <span className="weapon-card-label">TRAIT</span>
              <p
                className={
                  'weapon-card-body' + (data.trait ? '' : ' muted-value')
                }
              >
                {data.trait ? (
                  <RenderText segments={resolveEffectMarkers(data.trait)} />
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div className="weapon-card-section">
              <span className="weapon-card-label">EFFECT</span>
              <p
                className={
                  'weapon-card-body' + (data.effect ? '' : ' muted-value')
                }
              >
                {data.effect ? (
                  <RenderText segments={resolveEffectMarkers(data.effect)} />
                ) : (
                  '—'
                )}
              </p>
            </div>
            {data.counterparts.length > 0 && (
              <div className="weapon-card-counters">
                {data.counterparts.map((label) => (
                  <span key={label} className="weapon-card-counter">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="weapon-card-region">
            Region: {data.regionTag?.toUpperCase() ?? 'EN'}
          </div>
        </div>
      </div>

      <CardImageActions
        cardRef={cardRef}
        filename={`${data.name ?? 'weapon'}-card.png`}
        downloadLabel="Download card image"
      />
    </div>
  );
}

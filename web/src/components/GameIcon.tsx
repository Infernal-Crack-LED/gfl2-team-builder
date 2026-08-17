/**
 * <img> for CDN-sourced game art (skill, summon and key icons), pointed at
 * our own mirror instead of the Dandegate CDN.
 *
 * `npm run icons` mirrors everything data/*.json references into
 * web/public/game-assets/, so the rendered src is normally local and the site
 * makes no third-party image requests. The exception is a doll or key synced
 * since the last mirror run: rather than show a broken tile, the first load
 * error falls back to the original URL. That path is a safety net — if it
 * ever fires in practice, the fix is to re-run the mirror.
 */
import { useState } from 'react';
import { assetUrl } from '../data';

export function GameIcon({
  src,
  alt = '',
  className,
}: {
  /** Original URL as it appears in the data. */
  src: string;
  alt?: string;
  className?: string;
}) {
  const [fellBack, setFellBack] = useState(false);
  const local = assetUrl(src);

  return (
    <img
      className={className}
      src={fellBack ? src : local}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (!fellBack && local !== src) {
          setFellBack(true);
        }
      }}
    />
  );
}

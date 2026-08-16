/**
 * Visual identity for server-rendered cards. Colors mirror the CSS design
 * tokens in web/src/styles.css (`:root`) one-for-one — when a token changes,
 * change it here too, or the share images drift from the site they advertise.
 */
import { fitText, type Canvas2DLike } from './canvas2d.js';

export const COLORS = {
  bg: '#101216', // --bg
  panel: '#181b22', // --panel
  panel2: '#1f232d', // --panel2
  border: '#2a2f3b', // --border
  text: '#e7eaf0', // --text
  muted: '#8b93a3', // --muted
  accent: '#5b9dff', // --accent
} as const;

/**
 * Canvas font family. The three Roboto TTFs under assets/fonts/ are
 * registered under this family name by node/fonts.ts (Roboto is the first
 * non-Apple entry in the site's system font stack, so cards match the site).
 */
export const FONT = 'Roboto';

/**
 * Canonical site identity. index.html has no absolute canonical origin yet
 * (og:url is "/"), so the brand mark uses the site NAME from the static head
 * (`og:site_name` / <title>). Keep it in sync with web/index.html.
 */
export const SITE_NAME = 'GFL2 Team Builder';

/**
 * Mandatory watermark, drawn top-right on every card. It takes NO text
 * parameter on purpose: no renderer can accidentally ship an unmarked (or
 * mis-marked) image — the brand string is owned here and nowhere else.
 */
export function drawBrandMark(
  ctx: Canvas2DLike,
  { right, top }: { right: number; top: number }
): void {
  ctx.save();
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 15px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.85;
  fitText(ctx, SITE_NAME, right - 400, top, 400, '500', 15, FONT, 10);
  ctx.restore();
}

/**
 * One-line footer provenance note (e.g. render mode / link hint). Renderers
 * draw it muted, bottom-left.
 */
export function footerNote(): string {
  return 'Rendered server-side · content-addressed share image';
}

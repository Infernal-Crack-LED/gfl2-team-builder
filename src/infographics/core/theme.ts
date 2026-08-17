/**
 * Visual identity for server-rendered cards. Colors mirror the CSS design
 * tokens in web/src/styles.css (`:root`) one-for-one — when a token changes,
 * change it here too, or the share images drift from the site they advertise.
 */
import { drawContained, type Canvas2DLike } from './canvas2d.js';

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
 * Mark geometry, mirroring nikke-sim's (src/infographics/core/theme.ts): the
 * wordmark in accent blue with the shared site icon to its right, hung off
 * the card's top-right corner. It sits where the eye already is — the title
 * row — instead of in the muted grey footer line.
 */
const MARK_ICON = 40; // site icon square
const MARK_FONT = 15; // wordmark size
const MARK_GAP = 8; // wordmark → icon
const MARK_BASELINE = 24; // wordmark baseline, from the icon's top edge

/**
 * Mandatory watermark, drawn top-right on every card. It takes NO text
 * parameter on purpose: no renderer can accidentally ship an unmarked (or
 * mis-marked) image — the brand string is owned here and nowhere else.
 *
 * `icon` is the shared nikkesim.app mark (node/icon.ts loads it; the browser
 * previews use the same PNG from web/public/). It is OPTIONAL: a host with no
 * icon loaded thins the mark to its wordmark rather than dropping it, so a
 * missing asset can never produce an unmarked image.
 *
 * Returns the mark's LEFT edge so a caller can clamp a title that would
 * otherwise run underneath it.
 */
export function drawBrandMark(
  ctx: Canvas2DLike,
  o: {
    right: number; // the mark's right edge (usually W - padX)
    top: number; // the icon's y
    icon?: unknown;
  }
): number {
  ctx.save();
  let right = o.right;
  // The icon is opaque to the core (a node Canvas or a browser HTMLImageElement),
  // so its intrinsic size is read off whichever pair of properties it carries.
  const im = o.icon as
    | {
        naturalWidth?: number;
        naturalHeight?: number;
        width?: number;
        height?: number;
      }
    | undefined;
  const iw = im ? (im.naturalWidth ?? im.width ?? 0) : 0;
  const ih = im ? (im.naturalHeight ?? im.height ?? 0) : 0;
  if (o.icon && iw > 0 && ih > 0) {
    drawContained(
      ctx,
      o.icon,
      iw,
      ih,
      right - MARK_ICON,
      o.top,
      MARK_ICON,
      MARK_ICON
    );
    right -= MARK_ICON + MARK_GAP;
  }
  ctx.font = `700 ${MARK_FONT}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.accent;
  const left = right - ctx.measureText(SITE_NAME).width;
  ctx.fillText(SITE_NAME, left, o.top + MARK_BASELINE);
  ctx.restore();
  return left;
}

/**
 * One-line footer provenance note (e.g. render mode / link hint). Renderers
 * draw it muted, bottom-left.
 */
export function footerNote(): string {
  return 'Rendered server-side · content-addressed share image';
}

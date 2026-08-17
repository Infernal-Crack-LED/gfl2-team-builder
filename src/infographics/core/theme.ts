/**
 * Visual identity for server-rendered cards. Colors mirror the CSS design
 * tokens in web/src/styles.css (`:root`) one-for-one — when a token changes,
 * change it here too, or the share images drift from the site they advertise.
 */
import {
  drawContained,
  imageSize,
  roundRect,
  type Canvas2DLike,
} from './canvas2d.js';

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
 * (og:url is "/"), so page titles use the site NAME from the static head
 * (`og:site_name` / <title>). Keep it in sync with web/index.html.
 */
export const SITE_NAME = 'Refitting Room';

/**
 * What cards are STAMPED with — the domain, not the site name: a card gets
 * screenshotted and re-posted far from any link, so the mark has to be
 * something a reader can type into a browser. Deliberately separate from
 * SITE_NAME (which is <title> copy); mirrored by the HTML card previews in
 * web/src/components/*CardPreview.tsx.
 */
export const CARD_WORDMARK = 'refittingroom.app';

/**
 * Per-element (game "phase") accent colors. MUST stay in sync with
 * PHASE_COLORS in web/src/data.ts — the HTML preview and the rendered PNG
 * tint the same card from these two copies.
 */
export const PHASE_COLORS: Record<string, string> = {
  Physical: '#b0b7c3',
  Burn: '#d92d38',
  Hydro: '#0075f8',
  Electric: '#e0b04b',
  Freeze: '#00c8e0',
  Corrosion: '#00e554',
  Omni: '#bc1eb1',
};

/**
 * The accent a card is tinted with: the doll's element, falling back to the
 * site accent for an unknown/missing phase so a card is never un-accented.
 */
export function phaseAccent(phase: string | null | undefined): string {
  if (!phase) {
    return COLORS.accent;
  }
  return PHASE_COLORS[phase.trim()] ?? COLORS.accent;
}

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
 * `icon` is Refitting Room's chevron mark (node/icon.ts loads it; the
 * browser previews use the same PNG from web/public/site-icon.png). It is
 * OPTIONAL: a host with no icon loaded thins the mark to its wordmark rather
 * than dropping it, so a missing asset can never produce an unmarked image.
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
  const { w: iw, h: ih } = imageSize(o.icon);
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
  const left = right - ctx.measureText(CARD_WORDMARK).width;
  ctx.fillText(CARD_WORDMARK, left, o.top + MARK_BASELINE);
  ctx.restore();
  return left;
}

/**
 * A row of numbered slot chips — the shared idiom for "which numbered things
 * are equipped": fixed keys on BOTH cards, vertebrae on the build card. Lives
 * here rather than in either card so the two can't drift apart.
 *
 * ONLY the equipped numbers are drawn. Rendering all six with the unpicked
 * ones greyed reads as a progress bar and buries the two that matter — the
 * chips are a list of what IS there, not a checklist of what isn't. An empty
 * list falls back to a muted em dash so the row is never blank.
 *
 * `y` is the chips' TOP edge (they are box-positioned, not baseline-aligned).
 */
export function drawSlotChips(
  ctx: Canvas2DLike,
  slots: number[],
  o: {
    x: number;
    y: number;
    w: number;
    h: number;
    gap: number;
    radius: number;
    fontSize: number;
    /** Chip fill — the card's accent (site blue, or the doll's element). */
    fill: string;
    /** Prepended to the number, e.g. 'V' for vertebrae. */
    prefix?: string;
  }
): void {
  ctx.save();
  if (slots.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 ${Math.round(o.h * 0.7)}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('—', o.x, o.y + o.h / 2);
    ctx.restore();
    return;
  }
  slots.forEach((n, i) => {
    const cx = o.x + i * (o.w + o.gap);
    ctx.fillStyle = o.fill;
    roundRect(ctx, cx, o.y, o.w, o.h, o.radius);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.font = `700 ${o.fontSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${o.prefix ?? ''}${n}`, cx + o.w / 2, o.y + o.h / 2 + 1);
  });
  ctx.restore();
}

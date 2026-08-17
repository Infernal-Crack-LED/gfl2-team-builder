/**
 * Team composition card — the og:image for `/team-builder?b=…` share links.
 *
 * Composition ONLY: portraits + names (+ a muted weapon line). No stats — the
 * card advertises the squad, it doesn't audit it. Logical width is fixed at
 * 1040; height grows with filled slot count (see cardHeight). Rasterized at
 * dpr 2 by node/render.ts.
 */
import { fitText, roundRect, type Canvas2DLike } from './canvas2d.js';
import { COLORS, FONT, drawBrandMark, footerNote } from './theme.js';

export const TEAM_CARD_W = 1040;

const HEADER_H = 156;
const ROW_H = 84;
const FOOTER_H = 30;
const PORTRAIT = 64;

/** One filled squad slot, resolved to display names by the node side. */
export interface TeamCardSlot {
  dollName: string;
  weaponName: string | null;
  /** Square-cropped portrait canvas (opaque to the core), or null. */
  portrait: unknown | null;
}

/** Total logical card height for `n` filled slots. */
export function cardHeight(n: number): number {
  return HEADER_H + ROW_H * n + FOOTER_H;
}

export function drawTeamCard(
  ctx: Canvas2DLike,
  slots: TeamCardSlot[],
  /** Shared site-icon image for the brand mark (opaque to the core). */
  siteIcon?: unknown | null
): void {
  const h = cardHeight(slots.length);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, TEAM_CARD_W, h);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, TEAM_CARD_W, 6);

  // Header
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText('Squad', 60, 88);
  drawBrandMark(ctx, { right: TEAM_CARD_W - 40, top: 30, icon: siteIcon });
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(60, HEADER_H - 24, TEAM_CARD_W - 120, 2);

  if (slots.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText('Empty squad', 60, HEADER_H + 40);
  }

  slots.forEach((slot, i) => {
    const y = HEADER_H + i * ROW_H;
    // Alternate row surface for readability.
    if (i % 2 === 1) {
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(40, y, TEAM_CARD_W - 80, ROW_H);
    }

    // Portrait with two-fills border.
    const px = 60;
    const py = y + (ROW_H - PORTRAIT) / 2;
    ctx.fillStyle = COLORS.border;
    roundRect(ctx, px - 2, py - 2, PORTRAIT + 4, PORTRAIT + 4, 10);
    ctx.fill();
    ctx.save();
    roundRect(ctx, px, py, PORTRAIT, PORTRAIT, 8);
    ctx.clip();
    ctx.fillStyle = COLORS.panel2;
    ctx.fillRect(px, py, PORTRAIT, PORTRAIT);
    if (slot.portrait) {
      ctx.drawImage(slot.portrait, px, py, PORTRAIT, PORTRAIT);
    } else {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `700 28px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', px + PORTRAIT / 2, py + PORTRAIT / 2);
    }
    ctx.restore();

    const tx = px + PORTRAIT + 24;
    const tw = TEAM_CARD_W - tx - 60;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitText(ctx, slot.dollName, tx, y + 36, tw, '700', 26, FONT);
    ctx.fillStyle = COLORS.muted;
    fitText(ctx, slot.weaponName ?? '—', tx, y + 64, tw, '400', 18, FONT);
  });

  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 13px ${FONT}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText(footerNote(), 60, h - 12);
  ctx.globalAlpha = 1;
}

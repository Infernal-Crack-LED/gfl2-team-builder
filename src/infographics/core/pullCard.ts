/**
 * Pull-odds card — what a planned number of accesses is actually worth: three
 * headline tiles over a cumulative copy-odds ladder, one row per dupe tier
 * (V0…V6 on the doll banner, R1…R6 on the weapon one).
 *
 * LANDSCAPE, unlike the build/squad/rec cards: the ladder is the point, and a
 * row is one short line, so the card stays wider than it is tall. Logical
 * width is fixed at 760 like every other card and the height is a pure
 * function of the ROW COUNT — the tier count is known before a canvas exists
 * (it comes from the banner's maxCopies), so nothing here is measured after
 * drawing. The detail paragraph is a fixed two-line clamped box, never a
 * grow-to-fit one.
 *
 * PRESENTATION ONLY: every number arrives pre-formatted. The odds model and
 * the wording of these strings live together in bot/lib/gfl2/pullDisplay.ts,
 * so the card and the /pulls embed can never round or name the same figure
 * differently.
 *
 * Tinted by the BANNER (blue for dolls, amber for weapons) rather than by a
 * doll's element — a pull plan isn't about one unit's phase.
 */
import { fitText, roundRect, wrapText, type Canvas2DLike } from './canvas2d.js';
import { COLORS, FONT, drawBrandMark } from './theme.js';

export const PULL_CARD_W = 760;

const PAD = 36; // card edge → content
const CW = PULL_CARD_W - 2 * PAD; // content width

const HEADER_H = 132;

/** Section top → its group label's baseline / its content's top edge. */
const SEC_LABEL_DROP = 34;
const SEC_CONTENT_DROP = 46;

const TILE_H = 96;
const TILE_GAP = 12;

const ROW_H = 38;
/** Tier chip, then the copy count, then the bar, then the odds column. */
const TIER_CHIP_W = 46;
const TIER_CHIP_H = 26;
const COPIES_COL_X = PAD + TIER_CHIP_W + 12;
const BAR_X = PAD + 180;
const ODDS_COL_W = 86;
const BAR_W = CW - (BAR_X - PAD) - ODDS_COL_W - 14;
const BAR_H = 10;

const META_LINE = 30;

const DETAIL_LINE = 22;
const DETAIL_MAX_LINES = 2;
const DETAIL_PAD = 12;

const FOOTER_H = 26;

/** One headline tile: a big number with a label above and a gloss below. */
export interface PullCardTile {
  label: string;
  value: string;
  sub: string;
  /** The headline tile — drawn in the banner accent with a top rule. */
  main?: boolean;
}

/** One ladder row: a dupe tier and the cumulative chance of reaching it. */
export interface PullCardRow {
  /** Community tier name — 'V3', 'R2'. */
  tier: string;
  /** How many featured copies that tier takes ('4 copies'). */
  copies: string;
  /** The odds, pre-formatted ('63.2%', '<0.1%'). */
  chance: string;
  /** The same odds as a 0–1 number — the bar's fill fraction. */
  p: number;
}

export interface PullCardData {
  title: string;
  subtitle: string;
  /** Banner tint — a CSS hex color (see BANNER_ACCENT in pullDisplay.ts). */
  accent: string;
  tiles: PullCardTile[];
  rows: PullCardRow[];
  /** One shrink-to-fit line of banner facts (worst case, pity, overall rate). */
  meta: string;
  /** Two clamped lines explaining how to read the ladder. */
  detail: string;
  /** Shared site-icon image for the brand mark (opaque to the core). */
  siteIcon?: unknown | null;
}

function oddsHeight(rowCount: number): number {
  return SEC_CONTENT_DROP + rowCount * ROW_H;
}

function detailHeight(): number {
  return 14 + DETAIL_MAX_LINES * DETAIL_LINE + 2 * DETAIL_PAD;
}

/** Total logical card height — discrete data only (see the file header). */
export function pullCardHeight(data: PullCardData): number {
  return (
    HEADER_H +
    TILE_H +
    oddsHeight(data.rows.length) +
    META_LINE +
    detailHeight() +
    FOOTER_H
  );
}

/** Two-fill border (no stroke API — see canvas2d.ts). */
function borderedRoundRect(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  borderWidth = 2
): void {
  ctx.fillStyle = COLORS.border;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(
    ctx,
    x + borderWidth,
    y + borderWidth,
    w - 2 * borderWidth,
    h - 2 * borderWidth,
    r - borderWidth
  );
  ctx.fill();
}

function groupLabel(
  ctx: Canvas2DLike,
  label: string,
  x: number,
  y: number
): void {
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label.toUpperCase(), x, y);
}

function drawTile(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  w: number,
  tile: PullCardTile,
  accent: string
): void {
  borderedRoundRect(ctx, x, y, w, TILE_H, 10, COLORS.panel);
  if (tile.main) {
    ctx.fillStyle = accent;
    ctx.fillRect(x + 10, y, w - 20, 3);
  }

  const tx = x + 16;
  const maxW = w - 32;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.muted;
  fitText(ctx, tile.label.toUpperCase(), tx, y + 26, maxW, '700', 12, FONT);
  ctx.fillStyle = tile.main ? accent : COLORS.text;
  fitText(ctx, tile.value, tx, y + 60, maxW, '700', 30, FONT);
  ctx.fillStyle = COLORS.muted;
  fitText(ctx, tile.sub, tx, y + 82, maxW, '400', 13, FONT);
}

/**
 * One ladder row. The bar is the row's whole reason for existing: the odds
 * collapse fast across seven tiers, and a column of percentages alone hides
 * just how fast — so the number is drawn beside a track it can be read
 * against, not on its own.
 */
function drawRow(
  ctx: Canvas2DLike,
  y: number,
  row: PullCardRow,
  accent: string
): void {
  ctx.fillStyle = accent;
  roundRect(ctx, PAD, y + 4, TIER_CHIP_W, TIER_CHIP_H, 7);
  ctx.fill();
  ctx.fillStyle = COLORS.bg;
  ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(row.tier, PAD + TIER_CHIP_W / 2, y + 4 + TIER_CHIP_H / 2 + 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.muted;
  fitText(
    ctx,
    row.copies,
    COPIES_COL_X,
    y + 23,
    BAR_X - COPIES_COL_X - 12,
    '400',
    14,
    FONT
  );

  ctx.fillStyle = COLORS.panel2;
  roundRect(ctx, BAR_X, y + 12, BAR_W, BAR_H, BAR_H / 2);
  ctx.fill();
  // A hair of fill for any non-zero chance: a tier you *could* hit must not
  // render as an empty track, which reads as impossible.
  if (row.p > 0) {
    ctx.fillStyle = accent;
    roundRect(
      ctx,
      BAR_X,
      y + 12,
      Math.max(3, Math.min(1, row.p) * BAR_W),
      BAR_H,
      BAR_H / 2
    );
    ctx.fill();
  }

  ctx.fillStyle = COLORS.text;
  ctx.font = `700 16px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(row.chance, PAD + CW, y + 23);
  ctx.textAlign = 'left';
}

export function drawPullCard(ctx: Canvas2DLike, data: PullCardData): void {
  const h = pullCardHeight(data);
  const accent = data.accent || COLORS.accent;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, PULL_CARD_W, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, PULL_CARD_W, 6);

  // ---- Header: title, subtitle, brand mark, divider ----
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const markLeft = drawBrandMark(ctx, {
    right: PULL_CARD_W - PAD,
    top: 26,
    icon: data.siteIcon,
  });
  ctx.fillStyle = COLORS.text;
  fitText(ctx, data.title, PAD, 74, markLeft - 20 - PAD, '700', 40, FONT);
  ctx.fillStyle = COLORS.muted;
  fitText(ctx, data.subtitle, PAD, 102, CW, '500', 18, FONT);
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(PAD, HEADER_H - 18, CW, 2);

  // ---- Headline tiles ----
  const tiles = data.tiles;
  const tileW =
    (CW - TILE_GAP * (tiles.length - 1)) / Math.max(1, tiles.length);
  tiles.forEach((tile, i) => {
    drawTile(ctx, PAD + i * (tileW + TILE_GAP), HEADER_H, tileW, tile, accent);
  });

  // ---- Sections, walked with a cursor over the heights the card's total
  //      height was computed from ----
  let y = HEADER_H + TILE_H;

  groupLabel(ctx, 'Cumulative odds', PAD, y + SEC_LABEL_DROP);
  data.rows.forEach((row, i) => {
    drawRow(ctx, y + SEC_CONTENT_DROP + i * ROW_H, row, accent);
  });
  y += oddsHeight(data.rows.length);

  ctx.fillStyle = COLORS.muted;
  fitText(ctx, data.meta, PAD, y + 20, CW, '500', 15, FONT);
  y += META_LINE;

  const panelH = DETAIL_MAX_LINES * DETAIL_LINE + 2 * DETAIL_PAD;
  borderedRoundRect(ctx, PAD, y + 14, CW, panelH, 10, COLORS.panel);
  ctx.fillStyle = COLORS.text;
  ctx.font = `400 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  wrapText(ctx, data.detail, CW - 32, DETAIL_MAX_LINES).forEach((line, i) => {
    ctx.fillText(
      line,
      PAD + 16,
      y + 14 + DETAIL_PAD + (i + 1) * DETAIL_LINE - 6
    );
  });
}

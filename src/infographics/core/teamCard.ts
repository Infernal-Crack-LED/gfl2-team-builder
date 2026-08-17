/**
 * Squad card — the og:image for `/team-builder?b=…` share links.
 *
 * PORTRAIT, one full-width row per doll: the row carries the doll's WHOLE
 * build inline beside her portrait (vertebra, weapon + refinement, fixed-key
 * slots, expansion key, common keys, stat priority), so the card audits the
 * squad instead of just advertising it. The top accent stripe carries one band
 * per doll in her element color, so the squad's elemental spread reads off the
 * card's top edge. Logical width is fixed at 760; height grows with filled slot
 * count (see cardHeight) — a full 4–5 doll squad lands around 3:4, which is the
 * shape this layout is tuned for.
 *
 * ALL row geometry is fixed constants: missing data degrades to a muted "—"
 * in its slot and never reflows or throws, so a half-known build still
 * produces a well-formed row. Rasterized at dpr 2 by node/render.ts.
 */
import { fitText, roundRect, type Canvas2DLike } from './canvas2d.js';
import {
  CARD_WORDMARK,
  COLORS,
  FONT,
  drawBrandMark,
  phaseAccent,
} from './theme.js';

export const TEAM_CARD_W = 760;

const HEADER_H = 128;
const ROW_H = 190;
const FOOTER_H = 38;
/** Vertical space an empty squad's "no dolls" line gets instead of rows. */
const EMPTY_BODY_H = 96;

const PAD = 36; // card edge → row panel
const ROW_INSET = 14; // row panel edge → its content
const PORTRAIT = 128;
const MUTED_PLACEHOLDER = '—';

/** Fixed-key slots a doll can unlock — chips are always drawn 1…6. */
const FIXED_KEY_SLOTS = 6;

/** Content column: everything inline with the portrait starts here. */
const TEXT_X = PAD + ROW_INSET + PORTRAIT + 20;
const TEXT_W = TEAM_CARD_W - PAD - ROW_INSET - TEXT_X;

/**
 * One filled squad slot, resolved to display strings by the node side (and by
 * the HTML preview in web/src/components/TeamCardPreview.tsx — the two must
 * agree, so both build this shape from the same helpers in share/keyLabels.ts).
 */
export interface TeamCardSlot {
  dollName: string;
  weaponName: string | null;
  /** Element, used to tint this doll's band of the top accent stripe. */
  dollPhase?: string | null;
  /** Weapon refinement level 1–6, or null. */
  refinement: number | null;
  /**
   * Active vertebra segments. The builder is single-select, so this is 0 or 1
   * entry; a legacy code carrying several shows the deepest.
   */
  vert: number[];
  /** Unlocked fixed-key slot numbers (1–6); unmatched keys are absent. */
  fixedKeys: number[];
  /** Expansion key short title, or null. */
  expansionKey: string | null;
  /** Common keys, named by their source doll (generics name themselves). */
  commonKeys: string[];
  /** Ordered stat preferences, highest priority first. */
  statPrefs: string[];
  /** Square-cropped portrait canvas (opaque to the core), or null. */
  portrait: unknown | null;
}

/** Total logical card height for `n` filled slots. */
export function cardHeight(n: number): number {
  return HEADER_H + (n === 0 ? EMPTY_BODY_H : ROW_H * n) + FOOTER_H;
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

/**
 * A right-hung pill (V3 / R4). `on` is what distinguishes a real value from an
 * absent one — an unset pill still draws, so the row's right edge keeps its
 * two-pill rhythm whatever the build knows.
 */
function pill(
  ctx: Canvas2DLike,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  on: boolean
): void {
  ctx.fillStyle = on ? COLORS.accent : COLORS.panel2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = on ? COLORS.bg : COLORS.muted;
  ctx.font = `700 ${Math.round(h * 0.52)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** Small-caps field label; returns the x the value should start at. */
function fieldLabel(
  ctx: Canvas2DLike,
  label: string,
  x: number,
  y: number
): number {
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x, y);
  return x + ctx.measureText(label).width + 10;
}

/** `LABEL  value` on one line, the value shrink-fitted into what's left. */
function metaField(
  ctx: Canvas2DLike,
  label: string,
  value: string | null,
  x: number,
  y: number,
  w: number
): void {
  const vx = fieldLabel(ctx, label, x, y);
  ctx.fillStyle = value ? COLORS.text : COLORS.muted;
  fitText(ctx, value ?? MUTED_PLACEHOLDER, vx, y, x + w - vx, '400', 14, FONT);
}

function drawSlotRow(ctx: Canvas2DLike, slot: TeamCardSlot, y: number): void {
  borderedRoundRect(
    ctx,
    PAD,
    y + 5,
    TEAM_CARD_W - 2 * PAD,
    ROW_H - 10,
    12,
    COLORS.panel
  );

  // ---- Portrait, vertically centered in the row ----
  const px = PAD + ROW_INSET;
  const py = y + (ROW_H - PORTRAIT) / 2;
  ctx.fillStyle = COLORS.border;
  roundRect(ctx, px - 2, py - 2, PORTRAIT + 4, PORTRAIT + 4, 14);
  ctx.fill();
  ctx.save();
  roundRect(ctx, px, py, PORTRAIT, PORTRAIT, 12);
  ctx.clip();
  ctx.fillStyle = COLORS.panel2;
  ctx.fillRect(px, py, PORTRAIT, PORTRAIT);
  if (slot.portrait) {
    ctx.drawImage(slot.portrait, px, py, PORTRAIT, PORTRAIT);
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 56px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', px + PORTRAIT / 2, py + PORTRAIT / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // ---- Right-hung pills: vertebra (name line) and refinement (weapon line) ----
  const pillW = 64;
  const pillX = TEXT_X + TEXT_W - pillW;
  // Single-select in the builder; the deepest segment wins if a legacy code
  // carried more than one.
  const vert = slot.vert.length > 0 ? Math.max(...slot.vert) : null;
  pill(
    ctx,
    vert === null ? 'V—' : `V${vert}`,
    pillX,
    y + 24,
    pillW,
    30,
    vert !== null
  );
  pill(
    ctx,
    slot.refinement === null ? 'R—' : `R${slot.refinement}`,
    pillX,
    y + 60,
    pillW,
    28,
    slot.refinement !== null
  );
  // Text on these two lines stops short of the pill gutter.
  const lineW = TEXT_W - pillW - 14;

  // ---- Name + weapon ----
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, slot.dollName, TEXT_X, y + 48, lineW, '700', 26, FONT);
  ctx.fillStyle = slot.weaponName ? COLORS.text : COLORS.muted;
  fitText(
    ctx,
    slot.weaponName ?? MUTED_PLACEHOLDER,
    TEXT_X,
    y + 81,
    lineW,
    '500',
    18,
    FONT
  );

  // ---- Fixed-key slots: chips 1…6, unlocked ones filled ----
  const chipsX = fieldLabel(ctx, 'KEYS', TEXT_X, y + 115);
  const chipW = 38;
  const chipGap = 7;
  for (let n = 1; n <= FIXED_KEY_SLOTS; n++) {
    const cx = chipsX + (n - 1) * (chipW + chipGap);
    const has = slot.fixedKeys.includes(n);
    ctx.fillStyle = has ? COLORS.accent : COLORS.panel2;
    roundRect(ctx, cx, y + 98, chipW, 24, 6);
    ctx.fill();
    ctx.fillStyle = has ? COLORS.bg : COLORS.muted;
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), cx + chipW / 2, y + 98 + 13);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ---- Expansion key, then common keys / stat priority side by side ----
  metaField(ctx, 'EXP', slot.expansionKey, TEXT_X, y + 145, TEXT_W);
  const half = Math.floor(TEXT_W / 2);
  metaField(
    ctx,
    'CK',
    slot.commonKeys.length > 0 ? slot.commonKeys.join(' · ') : null,
    TEXT_X,
    y + 171,
    half - 12
  );
  metaField(
    ctx,
    'STATS',
    slot.statPrefs.length > 0 ? slot.statPrefs.join(' › ') : null,
    TEXT_X + half,
    y + 171,
    TEXT_W - half
  );
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
  // Accent stripe: one equal band per doll, in that doll's element color, so
  // the squad's elemental spread reads off the top edge. An empty squad keeps
  // a single site-accent bar.
  if (slots.length === 0) {
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(0, 0, TEAM_CARD_W, 6);
  } else {
    const band = TEAM_CARD_W / slots.length;
    slots.forEach((slot, i) => {
      ctx.fillStyle = phaseAccent(slot.dollPhase);
      // Last band runs to the edge — float division must not leave a seam.
      const x = Math.round(i * band);
      const end =
        i === slots.length - 1 ? TEAM_CARD_W : Math.round((i + 1) * band);
      ctx.fillRect(x, 0, end - x, 6);
    });
  }

  // Header
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('Squad', PAD, 74);
  drawBrandMark(ctx, { right: TEAM_CARD_W - PAD, top: 26, icon: siteIcon });
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(PAD, HEADER_H - 22, TEAM_CARD_W - 2 * PAD, 2);

  if (slots.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText('Empty squad', PAD, HEADER_H + 40);
  }

  slots.forEach((slot, i) => {
    drawSlotRow(ctx, slot, HEADER_H + i * ROW_H);
  });

  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 0.8;
  ctx.fillText(CARD_WORDMARK, PAD, h - 14);
  ctx.globalAlpha = 1;
}

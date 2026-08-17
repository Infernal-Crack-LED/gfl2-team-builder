/**
 * Squad card — the og:image for `/team-builder?b=…` share links.
 *
 * PORTRAIT, one full-width row per doll: the row carries the doll's WHOLE
 * build inline beside her portrait (vertebra, weapon + refinement, fixed-key
 * slots, expansion key, common keys, stat priority), so the card audits the
 * squad instead of just advertising it. Logical width is fixed at 760; height
 * grows with filled slot count (see cardHeight) — a full 4–5 doll squad lands
 * around 5:8, which is the shape this layout is tuned for.
 *
 * The top stripe is ONE site-accent bar; each doll's element instead tints the
 * left edge of her own row, where it sits next to the doll it describes. Five
 * bands across the top edge told you the squad's spread without telling you
 * whose element was whose.
 *
 * Row geometry is fixed EXCEPT for the expansion-key line, which is omitted
 * outright when the doll has no expansion key — so a row is one of two known
 * heights (see slotHeight). Everything else degrades to a muted "—" in place
 * rather than reflowing. Rasterized at dpr 2 by node/render.ts.
 */
import { fitText, roundRect, type Canvas2DLike } from './canvas2d.js';
import {
  COLORS,
  FONT,
  drawBrandMark,
  drawSlotChips,
  phaseAccent,
} from './theme.js';

export const TEAM_CARD_W = 760;

const HEADER_H = 128;
/** Bottom breathing room. The card is stamped by the brand mark up in the
 *  header, so there is no footer line to leave space for. */
const FOOTER_H = 24;

/** Baseline of a row's FIRST meta line, measured from the row's top. */
const META_TOP = 147;
/** What one meta line costs. */
const META_LINE = 26;
/** Meta lines every row has: COMMON KEYS and STATS. */
const BASE_META_LINES = 2;
/** Last meta baseline → the row panel's bottom edge. */
const META_BOTTOM_PAD = 22;
/** The row panel is inset this far inside the row, top and bottom. */
const PANEL_INSET = 5;
/** Vertical space an empty squad's "no dolls" line gets instead of rows. */
const EMPTY_BODY_H = 96;

const PAD = 36; // card edge → row panel
const ROW_INSET = 14; // row panel edge → its content
const PORTRAIT = 128;
/** Element-tinted left edge of a row, drawn over that side's border. */
const ELEMENT_BAR_W = 6;
const MUTED_PLACEHOLDER = '—';

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
  /** Element, tinting this doll's row along its left edge. */
  dollPhase?: string | null;
  /** Weapon refinement level 1–6, or null. */
  refinement: number | null;
  /**
   * Active vertebra segments. The builder is single-select, so this is 0 or 1
   * entry; a legacy code carrying several shows the deepest.
   */
  vert: number[];
  /** Attachment set bonus name, drawn inline after the weapon, or null. */
  attachmentSet: string | null;
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

/** Meta lines this slot draws — the expansion key's is conditional. */
function metaLineCount(slot: TeamCardSlot): number {
  return BASE_META_LINES + (slot.expansionKey ? 1 : 0);
}

/**
 * How tall one slot's row is. Two values, not a continuum: a doll with no
 * expansion key doesn't get an "EXP. KEY —" line, she gets 26px less row.
 * Derived from the meta block so the gap under the last line (STATS) is the
 * same whichever height the row lands on.
 */
export function slotHeight(slot: TeamCardSlot): number {
  return (
    META_TOP +
    (metaLineCount(slot) - 1) * META_LINE +
    META_BOTTOM_PAD +
    PANEL_INSET
  );
}

/** Total logical card height for a squad. */
export function cardHeight(slots: TeamCardSlot[]): number {
  const body =
    slots.length === 0
      ? EMPTY_BODY_H
      : slots.reduce((h, slot) => h + slotHeight(slot), 0);
  return HEADER_H + body + FOOTER_H;
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

/**
 * Fixed gutter the field labels sit in, so every value in a row starts at the
 * same x — the four lines read as a column, not a ragged left edge.
 *
 * Sized to clear the longest label ("COMMON KEYS") in BOTH renderers: 79px in
 * Roboto here, 87px in the HTML preview's system-font stack, so the gutter has
 * to beat the wider of the two or the preview stops mirroring the PNG. A label
 * that somehow overruns it pushes its own value right rather than drawing
 * underneath it.
 */
const LABEL_GUTTER = 98;

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
  return x + Math.max(LABEL_GUTTER, ctx.measureText(label).width + 10);
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
  const rowH = slotHeight(slot);
  const panelY = y + PANEL_INSET;
  const panelW = TEAM_CARD_W - 2 * PAD;
  const panelH = rowH - 2 * PANEL_INSET;
  borderedRoundRect(ctx, PAD, panelY, panelW, panelH, 12, COLORS.panel);
  // Element bar: the doll's phase color painted over the panel's LEFT border,
  // clipped to the panel so it inherits the rounded corners. Next to the doll
  // it describes, which a shared stripe along the card's top edge is not.
  ctx.save();
  roundRect(ctx, PAD, panelY, panelW, panelH, 12);
  ctx.clip();
  ctx.fillStyle = phaseAccent(slot.dollPhase);
  ctx.fillRect(PAD, panelY, ELEMENT_BAR_W, panelH);
  ctx.restore();

  // ---- Portrait, vertically centered in the row ----
  const px = PAD + ROW_INSET;
  const py = y + (rowH - PORTRAIT) / 2;
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

  // ---- Name, then weapon with the attachment set inline after it ----
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, slot.dollName, TEXT_X, y + 48, lineW, '700', 26, FONT);

  // The set shares the weapon's line, so the weapon's budget is halved up
  // front rather than letting a long gun name leave the set nowhere to go.
  const weaponText = slot.weaponName ?? MUTED_PLACEHOLDER;
  const weaponBudget = slot.attachmentSet ? Math.round(lineW * 0.5) : lineW;
  ctx.fillStyle = slot.weaponName ? COLORS.text : COLORS.muted;
  fitText(ctx, weaponText, TEXT_X, y + 81, weaponBudget, '500', 18, FONT);
  if (slot.attachmentSet) {
    // fitText leaves ctx.font at the size it settled on, so this measures the
    // width actually drawn.
    const sx = TEXT_X + ctx.measureText(weaponText).width + 12;
    ctx.fillStyle = COLORS.muted;
    fitText(
      ctx,
      `· ${slot.attachmentSet}`,
      sx,
      y + 81,
      TEXT_X + lineW - sx,
      '400',
      15,
      FONT
    );
  }

  // ---- Fixed-key slots: a chip per EQUIPPED slot (see drawSlotChips) ----
  const chipsX = fieldLabel(ctx, 'FIXED KEYS', TEXT_X, y + 115);
  drawSlotChips(ctx, slot.fixedKeys, {
    x: chipsX,
    y: y + 98,
    w: 38,
    h: 24,
    gap: 7,
    radius: 6,
    fontSize: 14,
    fill: COLORS.accent,
  });

  // ---- Meta lines, one full-width each: the values are long enough that
  //      sharing a line would shrink both of them to unreadable. The
  //      expansion-key line is ABSENT (not "—") when there's no expansion
  //      key, and the rest stack up into the space — see slotHeight. ----
  const metaLines: [string, string | null][] = [];
  if (slot.expansionKey) {
    metaLines.push(['EXP. KEY', slot.expansionKey]);
  }
  metaLines.push([
    'COMMON KEYS',
    slot.commonKeys.length > 0 ? slot.commonKeys.join(' · ') : null,
  ]);
  metaLines.push([
    'STATS',
    slot.statPrefs.length > 0 ? slot.statPrefs.join(' › ') : null,
  ]);
  metaLines.forEach(([label, value], i) => {
    metaField(ctx, label, value, TEXT_X, y + META_TOP + i * META_LINE, TEXT_W);
  });
}

export function drawTeamCard(
  ctx: Canvas2DLike,
  slots: TeamCardSlot[],
  /** Shared site-icon image for the brand mark (opaque to the core). */
  siteIcon?: unknown | null
): void {
  const h = cardHeight(slots);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, TEAM_CARD_W, h);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, TEAM_CARD_W, 6);

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

  // Rows are two different heights, so each one's top is where the previous
  // one ended rather than a multiple of a constant.
  let rowY = HEADER_H;
  for (const slot of slots) {
    drawSlotRow(ctx, slot, rowY);
    rowY += slotHeight(slot);
  }
}

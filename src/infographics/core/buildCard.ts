/**
 * Per-doll build card — the og:image for `/builder/<slug>?b=…` share links.
 *
 * Logical size 1200×630 (the standard OG card); node/render.ts rasterizes at
 * dpr 2 (2400×1260 physical). ALL geometry is fixed constants: missing data
 * degrades to a muted "—" in its slot and never reflows or throws, so a
 * half-known build still produces a well-formed card.
 *
 * The card is tinted by the doll's ELEMENT (phase): the top stripe and the
 * selected-vertebra chip take `phaseAccent(dollPhase)`, so a Burn doll reads
 * red and a Freeze doll cyan at a glance. The brand mark keeps the site
 * accent — it identifies the site, not the build.
 */
import {
  fitText,
  imageSize,
  roundRect,
  drawContained,
  type Canvas2DLike,
} from './canvas2d.js';
import {
  COLORS,
  FONT,
  drawBrandMark,
  drawSlotChips,
  phaseAccent,
} from './theme.js';

export const BUILD_CARD_W = 1200;
export const BUILD_CARD_H = 630;

/** Plain data struct — the node side resolves ids/urls into this shape. */
export interface BuildCardData {
  dollName: string | null;
  dollClass: string | null;
  dollPhase: string | null;
  dollRarity: string | null;
  weaponName: string | null;
  /** Weapon art, drawn inline with the name (opaque to the core), or null. */
  weaponImage?: unknown | null;
  /** Weapon refinement level 1–6, or null. */
  refinement: number | null;
  /** Attachment set bonus name, drawn inline in the weapon row, or null. */
  attachmentSet: string | null;
  /** Fixed key SLOT numbers (1–6) — cards name the slots, not the titles. */
  fixedKeySlots: number[];
  /** Common keys, labelled by their source doll (see share/keyLabels.ts). */
  commonKeySources: string[];
  /** Expansion key display name, or null when none is equipped. */
  expansionKeyName: string | null;
  /** Active vertebra segments (1-6); only these are drawn. */
  vert: number[];
  /** Ordered stat preference labels (up to 4), or empty. */
  statPrefs: string[];
  /** Square-cropped portrait canvas (opaque to the core), or null. */
  portrait: unknown | null;
  /** Shared site-icon image for the brand mark (opaque to the core), or null. */
  siteIcon?: unknown | null;
}

const MUTED_PLACEHOLDER = '—';

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

/** Row title in the card's element accent; returns the x its value starts at. */
function accentTitle(
  ctx: Canvas2DLike,
  title: string,
  x: number,
  y: number,
  accent: string
): number {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(title, x, y);
  return x + ctx.measureText(title).width + 12;
}

/** Slot numbers 1–6, deduped junk dropped and in ascending order. */
function sortedSlots(slots: number[]): number[] {
  return slots.filter((s) => s >= 1 && s <= 6).sort((a, b) => a - b);
}

/**
 * A "<title> <value>" row inside a group: the title takes the card's element
 * accent, the value the normal text color, so the two read apart without a
 * second font size. The value shrinks to fit rather than overrunning the card.
 */
function labelledRow(
  ctx: Canvas2DLike,
  title: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  accent: string
): void {
  const vx = accentTitle(ctx, title, x, y, accent);
  ctx.fillStyle = COLORS.text;
  fitText(ctx, value, vx, y, maxWidth - (vx - x), '400', 20, FONT);
}

export function drawBuildCard(ctx: Canvas2DLike, data: BuildCardData): void {
  const accent = phaseAccent(data.dollPhase);

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, BUILD_CARD_W, BUILD_CARD_H);
  // Accent stripe along the top, in the doll's element color.
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, BUILD_CARD_W, 6);

  drawBrandMark(ctx, {
    right: BUILD_CARD_W - 40,
    top: 20,
    icon: data.siteIcon,
  });

  // ---- Portrait (left) ----
  const px = 60;
  const py = 95;
  const ps = 440; // square
  // Border backing first (two-fills border — no stroke API).
  ctx.fillStyle = COLORS.border;
  roundRect(ctx, px - 2, py - 2, ps + 4, ps + 4, 18);
  ctx.fill();
  ctx.save();
  roundRect(ctx, px, py, ps, ps, 16);
  ctx.clip();
  ctx.fillStyle = COLORS.panel2;
  ctx.fillRect(px, py, ps, ps);
  if (data.portrait) {
    ctx.drawImage(data.portrait, px, py, ps, ps);
  } else {
    // Placeholder: muted "?" centered, mirroring the site's .portrait-empty.
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 160px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', px + ps / 2, py + ps / 2);
  }
  ctx.restore();

  // ---- Identity block (right column) ----
  const rx = 560;
  const rw = BUILD_CARD_W - rx - 60;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  fitText(
    ctx,
    data.dollName ?? MUTED_PLACEHOLDER,
    rx,
    140,
    rw,
    '700',
    56,
    FONT
  );

  const subtitle = [data.dollClass, data.dollPhase, data.dollRarity]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' · ');
  ctx.fillStyle = COLORS.muted;
  fitText(
    ctx,
    subtitle === '' ? MUTED_PLACEHOLDER : subtitle,
    rx,
    178,
    rw,
    '500',
    22,
    FONT
  );

  // ---- Weapon: art + name + refinement, all on one row ----
  groupLabel(ctx, 'Weapon', rx, 214);
  const wpY = 228;
  const wpH = 80;
  borderedRoundRect(ctx, rx, wpY, rw, wpH, 10, COLORS.panel);
  // Weapon art is a 2:1 banner — a square slot would shrink it to a sliver,
  // so the slot is banner-shaped and the art contain-fits inside it.
  const artW = 104;
  const artH = 56;
  const { w: aw, h: ah } = imageSize(data.weaponImage);
  const hasArt = Boolean(data.weaponImage) && aw > 0 && ah > 0;
  if (hasArt) {
    drawContained(
      ctx,
      data.weaponImage,
      aw,
      ah,
      rx + 14,
      wpY + (wpH - artH) / 2,
      artW,
      artH
    );
  }
  const nameX = rx + (hasArt ? 14 + artW + 14 : 20);
  // The refinement badge and the attachment set are drawn AFTER the name (they
  // hang off its right edge), so the name's budget reserves room for both up
  // front rather than letting a long gun name crowd them off the row.
  const refText = data.refinement ? `R${data.refinement}` : null;
  const rowRight = rx + rw - 20;
  const refBudget = refText ? 60 : 0;
  const setBudget = data.attachmentSet ? 210 : 0;
  ctx.fillStyle = data.weaponName ? COLORS.text : COLORS.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const weaponText = data.weaponName ?? MUTED_PLACEHOLDER;
  fitText(
    ctx,
    weaponText,
    nameX,
    wpY + 49,
    rowRight - refBudget - setBudget - nameX,
    '500',
    24,
    FONT
  );
  // fitText leaves ctx.font at the size it settled on, so measuring here
  // gives the width actually drawn.
  let cursor = nameX + ctx.measureText(weaponText).width;
  if (refText) {
    cursor += 14;
    ctx.fillStyle = accent;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(refText, cursor, wpY + 49);
    cursor += ctx.measureText(refText).width;
  }
  if (data.attachmentSet) {
    cursor += 14;
    ctx.fillStyle = COLORS.muted;
    fitText(
      ctx,
      `· ${data.attachmentSet}`,
      cursor,
      wpY + 49,
      rowRight - cursor,
      '400',
      18,
      FONT
    );
  }

  // ---- Keys: fixed slots as chips, then common sources / expansion key ----
  groupLabel(ctx, 'Keys', rx, 336);
  // Same chip idiom as the vertebrae below and as the squad card's rows: one
  // chip per EQUIPPED slot, nothing for the rest.
  const fixedX = accentTitle(ctx, 'Fixed', rx, 374, accent);
  drawSlotChips(ctx, sortedSlots(data.fixedKeySlots), {
    x: fixedX,
    y: 350,
    w: 44,
    h: 32,
    gap: 8,
    radius: 8,
    fontSize: 18,
    fill: accent,
  });

  const keyRows: [string, string][] = [];
  if (data.commonKeySources.length > 0) {
    keyRows.push(['Common', data.commonKeySources.join(', ')]);
  }
  if (data.expansionKeyName) {
    keyRows.push(['Expansion Key', data.expansionKeyName]);
  }
  keyRows.forEach(([title, value], i) => {
    labelledRow(ctx, title, value, rx, 414 + i * 30, rw, accent);
  });

  // ---- Vertebrae: ONLY the selected segments ----
  groupLabel(ctx, 'Vertebrae', rx, 486);
  drawSlotChips(ctx, sortedSlots(data.vert), {
    x: rx,
    y: 500,
    w: 56,
    h: 36,
    gap: 10,
    radius: 8,
    fontSize: 18,
    fill: accent,
    prefix: 'V',
  });

  // ---- Stats (priority order) ----
  groupLabel(ctx, 'Stats', rx, 576);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (data.statPrefs.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText(MUTED_PLACEHOLDER, rx, 606);
  } else {
    ctx.fillStyle = COLORS.text;
    fitText(ctx, data.statPrefs.join(' > '), rx, 606, rw, '400', 20, FONT);
  }
}

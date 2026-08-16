/**
 * Per-doll build card — the og:image for `/builder/<slug>?b=…` share links.
 *
 * Logical size 1200×630 (the standard OG card); node/render.ts rasterizes at
 * dpr 2 (2400×1260 physical). ALL geometry is fixed constants: missing data
 * degrades to a muted "—" in its slot and never reflows or throws, so a
 * half-known build still produces a well-formed card.
 */
import { fitText, roundRect, wrapText, type Canvas2DLike } from './canvas2d.js';
import { COLORS, FONT, drawBrandMark, footerNote } from './theme.js';

export const BUILD_CARD_W = 1200;
export const BUILD_CARD_H = 630;

/** Plain data struct — the node side resolves ids/urls into this shape. */
export interface BuildCardData {
  dollName: string | null;
  dollClass: string | null;
  dollPhase: string | null;
  dollRarity: string | null;
  weaponName: string | null;
  keyNames: string[]; // up to 6 shown
  vert: number[]; // active vertebra segments (1-6) → "V1 V2 …" chips
  /** Weapon refinement level 1–6, or null. */
  refinement: number | null;
  /** Ordered stat preference labels (up to 4), or empty. */
  statPrefs: string[];
  /** Common key display names (up to 3), or empty. */
  commonKeyNames: string[];
  /** Square-cropped portrait canvas (opaque to the core), or null. */
  portrait: unknown | null;
}

const MUTED_PLACEHOLDER = '—';
const MAX_KEYS_SHOWN = 6;

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

export function drawBuildCard(ctx: Canvas2DLike, data: BuildCardData): void {
  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, BUILD_CARD_W, BUILD_CARD_H);
  // Accent stripe along the top, matching the site's theme-color.
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, BUILD_CARD_W, 6);

  drawBrandMark(ctx, { right: BUILD_CARD_W - 40, top: 34 });

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
    180,
    rw,
    '500',
    22,
    FONT
  );

  // ---- Weapon ----
  groupLabel(ctx, 'Weapon', rx, 250);
  borderedRoundRect(ctx, rx, 266, rw, 64, 10, COLORS.panel);
  ctx.fillStyle = data.weaponName ? COLORS.text : COLORS.muted;
  fitText(
    ctx,
    data.weaponName ?? MUTED_PLACEHOLDER,
    rx + 20,
    306,
    rw - 40,
    '500',
    24,
    FONT
  );

  // ---- Keys (up to 6, one per line) ----
  groupLabel(ctx, 'Keys', rx, 386);
  const keys = data.keyNames.slice(0, MAX_KEYS_SHOWN);
  ctx.font = `400 20px ${FONT}`;
  if (keys.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('None', rx, 416);
  } else {
    ctx.fillStyle = COLORS.text;
    const lines = wrapText(ctx, keys.join('   ·   '), rw, 3);
    lines.forEach((line, i) => {
      ctx.fillText(line, rx, 416 + i * 28);
    });
  }

  // ---- Vertebrae chips (V1..V6; active = accent, inactive = panel2) ----
  groupLabel(ctx, 'Vertebrae', rx, 524);
  const chipY = 540;
  const chipW = 56;
  const chipH = 36;
  for (let seg = 1; seg <= 6; seg++) {
    const cx = rx + (seg - 1) * (chipW + 10);
    const active = data.vert.includes(seg);
    ctx.fillStyle = active ? COLORS.accent : COLORS.panel2;
    roundRect(ctx, cx, chipY, chipW, chipH, 8);
    ctx.fill();
    ctx.fillStyle = active ? COLORS.bg : COLORS.muted;
    ctx.font = `700 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`V${seg}`, cx + chipW / 2, chipY + chipH / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ---- Refinement / Stat Prefs / Common Keys (compact line) ----
  const extras: string[] = [];
  if (data.refinement) {
    extras.push(`Ref: R${data.refinement}`);
  }
  if (data.statPrefs.length > 0) {
    extras.push(`Stats: ${data.statPrefs.join(' > ')}`);
  }
  if (data.commonKeyNames.length > 0) {
    extras.push(`CK: ${data.commonKeyNames.join(', ')}`);
  }
  if (extras.length > 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const line = extras.join('  ·  ');
    ctx.fillText(line, rx, 594);
  }

  // ---- Footer ----
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 13px ${FONT}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText(footerNote(), 60, BUILD_CARD_H - 24);
  ctx.globalAlpha = 1;
}

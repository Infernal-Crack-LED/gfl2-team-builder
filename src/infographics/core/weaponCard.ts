/**
 * Weapon card — the og:image for `/weapons/<slug>` detail pages and the
 * `/weapon` bot command reply.
 *
 * Logical size 1200×630 (standard OG card). Weapons have no element, so the
 * card is tinted with the site accent. Missing data degrades to a muted "—"
 * and never reflows or throws, so a half-known weapon still produces a
 * well-formed card.
 */
import {
  drawContained,
  fitText,
  imageSize,
  roundRect,
  wrapText,
  type Canvas2DLike,
} from './canvas2d.js';
import { COLORS, FONT, drawBrandMark } from './theme.js';

export const WEAPON_CARD_W = 1200;
export const WEAPON_CARD_H = 630;

/** Plain data struct — the node side resolves ids/urls into this shape. */
export interface WeaponCardData {
  name: string | null;
  rarity: string | null;
  weaponType: string | null;
  primaryAttribute: string | null;
  primaryAttributeStat: number | string | null;
  secondaryAttribute: string | null;
  secondaryAttributeStat: number | string | null;
  trait: string | null;
  effect: string | null;
  imprintDollName: string | null;
  imprintDescription: string | null;
  /** Counterpart labels, e.g. ['Elite: X', 'Standard: Y']. */
  counterparts: string[];
  regionTag: string | null;
  /** Weapon art (opaque to the core), or null. */
  weaponImage?: unknown | null;
  /** Shared site-icon image for the brand mark (opaque to the core), or null. */
  siteIcon?: unknown | null;
}

const MUTED_PLACEHOLDER = '—';
const ACCENT = COLORS.accent;

const PAD = 40;
const HEADER_H = 90;

const ART_X = PAD;
const ART_Y = HEADER_H + 20;
const ART_W = 520;
const ART_H = 260;

const INFO_X = ART_X + ART_W + 40;
const INFO_Y = ART_Y;
const INFO_W = WEAPON_CARD_W - INFO_X - PAD;

const TEXT_X = PAD;
const TEXT_Y = ART_Y + ART_H + 30;
const TEXT_W = WEAPON_CARD_W - 2 * PAD;

const BADGE_H = 34;
const BADGE_R = 8;
const LINE_H = 28;
const COUNTER_H = 30;
const COUNTER_R = 6;

function statLine(label: string, attr: string | null, value: unknown): string {
  const v = value == null || value === '' ? '' : ` ${value}`;
  const a = attr ?? MUTED_PLACEHOLDER;
  return `${label}: ${a}${v}`;
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

/** Accent pill badge — text with rounded fill behind it. */
function drawBadge(
  ctx: Canvas2DLike,
  text: string,
  x: number,
  y: number,
  h: number,
  radius: number
): number {
  ctx.font = `700 16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const padX = 14;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = ACCENT;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.fillStyle = COLORS.bg;
  ctx.fillText(text, x + padX, y + h / 2 + 6);
  return w;
}

/** Optional secondary-attribute line. */
function drawStatLine(
  ctx: Canvas2DLike,
  title: string,
  attr: string | null,
  value: unknown,
  x: number,
  y: number,
  maxWidth: number
): void {
  ctx.font = `700 18px ${FONT}`;
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x, y);
  const titleW = ctx.measureText(title).width + 10;
  ctx.fillStyle = COLORS.text;
  fitText(
    ctx,
    statLine('', attr, value),
    x + titleW,
    y,
    maxWidth - titleW,
    '400',
    18,
    FONT
  );
}

function drawPanel(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.fillStyle = COLORS.border;
  roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 14);
  ctx.fill();
  ctx.fillStyle = COLORS.panel;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
}

export function drawWeaponCard(ctx: Canvas2DLike, data: WeaponCardData): void {
  // Background + site-accent stripe.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WEAPON_CARD_W, WEAPON_CARD_H);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, WEAPON_CARD_W, 6);

  // Header: title + brand mark.
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('Weapon', PAD, 68);
  drawBrandMark(ctx, {
    right: WEAPON_CARD_W - PAD,
    top: 26,
    icon: data.siteIcon,
  });
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(PAD, HEADER_H - 5, WEAPON_CARD_W - 2 * PAD, 2);

  // Left: weapon art in a bordered panel.
  drawPanel(ctx, ART_X, ART_Y, ART_W, ART_H);
  const { w: aw, h: ah } = imageSize(data.weaponImage);
  if (data.weaponImage && aw > 0 && ah > 0) {
    // Slight inset so the art doesn't kiss the border.
    drawContained(
      ctx,
      data.weaponImage,
      aw,
      ah,
      ART_X + 12,
      ART_Y + 12,
      ART_W - 24,
      ART_H - 24
    );
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 120px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', ART_X + ART_W / 2, ART_Y + ART_H / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Right: identity + stats.
  const nameY = INFO_Y + 50;
  ctx.fillStyle = COLORS.text;
  fitText(
    ctx,
    data.name ?? MUTED_PLACEHOLDER,
    INFO_X,
    nameY,
    INFO_W,
    '700',
    48,
    FONT
  );

  let badgeX = INFO_X;
  const badgeY = nameY + 24;
  if (data.rarity) {
    badgeX +=
      drawBadge(ctx, data.rarity, badgeX, badgeY, BADGE_H, BADGE_R) + 10;
  }
  if (data.weaponType) {
    drawBadge(ctx, data.weaponType, badgeX, badgeY, BADGE_H, BADGE_R);
  }

  let statY = badgeY + BADGE_H + 28;
  drawStatLine(
    ctx,
    'Primary',
    data.primaryAttribute,
    data.primaryAttributeStat,
    INFO_X,
    statY,
    INFO_W
  );
  statY += LINE_H + 10;
  if (data.secondaryAttribute) {
    drawStatLine(
      ctx,
      'Secondary',
      data.secondaryAttribute,
      data.secondaryAttributeStat,
      INFO_X,
      statY,
      INFO_W
    );
    statY += LINE_H + 10;
  }
  if (data.imprintDollName) {
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = ACCENT;
    ctx.fillText('Imprint', INFO_X, statY);
    const titleW = ctx.measureText('Imprint').width + 10;
    ctx.fillStyle = COLORS.text;
    fitText(
      ctx,
      data.imprintDollName,
      INFO_X + titleW,
      statY,
      INFO_W - titleW,
      '400',
      18,
      FONT
    );
  }

  // Bottom: trait, effect, counterparts.
  let textY = TEXT_Y;
  const maxTraitLines = 2;
  const maxEffectLines = 3;

  groupLabel(ctx, 'Trait', TEXT_X, textY);
  textY += 22;
  const trait = data.trait?.trim() || null;
  if (trait) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `400 17px ${FONT}`;
    const lines = wrapText(ctx, trait, TEXT_W, maxTraitLines);
    lines.forEach((line, i) => {
      ctx.fillText(line, TEXT_X, textY + i * 22);
    });
    textY += Math.max(1, lines.length) * 22 + 8;
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText(MUTED_PLACEHOLDER, TEXT_X, textY);
    textY += 22 + 8;
  }

  groupLabel(ctx, 'Effect', TEXT_X, textY);
  textY += 22;
  const effect = data.effect?.trim() || null;
  if (effect) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `400 17px ${FONT}`;
    const lines = wrapText(ctx, effect, TEXT_W, maxEffectLines);
    lines.forEach((line, i) => {
      ctx.fillText(line, TEXT_X, textY + i * 22);
    });
    textY += Math.max(1, lines.length) * 22 + 12;
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText(MUTED_PLACEHOLDER, TEXT_X, textY);
    textY += 22 + 12;
  }

  // Counterpart chips at the bottom of the text area.
  if (data.counterparts.length > 0) {
    let cx = TEXT_X;
    const cy = Math.min(textY, WEAPON_CARD_H - PAD - COUNTER_H);
    data.counterparts.forEach((label) => {
      ctx.font = `600 14px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const padX = 12;
      const w = ctx.measureText(label).width + padX * 2;
      if (cx + w > TEXT_X + TEXT_W) {
        return;
      }
      ctx.fillStyle = COLORS.panel;
      roundRect(ctx, cx, cy, w, COUNTER_H, COUNTER_R);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(label, cx + padX, cy + COUNTER_H / 2 + 5);
      cx += w + 8;
    });
  }

  // Region tag at the bottom right.
  const region = data.regionTag?.toUpperCase() ?? 'EN';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 13px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`Region: ${region}`, WEAPON_CARD_W - PAD, WEAPON_CARD_H - 20);
  ctx.textAlign = 'left';
}

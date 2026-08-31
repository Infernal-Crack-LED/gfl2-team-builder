/**
 * Recommendation card — a doll's build ADVICE, not a snapshot of one build:
 * the investment order to buy her in (V/R breakpoints), up to three ranked
 * weapon and attachment-set alternatives, the key/stat picks a build card
 * carries, and free-text author notes.
 *
 * PORTRAIT, like the squad card: logical width fixed at 760, height computed
 * by recCardHeight from DISCRETE facts only (list lengths, section presence,
 * the notes line budget) so the HTML preview in
 * web/src/components/RecCardPreview.tsx can compute the identical height
 * without a canvas. Everything else is fixed geometry that degrades to a
 * muted "—" in place. Rasterized at dpr 2 by node/render.ts.
 *
 * Tinted by the doll's element (phase) like the build card: breakpoint chips,
 * key chips, rank numerals and row titles all take `phaseAccent(dollPhase)`.
 */
import {
  drawContained,
  fitText,
  imageSize,
  roundRect,
  wrapText,
  type Canvas2DLike,
} from './canvas2d.js';
import { trimRotation } from '../../share/rotation.js';
import { COLORS, FONT, drawBrandMark, phaseAccent } from './theme.js';

export const REC_CARD_W = 760;

const PAD = 36; // card edge → content
const CW = REC_CARD_W - 2 * PAD; // content width

const HEADER_H = 128;
/** Identity block: portrait beside name/subtitle, below the header. */
const IDENT_TOP = HEADER_H + 14;
const PORTRAIT = 148;

/** Section top → its group label's baseline. */
const SEC_LABEL_DROP = 34;
/** Section top → its content's top edge. */
const SEC_CONTENT_DROP = 46;

const BP_CHIP_W = 60;
const BP_CHIP_H = 34;
const BP_GAP = 8; // chip ↔ separator arrow
const BP_ARROW_W = 12;
/** Fixed-key priority chips are single digits, so they run narrower. */
const KEY_PRIO_CHIP_W = 40;

const WEAPON_ROW_H = 56;
const WEAPON_ROW_GAP = 10;
const SET_LINE = 30;
const KEY_CHIP_H = 32;
const META_LINE = 28;

/**
 * Conditional fixed keys: one row each under the Fixed chips — an OUTLINED
 * slot chip (recommended picks are filled) beside the condition text, which
 * wraps on the same estimated-line contract as the notes panel.
 */
const COND_KEY_LINE = 22;
const COND_KEY_ROW_PAD = 8;
const COND_KEY_CHARS_PER_LINE = 80;
const COND_KEY_MAX_LINES = 2;
/** Row gutter: the "Cond." title column, then the chip, then the text. */
const COND_CHIP_X = 64;
const COND_CHIP_W = 28;
const COND_CHIP_H = 24;
const COND_TEXT_X = COND_CHIP_X + COND_CHIP_W + 10;

/**
 * Rotation section: one COLUMN per variant beside a shared T1..T7 gutter —
 * a header line (vertebrae range), a fixed two-line condition block when any
 * variant has one, the turn grid, then each variant's notes as muted lines.
 */
const ROT_HEAD_LINE = 30;
/** Condition lines are a FIXED two-line budget whenever any variant has a
 * condition — a per-variant wrap estimate would need font metrics. */
const ROT_COND_LINE = 18;
const ROT_COND_LINES = 2;
const ROT_TURN_LINE = 28;
/** Width of the shared T1..T7 label gutter. */
const ROT_GUTTER = 34;
const ROT_NOTES_LINE = 24;
const ROT_NOTES_PAD = 8;
/** Same estimated-wrap contract as the notes panel (see NOTES_CHARS_PER_LINE). */
const ROT_NOTES_CHARS_PER_LINE = 74;
export const ROT_NOTES_MAX_LINES = 4;

const NOTES_LINE = 24;
const NOTES_PAD = 12; // panel padding above the first / below the last line
/**
 * The notes panel's height comes from an ESTIMATED line count — a pure
 * function of the note's length, so both renderers agree on the card's height
 * without sharing font metrics. The canvas wraps for real and ellipsizes past
 * the estimate; the HTML preview line-clamps at the same count.
 */
const NOTES_CHARS_PER_LINE = 70;
export const NOTES_MAX_LINES = 5;

const FOOTER_H = 28;
const MUTED_PLACEHOLDER = '—';

/** One recommended weapon, resolved to a name (+ optional banner art). */
export interface RecCardWeapon {
  name: string;
  /** Weapon art (opaque to the core), or null. */
  image: unknown | null;
}

/** One conditional fixed key: the slot it fills and when to take it. */
export interface RecCardConditionalKey {
  /** Slot number 1–6 (cards name slots, not titles). */
  slot: number;
  /** When to take the key, or null (drawn as a muted dash). */
  condition: string | null;
}

/** One recommended rotation variant with its context, as parsed from the
 * sheet (or hand-composed in the card creator) — a column on the card. */
export interface RecCardRotation {
  /** Vertebrae range the variant applies to, e.g. 'V2 - V6', or null. */
  vertebrae: string | null;
  /** Condition suffix, e.g. 'with Expansion Key', or null. */
  condition: string | null;
  /** Turn 1..7 skill entries; empty/null = no action that turn. */
  turns: (string | null)[];
  /** Author notes for this variant, or null. */
  notes: string | null;
}

/** Plain data struct — the node side resolves ids/urls into this shape. */
export interface RecCardData {
  dollName: string | null;
  dollClass: string | null;
  dollPhase: string | null;
  dollRarity: string | null;
  /** Ordered investment breakpoints ('V0'…'V6' / 'R1'…'R6'), best-first. */
  breakpoints: string[];
  /** The optimal investment point ('V3R1', 'V6', 'R6'…), or null. */
  optimal: string | null;
  /** Recommended weapons, best first (up to 3). */
  weapons: RecCardWeapon[];
  /** Recommended attachment set names, best first (up to 3). */
  attachmentSets: string[];
  /** Fixed key SLOT numbers (1–6) — cards name the slots, not the titles. */
  fixedKeySlots: number[];
  /** Conditional fixed keys, drawn one row each under the Fixed chips. */
  conditionalKeys?: RecCardConditionalKey[];
  /** Expansion key display name, or null when none is picked. */
  expansionKeyName: string | null;
  /** Common keys, labelled by their source doll (see share/keyLabels.ts). */
  commonKeySources: string[];
  /** Ordered stat preference labels (up to 4), or empty. */
  statPrefs: string[];
  /** Free-text author notes, or null — the section is omitted when null. */
  notes: string | null;
  /** Recommended rotation variants, one column each — the section is
   * omitted when absent / all-empty. */
  rotations?: RecCardRotation[] | null;
  /** Untouched sheet default — draws the attribution footer with icon. */
  official?: boolean;
  /** Untouched Gunsmoke rotation/fixed-key defaults — draws that credit. */
  gunsmoke?: boolean;
  /** Square-cropped portrait canvas (opaque to the core), or null. */
  portrait: unknown | null;
  /** Shared site-icon image for the brand mark (opaque to the core). */
  siteIcon?: unknown | null;
}

/** Deterministic line budget for the notes panel (see NOTES_CHARS_PER_LINE). */
export function notesLineCount(notes: string): number {
  return Math.min(
    NOTES_MAX_LINES,
    Math.max(1, Math.ceil(notes.length / NOTES_CHARS_PER_LINE))
  );
}

/**
 * Per-section heights, discrete-data only — the sum IS the card's layout, so
 * drawRecCard walks these same numbers with a cursor.
 */
function roadmapHeight(): number {
  return SEC_CONTENT_DROP + BP_CHIP_H;
}

function weaponsHeight(data: RecCardData): number {
  const n = Math.max(1, data.weapons.length);
  return SEC_CONTENT_DROP + n * WEAPON_ROW_H + (n - 1) * WEAPON_ROW_GAP;
}

function setsHeight(data: RecCardData): number {
  return SEC_CONTENT_DROP + Math.max(1, data.attachmentSets.length) * SET_LINE;
}

/** Line budget for one conditional key's condition text — see the notes
 * panel's NOTES_CHARS_PER_LINE for the estimated-wrap contract. */
export function condKeyLineCount(condition: string | null): number {
  if (!condition) {
    return 1;
  }
  return Math.min(
    COND_KEY_MAX_LINES,
    Math.max(1, Math.ceil(condition.length / COND_KEY_CHARS_PER_LINE))
  );
}

/** What the conditional-key rows add to the Keys section. */
function condKeysHeight(data: RecCardData): number {
  return (data.conditionalKeys ?? []).reduce(
    (h, ck) =>
      h + COND_KEY_ROW_PAD + condKeyLineCount(ck.condition) * COND_KEY_LINE,
    0
  );
}

function keysHeight(data: RecCardData): number {
  return (
    SEC_CONTENT_DROP +
    KEY_CHIP_H +
    condKeysHeight(data) +
    (data.expansionKeyName ? META_LINE : 0) +
    (data.commonKeySources.length > 0 ? META_LINE : 0)
  );
}

function statsHeight(): number {
  return SEC_CONTENT_DROP + META_LINE;
}

/** Deterministic line budget for rotation notes — mirrors notesLineCount. */
export function rotationNotesLineCount(notes: string): number {
  return Math.min(
    ROT_NOTES_MAX_LINES,
    Math.max(1, Math.ceil(notes.length / ROT_NOTES_CHARS_PER_LINE))
  );
}

/** The variants the section draws: those with at least one filled turn. */
function visibleRotations(data: RecCardData): RecCardRotation[] {
  return (data.rotations ?? []).filter((r) => trimRotation(r.turns).length > 0);
}

/** A variant's column header: its vertebrae range, or its 1-based index. */
function rotationHeader(r: RecCardRotation, i: number): string {
  return r.vertebrae ?? `#${i + 1}`;
}

/** A variant's notes line, prefixed by its column header when the card has
 * several columns to tie the note back to. */
function rotationNoteText(
  r: RecCardRotation,
  i: number,
  count: number
): string {
  return count > 1
    ? `${rotationHeader(r, i)}: ${r.notes ?? ''}`
    : (r.notes ?? '');
}

function rotationHeight(data: RecCardData): number {
  const rots = visibleRotations(data);
  if (rots.length === 0) {
    return 0;
  }
  const anyCond = rots.some((r) => r.condition);
  const maxTurns = Math.max(...rots.map((r) => trimRotation(r.turns).length));
  const notesH = rots.reduce(
    (h, r, i) =>
      r.notes
        ? h +
          rotationNotesLineCount(rotationNoteText(r, i, rots.length)) *
            ROT_NOTES_LINE
        : h,
    0
  );
  return (
    SEC_CONTENT_DROP +
    ROT_HEAD_LINE +
    (anyCond ? ROT_COND_LINES * ROT_COND_LINE : 0) +
    maxTurns * ROT_TURN_LINE +
    (notesH > 0 ? notesH + ROT_NOTES_PAD : 0)
  );
}

function attributionHeight(data: RecCardData): number {
  return (data.official ? 30 : 0) + (data.gunsmoke ? 30 : 0);
}

function notesHeight(data: RecCardData): number {
  if (!data.notes) {
    return 0;
  }
  return (
    SEC_CONTENT_DROP + notesLineCount(data.notes) * NOTES_LINE + 2 * NOTES_PAD
  );
}

/** Total logical card height — mirrored by RecCardPreview's copy. */
export function recCardHeight(data: RecCardData): number {
  return (
    IDENT_TOP +
    PORTRAIT +
    roadmapHeight() +
    weaponsHeight(data) +
    setsHeight(data) +
    keysHeight(data) +
    statsHeight() +
    rotationHeight(data) +
    notesHeight(data) +
    attributionHeight(data) +
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
  ctx.font = `700 18px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(title, x, y);
  return x + ctx.measureText(title).width + 12;
}

function mutedDash(ctx: Canvas2DLike, x: number, y: number): void {
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 18px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(MUTED_PLACEHOLDER, x, y);
}

/**
 * A PRIORITY chip run — accent chips in the order given, '›' separators
 * between them. The shared idiom for "do these, in this order": investment
 * breakpoints and fixed-key unlock order both draw through here, unlike the
 * build/squad cards' drawSlotChips, whose chips are a set, not a sequence.
 */
function drawPriorityChips(
  ctx: Canvas2DLike,
  tokens: string[],
  x: number,
  y: number,
  accent: string,
  chipW: number,
  chipH: number
): void {
  if (tokens.length === 0) {
    mutedDash(ctx, x, y + chipH / 2 + 6);
    return;
  }
  let cx = x;
  tokens.forEach((token, i) => {
    if (i > 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('›', cx + BP_GAP + BP_ARROW_W / 2, y + chipH / 2 + 1);
      cx += BP_GAP + BP_ARROW_W + BP_GAP;
    }
    ctx.fillStyle = accent;
    roundRect(ctx, cx, y, chipW, chipH, 8);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.font = `700 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(token, cx + chipW / 2, y + chipH / 2 + 1);
    cx += chipW;
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function drawRecCard(ctx: Canvas2DLike, data: RecCardData): void {
  const accent = phaseAccent(data.dollPhase);
  const h = recCardHeight(data);

  // Background + element accent stripe.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, REC_CARD_W, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, REC_CARD_W, 6);

  // ---- Header: title, brand mark, divider (squad-card geometry) ----
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('Recommendation', PAD, 74);
  drawBrandMark(ctx, { right: REC_CARD_W - PAD, top: 26, icon: data.siteIcon });
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(PAD, HEADER_H - 22, CW, 2);

  // ---- Identity: portrait + name + subtitle ----
  ctx.fillStyle = COLORS.border;
  roundRect(ctx, PAD - 2, IDENT_TOP - 2, PORTRAIT + 4, PORTRAIT + 4, 14);
  ctx.fill();
  ctx.save();
  roundRect(ctx, PAD, IDENT_TOP, PORTRAIT, PORTRAIT, 12);
  ctx.clip();
  ctx.fillStyle = COLORS.panel2;
  ctx.fillRect(PAD, IDENT_TOP, PORTRAIT, PORTRAIT);
  if (data.portrait) {
    ctx.drawImage(data.portrait, PAD, IDENT_TOP, PORTRAIT, PORTRAIT);
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', PAD + PORTRAIT / 2, IDENT_TOP + PORTRAIT / 2);
  }
  ctx.restore();

  const nameX = PAD + PORTRAIT + 22;
  const nameW = REC_CARD_W - PAD - nameX;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  fitText(
    ctx,
    data.dollName ?? MUTED_PLACEHOLDER,
    nameX,
    IDENT_TOP + 56,
    nameW,
    '700',
    40,
    FONT
  );
  const subtitle = [data.dollClass, data.dollPhase, data.dollRarity]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' · ');
  ctx.fillStyle = COLORS.muted;
  fitText(
    ctx,
    subtitle === '' ? MUTED_PLACEHOLDER : subtitle,
    nameX,
    IDENT_TOP + 90,
    nameW,
    '500',
    20,
    FONT
  );

  // The optimal investment point, as an accent pill under the subtitle — the
  // card's single most actionable number, so it lives up with the identity
  // rather than down in a section.
  if (data.optimal) {
    const label = `Optimal ${data.optimal}`;
    ctx.font = `700 18px ${FONT}`;
    const pillW = ctx.measureText(label).width + 32;
    ctx.fillStyle = accent;
    roundRect(ctx, nameX, IDENT_TOP + 108, pillW, 34, 17);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, nameX + pillW / 2, IDENT_TOP + 108 + 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ---- Sections, walked with a cursor over the same heights the card's
  //      total height was computed from ----
  let y = IDENT_TOP + PORTRAIT;

  // Investment roadmap: the ordered V/R breakpoints.
  groupLabel(ctx, 'Investment roadmap', PAD, y + SEC_LABEL_DROP);
  drawPriorityChips(
    ctx,
    data.breakpoints,
    PAD,
    y + SEC_CONTENT_DROP,
    accent,
    BP_CHIP_W,
    BP_CHIP_H
  );
  y += roadmapHeight();

  // Weapons: one bordered row per recommendation, rank numeral first.
  groupLabel(ctx, 'Weapons', PAD, y + SEC_LABEL_DROP);
  if (data.weapons.length === 0) {
    mutedDash(ctx, PAD, y + SEC_CONTENT_DROP + WEAPON_ROW_H / 2 + 6);
  }
  data.weapons.forEach((weapon, i) => {
    const rowY = y + SEC_CONTENT_DROP + i * (WEAPON_ROW_H + WEAPON_ROW_GAP);
    borderedRoundRect(ctx, PAD, rowY, CW, WEAPON_ROW_H, 10, COLORS.panel);
    ctx.fillStyle = accent;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(i + 1), PAD + 18, rowY + 36);
    // Banner-shaped slot for the 2:1 weapon art, as on the build card.
    const artW = 84;
    const artH = 44;
    const artX = PAD + 44;
    const { w: aw, h: ah } = imageSize(weapon.image);
    const hasArt = Boolean(weapon.image) && aw > 0 && ah > 0;
    if (hasArt) {
      drawContained(
        ctx,
        weapon.image,
        aw,
        ah,
        artX,
        rowY + (WEAPON_ROW_H - artH) / 2,
        artW,
        artH
      );
    }
    const wNameX = hasArt ? artX + artW + 14 : artX;
    ctx.fillStyle = COLORS.text;
    fitText(
      ctx,
      weapon.name,
      wNameX,
      rowY + 36,
      PAD + CW - 18 - wNameX,
      '500',
      20,
      FONT
    );
  });
  y += weaponsHeight(data);

  // Attachment sets: one ranked line each.
  groupLabel(ctx, 'Attachment sets', PAD, y + SEC_LABEL_DROP);
  if (data.attachmentSets.length === 0) {
    mutedDash(ctx, PAD, y + SEC_CONTENT_DROP + 22);
  }
  data.attachmentSets.forEach((set, i) => {
    const lineY = y + SEC_CONTENT_DROP + i * SET_LINE + 22;
    ctx.fillStyle = accent;
    ctx.font = `700 18px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${i + 1}`, PAD, lineY);
    ctx.fillStyle = COLORS.text;
    fitText(ctx, set, PAD + 26, lineY, CW - 26, '400', 18, FONT);
  });
  y += setsHeight(data);

  // Keys: PRIORITY chips (unlock order, not sorted slots) for the fixed
  // keys; conditional rows, then expansion / common lines, only when
  // present. Common keys carry the same '›' priority styling as stats.
  groupLabel(ctx, 'Keys', PAD, y + SEC_LABEL_DROP);
  const chipsX = accentTitle(
    ctx,
    'Fixed',
    PAD,
    y + SEC_CONTENT_DROP + 22,
    accent
  );
  drawPriorityChips(
    ctx,
    data.fixedKeySlots.filter((s) => s >= 1 && s <= 6).map(String),
    chipsX,
    y + SEC_CONTENT_DROP,
    accent,
    KEY_PRIO_CHIP_W,
    KEY_CHIP_H
  );

  // Conditional keys: an OUTLINED slot chip (the filled chips above are the
  // recommended picks) beside the sheet's condition text, one row each.
  let condY = y + SEC_CONTENT_DROP + KEY_CHIP_H;
  for (const [i, ck] of (data.conditionalKeys ?? []).entries()) {
    const rowTop = condY + COND_KEY_ROW_PAD;
    if (i === 0) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 16px ${FONT}`;
      ctx.fillStyle = accent;
      ctx.fillText('Cond.', PAD, rowTop + 17);
    }
    // Outlined chip: accent border (two-fill, no stroke API), accent digit.
    ctx.fillStyle = accent;
    roundRect(ctx, PAD + COND_CHIP_X, rowTop, COND_CHIP_W, COND_CHIP_H, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    roundRect(
      ctx,
      PAD + COND_CHIP_X + 2,
      rowTop + 2,
      COND_CHIP_W - 4,
      COND_CHIP_H - 4,
      4
    );
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      String(ck.slot),
      PAD + COND_CHIP_X + COND_CHIP_W / 2,
      rowTop + COND_CHIP_H / 2 + 1
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const lines = condKeyLineCount(ck.condition);
    if (ck.condition) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `400 14px ${FONT}`;
      const wrapped = wrapText(ctx, ck.condition, CW - COND_TEXT_X, lines);
      wrapped.forEach((line, j) => {
        ctx.fillText(
          line,
          PAD + COND_TEXT_X,
          rowTop + (j + 1) * COND_KEY_LINE - 6
        );
      });
    } else {
      mutedDash(ctx, PAD + COND_TEXT_X, rowTop + COND_KEY_LINE - 6);
    }
    condY = rowTop + lines * COND_KEY_LINE;
  }

  let keyLineY = y + SEC_CONTENT_DROP + KEY_CHIP_H + condKeysHeight(data) + 20;
  if (data.expansionKeyName) {
    const vx = accentTitle(ctx, 'Expansion', PAD, keyLineY, accent);
    ctx.fillStyle = COLORS.text;
    fitText(
      ctx,
      data.expansionKeyName,
      vx,
      keyLineY,
      PAD + CW - vx,
      '400',
      18,
      FONT
    );
    keyLineY += META_LINE;
  }
  if (data.commonKeySources.length > 0) {
    const vx = accentTitle(ctx, 'Common', PAD, keyLineY, accent);
    ctx.fillStyle = COLORS.text;
    fitText(
      ctx,
      data.commonKeySources.join(' › '),
      vx,
      keyLineY,
      PAD + CW - vx,
      '400',
      18,
      FONT
    );
  }
  y += keysHeight(data);

  // Stats (priority order).
  groupLabel(ctx, 'Stats', PAD, y + SEC_LABEL_DROP);
  if (data.statPrefs.length === 0) {
    mutedDash(ctx, PAD, y + SEC_CONTENT_DROP + 20);
  } else {
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitText(
      ctx,
      data.statPrefs.join(' > '),
      PAD,
      y + SEC_CONTENT_DROP + 20,
      CW,
      '400',
      18,
      FONT
    );
  }
  y += statsHeight();

  // Rotations: one column per variant beside a shared T1..T7 gutter — the
  // vertebrae range heads each column, conditions get a fixed two-line block,
  // then each variant's notes as muted lines. All heights discrete — see
  // rotationHeight.
  const rots = visibleRotations(data);
  if (rots.length > 0) {
    groupLabel(
      ctx,
      rots.length > 1 ? 'Rotations' : 'Rotation',
      PAD,
      y + SEC_LABEL_DROP
    );
    const colW = (CW - ROT_GUTTER) / rots.length;
    const colX = (i: number): number => PAD + ROT_GUTTER + i * colW;
    let ry = y + SEC_CONTENT_DROP;

    // Header line: the vertebrae range each column applies to.
    rots.forEach((r, i) => {
      ctx.fillStyle = accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      fitText(
        ctx,
        rotationHeader(r, i),
        colX(i),
        ry + 20,
        colW - 10,
        '700',
        16,
        FONT
      );
    });
    ry += ROT_HEAD_LINE;

    // Condition block: fixed two-line budget whenever any column has one.
    if (rots.some((r) => r.condition)) {
      rots.forEach((r, i) => {
        if (!r.condition) {
          return;
        }
        ctx.fillStyle = COLORS.muted;
        ctx.font = `400 13px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const wrapped = wrapText(ctx, r.condition, colW - 10, ROT_COND_LINES);
        wrapped.forEach((line, j) => {
          ctx.fillText(line, colX(i), ry + 13 + j * ROT_COND_LINE);
        });
      });
      ry += ROT_COND_LINES * ROT_COND_LINE;
    }

    // Turn grid: shared T labels in the gutter, one cell per column.
    const turnsByCol = rots.map((r) => trimRotation(r.turns));
    const maxTurns = Math.max(...turnsByCol.map((t) => t.length));
    for (let t = 0; t < maxTurns; t++) {
      ctx.fillStyle = accent;
      ctx.font = `700 14px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`T${t + 1}`, PAD, ry + 19);
      turnsByCol.forEach((turns, i) => {
        if (t >= turns.length) {
          return; // this variant ends earlier — blank, not a dash
        }
        const turn = (turns[t] as string).trim();
        // An interior empty turn is a real "no action" — a muted dash.
        ctx.fillStyle = turn === '' ? COLORS.muted : COLORS.text;
        fitText(
          ctx,
          turn === '' ? MUTED_PLACEHOLDER : turn,
          colX(i),
          ry + 19,
          colW - 10,
          '400',
          15,
          FONT
        );
      });
      ry += ROT_TURN_LINE;
    }

    // Notes, one muted block per variant that has them, header-prefixed so
    // they read back to their column.
    if (rots.some((r) => r.notes)) {
      ry += ROT_NOTES_PAD;
      rots.forEach((r, i) => {
        if (!r.notes) {
          return;
        }
        const text = rotationNoteText(r, i, rots.length);
        const lines = rotationNotesLineCount(text);
        ctx.fillStyle = COLORS.muted;
        ctx.font = `400 15px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const wrapped = wrapText(ctx, text, CW, lines);
        wrapped.forEach((line, j) => {
          ctx.fillText(line, PAD, ry + (j + 1) * ROT_NOTES_LINE - 7);
        });
        ry += lines * ROT_NOTES_LINE;
      });
    }
  }
  y += rotationHeight(data);

  // Notes: a panel of wrapped free text, height budgeted by notesLineCount.
  if (data.notes) {
    groupLabel(ctx, 'Notes', PAD, y + SEC_LABEL_DROP);
    const lines = notesLineCount(data.notes);
    const panelH = lines * NOTES_LINE + 2 * NOTES_PAD;
    borderedRoundRect(
      ctx,
      PAD,
      y + SEC_CONTENT_DROP,
      CW,
      panelH,
      10,
      COLORS.panel
    );
    ctx.fillStyle = COLORS.text;
    ctx.font = `400 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const wrapped = wrapText(ctx, data.notes, CW - 2 * 16, lines);
    wrapped.forEach((line, i) => {
      ctx.fillText(
        line,
        PAD + 16,
        y + SEC_CONTENT_DROP + NOTES_PAD + (i + 1) * NOTES_LINE - 7
      );
    });
  }

  // Attribution footer — ONLY on untouched sheet defaults, one line per
  // source sheet. The little sheet glyph is drawn inline (green rounded rect
  // + white grid), no external asset.
  const credits: string[] = [];
  if (data.official) {
    credits.push('Recommendation from GFL2 Official Release Info Compilation');
  }
  if (data.gunsmoke) {
    credits.push(
      'Recommended Rotation and Fixed Keys from GFL2 EN Gunsmoke Frontline Doll Info sheet'
    );
  }
  credits.forEach((credit, i) => {
    // Lines stack up from the footer, 30px apart — see attributionHeight.
    const fy = h - FOOTER_H - 6 - (credits.length - 1 - i) * 30;
    const icon = 16;
    ctx.fillStyle = '#21a463';
    roundRect(ctx, PAD, fy - icon + 3, icon, icon, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    const gx = PAD + 3.5;
    const gy = fy - icon + 6.5;
    ctx.fillRect(gx, gy, 9, 9);
    ctx.fillStyle = '#21a463';
    ctx.fillRect(gx, gy + 2.8, 9, 1.4);
    ctx.fillRect(gx, gy + 5.9, 9, 1.4);
    ctx.fillRect(gx + 3.8, gy, 1.4, 9);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitText(ctx, credit, PAD + icon + 8, fy, CW - icon - 8, '400', 14, FONT);
  });
}

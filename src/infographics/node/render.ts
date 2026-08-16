/**
 * THE ONLY node entry point for infographics. Server code imports from here
 * (and ONLY here) so the fonts-before-draw invariant is structurally
 * enforced: './fonts.js' is the FIRST import — an unregistered font renders
 * blank SILENTLY, so registration must precede any canvas creation.
 */
import './fonts.js';

import { createCanvas } from '@napi-rs/canvas';
import type { Canvas2DLike } from '../core/canvas2d.js';
import {
  BUILD_CARD_H,
  BUILD_CARD_W,
  drawBuildCard,
  type BuildCardData,
} from '../core/buildCard.js';
import {
  TEAM_CARD_W,
  cardHeight,
  drawTeamCard,
  type TeamCardSlot,
} from '../core/teamCard.js';
import { FONT } from '../core/theme.js';

export { createCanvas };
export * from '../core/canvas2d.js';
export * from '../core/theme.js';
export * from '../core/buildCard.js';
export * from '../core/teamCard.js';

const DPR = 2;

/**
 * Proof (not trust) that the Roboto family is live: measureText must report
 * a non-zero advance AND a drawn glyph must put actual ink on pixels. A
 * fallback face could still measure > 0; the ink check catches it.
 */
export function assertFontsLive(): void {
  const cv = createCanvas(64, 32);
  const ctx = cv.getContext('2d');
  ctx.font = `700 24px ${FONT}`;
  if (ctx.measureText('Ag').width <= 0) {
    throw new Error('[infographics] Roboto measures zero width — fonts not registered');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Ag', 2, 26);
  const { data } = ctx.getImageData(0, 0, 64, 32);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) {
      return;
    }
  }
  throw new Error('[infographics] Roboto draws no ink — fonts not registered');
}

interface ScaledContext {
  scale(x: number, y: number): void;
}

function makeCard(w: number, h: number) {
  const canvas = createCanvas(w * DPR, h * DPR);
  const ctx = canvas.getContext('2d');
  // Draw in LOGICAL coordinates; physical pixels are w*2 × h*2.
  (ctx as unknown as ScaledContext).scale(DPR, DPR);
  return { canvas, ctx: ctx as unknown as Canvas2DLike };
}

export async function renderBuildCardPng(data: BuildCardData): Promise<Buffer> {
  assertFontsLive();
  const { canvas, ctx } = makeCard(BUILD_CARD_W, BUILD_CARD_H);
  drawBuildCard(ctx, data);
  return canvas.encode('png');
}

export async function renderTeamCardPng(slots: TeamCardSlot[]): Promise<Buffer> {
  assertFontsLive();
  const { canvas, ctx } = makeCard(TEAM_CARD_W, cardHeight(slots.length));
  drawTeamCard(ctx, slots);
  return canvas.encode('png');
}

/**
 * Regenerate web/public/og.png — the site's static social-preview card
 * (1200×630, referenced by the og:image / twitter:image tags in
 * web/index.html).
 *
 *   npx tsx src/bin/render-og.ts
 *
 * Drawn through the SAME infographics stack the share cards use, so the
 * preview a link unfurls into is the same visual language as the cards the
 * site hands out: bg + accent stripe, Roboto, and the mandatory brand mark
 * from core/theme.ts. Re-run it whenever the palette, the site name, or the
 * icon changes.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '../infographics/node/render.js';
import { loadSiteIcon } from '../infographics/node/icon.js';
import { COLORS, FONT, drawBrandMark } from '../infographics/core/theme.js';
import type { Canvas2DLike } from '../infographics/core/canvas2d.js';

const W = 1200;
const H = 630;
const DPR = 2;

const TITLE = 'GFL2 Team Builder';
const SUBTITLE = "Girls' Frontline 2: Exilium squad planner";
const BULLETS = [
  'Every doll’s kit, skills, keys and vertebrae',
  'Weapon traits, effects and imprint stats',
  'Visual team builder with shareable squad cards',
];

async function main(): Promise<void> {
  const canvas = createCanvas(W * DPR, H * DPR);
  const raw = canvas.getContext('2d');
  (raw as unknown as { scale(x: number, y: number): void }).scale(DPR, DPR);
  const ctx = raw as unknown as Canvas2DLike;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, W, 8);

  drawBrandMark(ctx, { right: W - 48, top: 28, icon: await loadSiteIcon() });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = COLORS.text;
  ctx.font = `700 82px ${FONT}`;
  ctx.fillText(TITLE, 72, 270);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(SUBTITLE, 72, 330);

  ctx.font = `400 26px ${FONT}`;
  BULLETS.forEach((line, i) => {
    const y = 420 + i * 46;
    ctx.fillStyle = COLORS.accent;
    ctx.fillText('•', 72, y);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(line, 100, y);
  });

  const out = path.resolve('web/public/og.png');
  writeFileSync(out, await canvas.encode('png'));
  console.log(`wrote ${out} (${W}×${H} @${DPR}x)`);
}

await main();

/**
 * Render smoke test: draw BOTH cards onto a real @napi-rs/canvas context
 * (null portrait → placeholder path) and assert the title region contains
 * actual ink, i.e. fonts are registered and the draw code runs end-to-end.
 *
 * GATED on the font files existing: without
 * src/infographics/assets/fonts/*.ttf, node/fonts.ts throws at import time —
 * skip rather than fail in that environment (e.g. a fresh checkout before
 * fonts are copied in).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FONT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'assets/fonts'
);
const FONTS_PRESENT = [
  'Roboto-Regular.ttf',
  'Roboto-Medium.ttf',
  'Roboto-Bold.ttf',
].every((f) => existsSync(path.join(FONT_DIR, f)));

/** Count pixels brighter than `threshold` in a region (bg is #101216). */
function inkInRegion(
  ctx: {
    getImageData(
      x: number,
      y: number,
      w: number,
      h: number
    ): { data: Uint8ClampedArray };
  },
  x: number,
  y: number,
  w: number,
  h: number,
  threshold = 150
): number {
  const { data } = ctx.getImageData(x, y, w, h);
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] ?? 0) > threshold && (data[i + 3] ?? 0) > 0) {
      ink += 1;
    }
  }
  return ink;
}

describe.skipIf(!FONTS_PRESENT)('card renderers (fonts present)', () => {
  it('build card renders with ink in the doll-name region', async () => {
    const { createCanvas, drawBuildCard, BUILD_CARD_W, BUILD_CARD_H } =
      await import('./node/render.js');
    const canvas = createCanvas(BUILD_CARD_W, BUILD_CARD_H);
    const ctx = canvas.getContext('2d');
    drawBuildCard(ctx as never, {
      dollName: 'Alva',
      dollClass: 'Support',
      dollPhase: 'Freeze',
      dollRarity: 'Elite',
      weaponName: '6P33',
      keyNames: ['Affinity Key - The Blessed One', "Common Key - Mind's Eye"],
      vert: [1, 2, 3],
      portrait: null,
    });
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // Doll name baseline at y=140, x from 560.
    expect(inkInRegion(ctx2d, 560, 100, 600, 50)).toBeGreaterThan(100);
    // "?" placeholder in the portrait box (muted #8b93a3, below the 150 cut).
    expect(inkInRegion(ctx2d, 60, 95, 440, 440, 100)).toBeGreaterThan(100);
    const png = await canvas.encode('png');
    expect(png.length).toBeGreaterThan(1000);
  });

  it('build card degrades on all-null data without throwing', async () => {
    const { createCanvas, drawBuildCard, BUILD_CARD_W, BUILD_CARD_H } =
      await import('./node/render.js');
    const canvas = createCanvas(BUILD_CARD_W, BUILD_CARD_H);
    const ctx = canvas.getContext('2d');
    expect(() =>
      drawBuildCard(ctx as never, {
        dollName: null,
        dollClass: null,
        dollPhase: null,
        dollRarity: null,
        weaponName: null,
        keyNames: [],
        vert: [],
        portrait: null,
      })
    ).not.toThrow();
  });

  it('team card renders with ink in the Squad title region', async () => {
    const { createCanvas, drawTeamCard, TEAM_CARD_W, cardHeight } =
      await import('./node/render.js');
    const canvas = createCanvas(TEAM_CARD_W, cardHeight(2));
    const ctx = canvas.getContext('2d');
    drawTeamCard(ctx as never, [
      { dollName: 'Alva', weaponName: '6P33', portrait: null },
      { dollName: 'Makiatto', weaponName: null, portrait: null },
    ]);
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // "Squad" title at x=60, baseline y=88.
    expect(inkInRegion(ctx2d, 60, 50, 300, 45)).toBeGreaterThan(100);
  });
});

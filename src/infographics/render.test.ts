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
      weaponImage: null,
      fixedKeySlots: [1, 3, 5],
      commonKeySources: ['Suomi', 'Makiatto'],
      expansionKeyName: 'White Reaper',
      vert: [1, 2, 3],
      refinement: 4,
      statPrefs: ['ATK', 'Crit DMG', 'Crit Rate', 'HP'],
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
        weaponImage: null,
        fixedKeySlots: [],
        commonKeySources: [],
        expansionKeyName: null,
        vert: [],
        refinement: null,
        statPrefs: [],
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
      {
        dollName: 'Alva',
        weaponName: '6P33',
        refinement: 4,
        vert: [3],
        fixedKeys: [1, 2, 3],
        expansionKey: "Senior's Instructions",
        commonKeys: ['Suomi', 'Generic Atk/Crit'],
        statPrefs: ['Crit Rate', 'Crit DMG', 'ATK%'],
        portrait: null,
      },
      {
        dollName: 'Makiatto',
        weaponName: null,
        refinement: null,
        vert: [],
        fixedKeys: [],
        expansionKey: null,
        commonKeys: [],
        statPrefs: [],
        portrait: null,
      },
    ]);
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // "Squad" title at x=36, baseline y=74.
    expect(inkInRegion(ctx2d, 36, 40, 300, 42)).toBeGreaterThan(100);
    // The card is PORTRAIT: a full squad must be taller than it is wide.
    expect(cardHeight(5)).toBeGreaterThan(TEAM_CARD_W);
  });

  it('team card row draws every build field inline with the portrait', async () => {
    const { createCanvas, drawTeamCard, TEAM_CARD_W, cardHeight } =
      await import('./node/render.js');
    const canvas = createCanvas(TEAM_CARD_W, cardHeight(1));
    const ctx = canvas.getContext('2d');
    drawTeamCard(ctx as never, [
      {
        dollName: 'Alva',
        weaponName: '6P33',
        refinement: 4,
        vert: [3],
        fixedKeys: [1, 2, 3],
        expansionKey: "Senior's Instructions",
        commonKeys: ['Suomi'],
        statPrefs: ['Crit Rate', 'Crit DMG'],
        portrait: null,
      },
    ]);
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // Row 0 starts at y=128; the info column starts at x=198. Each band below
    // is one of the inline lines, so a dropped field shows up as dead pixels.
    const rowY = 128;
    // Name (bright text) + the accent V pill on the same line.
    expect(inkInRegion(ctx2d, 198, rowY + 24, 520, 32)).toBeGreaterThan(100);
    // Weapon + R pill.
    expect(inkInRegion(ctx2d, 198, rowY + 58, 520, 30)).toBeGreaterThan(100);
    // Fixed-key chips (accent fill).
    expect(inkInRegion(ctx2d, 198, rowY + 98, 520, 24, 80)).toBeGreaterThan(
      100
    );
    // EXP, COMMON KEYS and STATS, one full-width line each.
    expect(inkInRegion(ctx2d, 198, rowY + 134, 520, 18, 80)).toBeGreaterThan(
      50
    );
    expect(inkInRegion(ctx2d, 198, rowY + 160, 520, 18, 80)).toBeGreaterThan(
      50
    );
    expect(inkInRegion(ctx2d, 198, rowY + 186, 520, 18, 80)).toBeGreaterThan(
      50
    );
  });

  it('team card draws a chip per EQUIPPED fixed key and none for the rest', async () => {
    const { createCanvas, drawTeamCard, TEAM_CARD_W, cardHeight } =
      await import('./node/render.js');
    const base = {
      dollName: 'Alva',
      weaponName: '6P33',
      refinement: 4,
      vert: [3],
      expansionKey: null,
      commonKeys: [],
      statPrefs: [],
      portrait: null,
    };
    // The chip strip well to the RIGHT of the first chip: empty when one key
    // is equipped, inked when six are. Threshold 40 sees accent chips (#5b9dff)
    // but not the row panel (#181b22) underneath them.
    const strip = [360, 128 + 98, 340, 24, 40] as const;
    const render = (fixedKeys: number[]) => {
      const canvas = createCanvas(TEAM_CARD_W, cardHeight(1));
      const ctx = canvas.getContext('2d');
      drawTeamCard(ctx as never, [{ ...base, fixedKeys }]);
      return inkInRegion(
        ctx as never as Parameters<typeof inkInRegion>[0],
        ...strip
      );
    };
    expect(render([2])).toBe(0);
    expect(render([1, 2, 3, 4, 5, 6])).toBeGreaterThan(100);
  });

  it('team card degrades on an all-empty build without throwing', async () => {
    const { createCanvas, drawTeamCard, TEAM_CARD_W, cardHeight } =
      await import('./node/render.js');
    const canvas = createCanvas(TEAM_CARD_W, cardHeight(1));
    const ctx = canvas.getContext('2d');
    expect(() =>
      drawTeamCard(ctx as never, [
        {
          dollName: 'Alva',
          weaponName: null,
          refinement: null,
          vert: [],
          fixedKeys: [],
          expansionKey: null,
          commonKeys: [],
          statPrefs: [],
          portrait: null,
        },
      ])
    ).not.toThrow();
  });
});

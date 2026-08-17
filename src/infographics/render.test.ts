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
      attachmentSet: 'Ultimate Pursuit',
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
        attachmentSet: null,
        statPrefs: [],
        portrait: null,
      })
    ).not.toThrow();
  });

  it('team card renders with ink in the Squad title region', async () => {
    const { createCanvas, drawTeamCard, TEAM_CARD_W, cardHeight } =
      await import('./node/render.js');
    const slots = [
      {
        dollName: 'Alva',
        weaponName: '6P33',
        dollPhase: 'Freeze',
        refinement: 4,
        attachmentSet: 'Phase Strike',
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
        dollPhase: null,
        refinement: null,
        attachmentSet: null,
        vert: [],
        fixedKeys: [],
        expansionKey: null,
        commonKeys: [],
        statPrefs: [],
        portrait: null,
      },
    ];
    const canvas = createCanvas(TEAM_CARD_W, cardHeight(slots));
    const ctx = canvas.getContext('2d');
    drawTeamCard(ctx as never, slots);
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // "Squad" title at x=36, baseline y=74.
    expect(inkInRegion(ctx2d, 36, 40, 300, 42)).toBeGreaterThan(100);
    // The card is PORTRAIT: a full squad must be taller than it is wide.
    const five = Array.from({ length: 5 }, () => slots[0]!);
    expect(cardHeight(five)).toBeGreaterThan(TEAM_CARD_W);
  });

  it('team card row draws every build field inline with the portrait', async () => {
    const { createCanvas, drawTeamCard, TEAM_CARD_W, cardHeight } =
      await import('./node/render.js');
    const slots = [
      {
        dollName: 'Alva',
        weaponName: '6P33',
        dollPhase: 'Freeze',
        refinement: 4,
        attachmentSet: 'Phase Strike',
        vert: [3],
        fixedKeys: [1, 2, 3],
        expansionKey: "Senior's Instructions",
        commonKeys: ['Suomi'],
        statPrefs: ['Crit Rate', 'Crit DMG'],
        portrait: null,
      },
    ];
    const canvas = createCanvas(TEAM_CARD_W, cardHeight(slots));
    const ctx = canvas.getContext('2d');
    drawTeamCard(ctx as never, slots);
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // Row 0 starts at y=128; the info column starts at x=198. Each band below
    // is one of the inline lines, so a dropped field shows up as dead pixels.
    const rowY = 128;
    // Name (bright text) + the accent V pill on the same line.
    expect(inkInRegion(ctx2d, 198, rowY + 24, 520, 32)).toBeGreaterThan(100);
    // Weapon + R pill, with the attachment set inline between them.
    expect(inkInRegion(ctx2d, 198, rowY + 58, 520, 30)).toBeGreaterThan(100);
    // Fixed-key chips (accent fill).
    expect(inkInRegion(ctx2d, 198, rowY + 98, 520, 24, 80)).toBeGreaterThan(
      100
    );
    // EXP. KEY, COMMON KEYS and STATS, one full-width line each.
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
      dollPhase: 'Freeze',
      refinement: 4,
      attachmentSet: null,
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
      const slots = [{ ...base, fixedKeys }];
      const canvas = createCanvas(TEAM_CARD_W, cardHeight(slots));
      const ctx = canvas.getContext('2d');
      drawTeamCard(ctx as never, slots);
      return inkInRegion(
        ctx as never as Parameters<typeof inkInRegion>[0],
        ...strip
      );
    };
    expect(render([2])).toBe(0);
    expect(render([1, 2, 3, 4, 5, 6])).toBeGreaterThan(100);
  });

  it('team card omits the expansion-key line entirely when there is none', async () => {
    const { cardHeight, slotHeight } = await import('./node/render.js');
    const base = {
      dollName: 'Alva',
      weaponName: '6P33',
      dollPhase: 'Freeze',
      refinement: 4,
      attachmentSet: null,
      vert: [3],
      fixedKeys: [1],
      commonKeys: [],
      statPrefs: [],
      portrait: null,
    };
    const withExp = { ...base, expansionKey: "Senior's Instructions" };
    const without = { ...base, expansionKey: null };
    // The row is SHORTER, not the same height with a muted dash in the slot.
    expect(slotHeight(without)).toBeLessThan(slotHeight(withExp));
    // And the card's height is the sum of its rows, not slots × a constant.
    expect(cardHeight([withExp, without])).toBe(
      cardHeight([withExp]) + slotHeight(without)
    );
  });

  it('rec card renders with ink in the title and roadmap regions', async () => {
    const { createCanvas, drawRecCard, REC_CARD_W, recCardHeight } =
      await import('./node/render.js');
    const data = {
      dollName: 'Alva',
      dollClass: 'Support',
      // Burn: its accent (#d92d38) has red ink the red-channel probe can see.
      dollPhase: 'Burn',
      dollRarity: 'Elite',
      breakpoints: ['V0', 'R1', 'V3', 'V6', 'R6'],
      optimal: 'V3R1',
      weapons: [
        { name: '6P33', image: null },
        { name: 'Backup Gun', image: null },
      ],
      attachmentSets: ['Ultimate Pursuit', 'Phase Strike'],
      fixedKeySlots: [1, 3, 5],
      expansionKeyName: 'White Reaper',
      commonKeySources: ['Suomi', 'Makiatto'],
      statPrefs: ['ATK', 'Crit DMG', 'Crit Rate'],
      notes: 'Works from V0; R1 is the first big jump, V6 is luxury.',
      portrait: null,
    };
    const h = recCardHeight(data);
    // The card is PORTRAIT: with a full payload it must be taller than wide.
    expect(h).toBeGreaterThan(REC_CARD_W);
    const canvas = createCanvas(REC_CARD_W, h);
    const ctx = canvas.getContext('2d');
    drawRecCard(ctx as never, data);
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // "Recommendation" title at x=36, baseline y=74.
    expect(inkInRegion(ctx2d, 36, 40, 360, 42)).toBeGreaterThan(100);
    // Doll name right of the 148px portrait (x=206, baseline 198).
    expect(inkInRegion(ctx2d, 206, 165, 400, 40)).toBeGreaterThan(100);
    // Breakpoint chips (accent fill) in the roadmap band under the portrait.
    expect(inkInRegion(ctx2d, 36, 290 + 46, 688, 34, 80)).toBeGreaterThan(200);
    const png = await canvas.encode('png');
    expect(png.length).toBeGreaterThan(1000);
  });

  it('rec card height grows with weapons, sets and notes', async () => {
    const { recCardHeight } = await import('./node/render.js');
    const base = {
      dollName: 'Alva',
      dollClass: null,
      dollPhase: null,
      dollRarity: null,
      breakpoints: [],
      optimal: null,
      weapons: [],
      attachmentSets: [],
      fixedKeySlots: [],
      expansionKeyName: null,
      commonKeySources: [],
      statPrefs: [],
      notes: null,
      portrait: null,
    };
    const h0 = recCardHeight(base);
    const gun = { name: '6P33', image: null };
    // One weapon/set replaces the muted "—" row, so height starts moving at 2.
    expect(recCardHeight({ ...base, weapons: [gun, gun] })).toBeGreaterThan(h0);
    expect(
      recCardHeight({ ...base, attachmentSets: ['A', 'B'] })
    ).toBeGreaterThan(h0);
    expect(recCardHeight({ ...base, notes: 'Short note.' })).toBeGreaterThan(
      h0
    );
    // A long note budgets more lines than a short one.
    expect(recCardHeight({ ...base, notes: 'x'.repeat(280) })).toBeGreaterThan(
      recCardHeight({ ...base, notes: 'Short note.' })
    );
    // Expansion/common key lines are omitted, not dashed, when absent.
    expect(
      recCardHeight({ ...base, expansionKeyName: 'White Reaper' })
    ).toBeGreaterThan(h0);
  });

  it('rec card degrades on an all-empty payload without throwing', async () => {
    const { createCanvas, drawRecCard, REC_CARD_W, recCardHeight } =
      await import('./node/render.js');
    const data = {
      dollName: null,
      dollClass: null,
      dollPhase: null,
      dollRarity: null,
      breakpoints: [],
      optimal: null,
      weapons: [],
      attachmentSets: [],
      fixedKeySlots: [],
      expansionKeyName: null,
      commonKeySources: [],
      statPrefs: [],
      notes: null,
      portrait: null,
    };
    const canvas = createCanvas(REC_CARD_W, recCardHeight(data));
    const ctx = canvas.getContext('2d');
    expect(() => drawRecCard(ctx as never, data)).not.toThrow();
  });

  it('pull card renders tiles, the odds ladder and its bars', async () => {
    const { createCanvas, drawPullCard, PULL_CARD_W, pullCardHeight } =
      await import('./node/render.js');
    const data = {
      title: 'Pull Calculator',
      subtitle:
        '160 pulls · Doll banner · pity 0 · 50% featured on the next Elite',
      accent: '#5b9dff',
      tiles: [
        {
          label: '1+ featured doll',
          value: '86.4%',
          sub: 'chance in 160 pulls',
          main: true,
        },
        { label: 'Expected copies', value: '1.5', sub: 'of the featured unit' },
        {
          label: 'Any Elite Doll',
          value: '3.0',
          sub: 'expected · 95.1% for 1+',
        },
      ],
      rows: Array.from({ length: 7 }, (_, i) => ({
        tier: `V${i}`,
        copies: `${i + 1} cop${i === 0 ? 'y' : 'ies'}`,
        chance: '50.0%',
        p: 1 / (i + 1),
      })),
      meta: 'Worst case 240 pulls to a first copy · soft pity from 59',
      detail: 'Tiers are cumulative — V1 includes everything above it.',
    };
    const h = pullCardHeight(data);
    // LANDSCAPE, unlike the portrait build/squad/rec cards.
    expect(h).toBeLessThan(PULL_CARD_W);
    const canvas = createCanvas(PULL_CARD_W, h);
    const ctx = canvas.getContext('2d');
    drawPullCard(ctx as never, data);
    const ctx2d = ctx as never as Parameters<typeof inkInRegion>[0];
    // "Pull Calculator" title at x=36, baseline y=74.
    expect(inkInRegion(ctx2d, 36, 40, 360, 42)).toBeGreaterThan(100);
    // The main tile's value (accent #5b9dff), under the header.
    expect(inkInRegion(ctx2d, 52, 132 + 34, 200, 32, 80)).toBeGreaterThan(100);
    // First ladder row: the accent tier chip, and its odds in the right column.
    const rowY = 132 + 96 + 46;
    expect(inkInRegion(ctx2d, 36, rowY + 4, 46, 26, 80)).toBeGreaterThan(200);
    expect(inkInRegion(ctx2d, 640, rowY, 84, 30)).toBeGreaterThan(50);
    const png = await canvas.encode('png');
    expect(png.length).toBeGreaterThan(1000);
  });

  it('pull card bars track the odds and survive a zero row', async () => {
    const { createCanvas, drawPullCard, PULL_CARD_W, pullCardHeight } =
      await import('./node/render.js');
    const base = {
      title: 'Pull Calculator',
      subtitle: '10 pulls · Doll banner',
      accent: '#5b9dff',
      tiles: [{ label: 'a', value: 'b', sub: 'c', main: true }],
      meta: 'meta',
      detail: 'detail',
    };
    // The bar band of row 0, from the halfway point of the track rightwards:
    // inked at p=1, empty at p=0.05, and a zero row must not throw.
    const band = [
      36 + 180 + Math.round((760 - 72 - 180 - 86 - 14) / 2),
      132 + 96 + 46 + 12,
      120,
      10,
      80,
    ] as const;
    const render = (p: number) => {
      const data = {
        ...base,
        rows: [{ tier: 'V0', copies: '1 copy', chance: 'x', p }],
      };
      const canvas = createCanvas(PULL_CARD_W, pullCardHeight(data));
      const ctx = canvas.getContext('2d');
      drawPullCard(ctx as never, data);
      return inkInRegion(
        ctx as never as Parameters<typeof inkInRegion>[0],
        ...band
      );
    };
    expect(render(1)).toBeGreaterThan(100);
    expect(render(0.05)).toBe(0);
    expect(() => render(0)).not.toThrow();
  });

  it('pull card height grows one row at a time', async () => {
    const { pullCardHeight } = await import('./node/render.js');
    const row = { tier: 'V0', copies: '1 copy', chance: '50%', p: 0.5 };
    const base = {
      title: 'Pull Calculator',
      subtitle: '',
      accent: '#5b9dff',
      tiles: [],
      rows: [row],
      meta: '',
      detail: '',
    };
    const one = pullCardHeight(base);
    const two = pullCardHeight({ ...base, rows: [row, row] });
    expect(two - one).toBe(
      pullCardHeight({ ...base, rows: [row, row, row] }) - two
    );
  });

  it('team card degrades on an all-empty build without throwing', async () => {
    const { createCanvas, drawTeamCard, TEAM_CARD_W, cardHeight } =
      await import('./node/render.js');
    const slots = [
      {
        dollName: 'Alva',
        weaponName: null,
        dollPhase: null,
        refinement: null,
        attachmentSet: null,
        vert: [],
        fixedKeys: [],
        expansionKey: null,
        commonKeys: [],
        statPrefs: [],
        portrait: null,
      },
    ];
    const canvas = createCanvas(TEAM_CARD_W, cardHeight(slots));
    const ctx = canvas.getContext('2d');
    expect(() => drawTeamCard(ctx as never, slots)).not.toThrow();
  });
});

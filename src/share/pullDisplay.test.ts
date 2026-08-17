import { describe, expect, it } from 'vitest';
import { DOLL_BANNER, WEAPON_BANNER, summarizePulls } from './gacha.js';
import {
  bannerEmbedColor,
  buildPullCardData,
  pct0,
  pct1,
  ratePct,
} from './pullDisplay.js';

describe('formatters', () => {
  it('trims a trailing .0 from whole per-pull rates', () => {
    expect(ratePct(0.03)).toBe('3%');
    expect(ratePct(0.006)).toBe('0.6%');
  });

  it('never rounds an unlikely outcome to 0% or a near-miss to 100%', () => {
    expect(pct0(0.001)).toBe('<1%');
    expect(pct0(0.999)).toBe('>99%');
    expect(pct0(1)).toBe('100%');
    expect(pct0(0)).toBe('0%');
    expect(pct1(0.0001)).toBe('<0.1%');
    expect(pct1(0.9999)).toBe('>99.9%');
    expect(pct1(1)).toBe('100.0%');
  });

  it('maps each banner to its own embed color', () => {
    expect(bannerEmbedColor(DOLL_BANNER)).toBe(0x5b9dff);
    expect(bannerEmbedColor(WEAPON_BANNER)).toBe(0xf4a72c);
  });
});

describe('buildPullCardData', () => {
  it('charts one row per dupe tier, in the banner’s own naming', () => {
    const doll = buildPullCardData(
      summarizePulls(200, { banner: DOLL_BANNER })
    );
    expect(doll.rows.map((r) => r.tier)).toEqual([
      'V0',
      'V1',
      'V2',
      'V3',
      'V4',
      'V5',
      'V6',
    ]);
    expect(doll.rows[0]?.copies).toBe('1 copy');
    expect(doll.rows[1]?.copies).toBe('2 copies');

    const weapon = buildPullCardData(
      summarizePulls(200, { banner: WEAPON_BANNER })
    );
    expect(weapon.rows.map((r) => r.tier)).toEqual([
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
      'R6',
    ]);
  });

  it('keeps the bar fraction and the printed odds in step, and descending', () => {
    const data = buildPullCardData(
      summarizePulls(300, { banner: DOLL_BANNER })
    );
    data.rows.forEach((row) => {
      expect(row.p).toBeGreaterThanOrEqual(0);
      expect(row.p).toBeLessThanOrEqual(1);
      expect(row.chance).toBe(pct1(row.p));
    });
    // Cumulative odds can only fall as the tier climbs.
    for (let i = 1; i < data.rows.length; i++) {
      expect(data.rows[i]!.p).toBeLessThanOrEqual(data.rows[i - 1]!.p);
    }
  });

  it('leads with the chance of landing the unit at all', () => {
    const s = summarizePulls(160, { banner: DOLL_BANNER });
    const data = buildPullCardData(s);
    const [main] = data.tiles;
    expect(main?.main).toBe(true);
    expect(main?.value).toBe(pct1(s.featuredAtLeast[0] ?? 0));
    expect(data.tiles).toHaveLength(3);
  });

  it('states the starting pity and guarantee in the subtitle', () => {
    const armed = buildPullCardData(
      summarizePulls(80, { banner: DOLL_BANNER, pity: 40, guaranteed: true })
    );
    expect(armed.subtitle).toContain('80 pulls');
    expect(armed.subtitle).toContain('pity 40');
    expect(armed.subtitle).toMatch(/guaranteed/i);

    const fifty = buildPullCardData(
      summarizePulls(80, { banner: DOLL_BANNER, pity: 0 })
    );
    expect(fifty.subtitle).toContain('50% featured');
  });

  it('tints by banner and singularizes a one-pull budget', () => {
    const one = buildPullCardData(summarizePulls(1, { banner: WEAPON_BANNER }));
    expect(one.accent).toBe('#f4a72c');
    expect(one.subtitle).toContain('1 pull ');
    expect(one.tiles[0]?.sub).toBe('chance in 1 pull');
  });
});

import { describe, expect, it } from 'vitest';
import {
  DOLL_BANNER,
  WEAPON_BANNER,
  copiesForTier,
  copyTierLabel,
  eliteRateAt,
  meanPullsPerElite,
  meanPullsToElite,
  meanPullsToFeatured,
  overallEliteRate,
  parseCopyTarget,
  rateCurve,
  softPityStep,
  summarizePulls,
  worstCasePullsToFeatured,
} from './gacha.js';

describe('rate curve', () => {
  it('holds the base rate right up to the soft-pity pull', () => {
    // pity 57 => pull 58, the last "consecutive access" before the ramp.
    expect(eliteRateAt(57, DOLL_BANNER)).toBe(0.006);
    expect(eliteRateAt(49, WEAPON_BANNER)).toBe(0.007);
  });

  it('jumps a full step on the first soft-pity pull, then ramps evenly', () => {
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      const step = softPityStep(banner);
      const first = banner.softPityStart - 1;
      expect(eliteRateAt(first, banner)).toBeCloseTo(
        banner.baseRate + step,
        10
      );
      expect(eliteRateAt(first + 1, banner)).toBeCloseTo(
        banner.baseRate + 2 * step,
        10
      );
    }
    // Both land near the ~5pp/pull that the community quotes.
    expect(softPityStep(DOLL_BANNER)).toBeCloseTo(0.0452, 3);
    expect(softPityStep(WEAPON_BANNER)).toBeCloseTo(0.0497, 3);
  });

  it('guarantees an Elite on the hard-pity pull the game documents', () => {
    // Just short of hard pity the rate is high but not certain...
    expect(eliteRateAt(78, DOLL_BANNER)).toBeCloseTo(0.955, 3);
    expect(eliteRateAt(68, WEAPON_BANNER)).toBeCloseTo(0.95, 3);
    // ...and pull 80 / 70 is the documented guarantee.
    expect(eliteRateAt(79, DOLL_BANNER)).toBe(1);
    expect(eliteRateAt(69, WEAPON_BANNER)).toBe(1);
  });

  it('rises monotonically', () => {
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      const curve = rateCurve(banner);
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      }
    }
  });

  it('spans exactly hard-pity pulls', () => {
    expect(rateCurve(DOLL_BANNER)).toHaveLength(80);
    expect(rateCurve(WEAPON_BANNER)).toHaveLength(70);
  });
});

describe('published overall rates', () => {
  // The ramp isn't documented in game; these figures are what pin it down.
  // In-game: Doll "overall probability (including guarantees) of 1.89%",
  // Weapon "2.18%". Rounding our modelled curve to the precision the game
  // displays must land on those exact figures — that is the whole basis for
  // believing the ramp shape, so assert it at full displayed precision rather
  // than with a loose tolerance.
  const round2 = (v: number): number => Math.round(v * 100) / 100;

  it('reproduces the doll banner 1.89% consolidated rate', () => {
    expect(round2(overallEliteRate(DOLL_BANNER) * 100)).toBe(1.89);
  });

  it('reproduces the weapon banner 2.18% consolidated rate', () => {
    expect(round2(overallEliteRate(WEAPON_BANNER) * 100)).toBe(2.18);
  });
});

describe('summarizePulls', () => {
  it('reports nothing for zero or nonsense pull counts', () => {
    for (const n of [0, -5, Number.NaN]) {
      const s = summarizePulls(n);
      expect(s.pulls).toBe(0);
      expect(s.expectedElites).toBe(0);
      expect(s.eliteAtLeastOne).toBe(0);
      expect(s.featuredAtLeast.every((p) => p === 0)).toBe(true);
    }
  });

  it('uses the flat base rate while soft pity is out of reach', () => {
    const s = summarizePulls(10, { banner: DOLL_BANNER });
    expect(s.expectedElites).toBeCloseTo(10 * 0.006, 10);
    expect(s.eliteAtLeastOne).toBeCloseTo(1 - 0.994 ** 10, 10);
    // Slightly better than a naive half of those Elites: the runs that lose the
    // 50/50 arm the guarantee, so a second Elite in the window is always featured.
    expect(s.expectedFeatured).toBeGreaterThan(10 * 0.006 * 0.5);
    expect(s.expectedFeatured).toBeCloseTo(10 * 0.006 * 0.5, 3);
  });

  it('guarantees an Elite once the pull count reaches hard pity', () => {
    expect(
      summarizePulls(80, { banner: DOLL_BANNER }).eliteAtLeastOne
    ).toBeCloseTo(1, 12);
    expect(
      summarizePulls(70, { banner: WEAPON_BANNER }).eliteAtLeastOne
    ).toBeCloseTo(1, 12);
  });

  it('accounts for starting pity when reaching hard pity', () => {
    const s = summarizePulls(10, { banner: DOLL_BANNER, pity: 70 });
    expect(s.eliteAtLeastOne).toBeCloseTo(1, 12);
    // A hair over the naive 50/50: an early Elite that loses the coin flip can
    // still be followed by a second, guaranteed-featured one inside the window.
    expect(s.featuredAtLeast[0]).toBeGreaterThan(0.5);
    expect(s.featuredAtLeast[0]).toBeCloseTo(0.5, 1);
  });

  it('makes an armed guarantee pay out the featured unit', () => {
    const s = summarizePulls(10, {
      banner: DOLL_BANNER,
      pity: 70,
      guaranteed: true,
    });
    expect(s.featuredAtLeast[0]).toBeCloseTo(1, 12);
  });

  it('applies the weapon banner 75/25 split', () => {
    const s = summarizePulls(70, { banner: WEAPON_BANNER });
    expect(s.featuredAtLeast[0]).toBeGreaterThan(0.75);
    expect(s.expectedFeatured / s.expectedElites).toBeGreaterThan(0.75);
  });

  it('always reaches a featured copy within the worst case', () => {
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      const { worstCaseFeatured } = summarizePulls(1, { banner });
      expect(worstCaseFeatured).toBe(banner.hardPity * 2);
      expect(
        summarizePulls(worstCaseFeatured, { banner }).featuredAtLeast[0]
      ).toBeCloseTo(1, 12);
      // Reaching hard pity once only guarantees an Elite, not a FEATURED one —
      // that is the whole point of the worst case being two pity cycles.
      expect(
        summarizePulls(banner.hardPity, { banner }).featuredAtLeast[0]
      ).toBeLessThan(0.99);
    }
  });

  it('halves the worst case when the guarantee is already armed', () => {
    const s = summarizePulls(1, { banner: DOLL_BANNER, guaranteed: true });
    expect(s.worstCaseFeatured).toBe(80);
  });

  it('keeps copy odds monotonically decreasing', () => {
    const { featuredAtLeast } = summarizePulls(600, { banner: DOLL_BANNER });
    for (let i = 1; i < featuredAtLeast.length; i++) {
      expect(featuredAtLeast[i]).toBeLessThanOrEqual(featuredAtLeast[i - 1]);
    }
  });

  it('reports each banner up to its own copy ceiling', () => {
    expect(summarizePulls(100).featuredAtLeast).toHaveLength(7);
    expect(
      summarizePulls(100, { banner: WEAPON_BANNER }).featuredAtLeast
    ).toHaveLength(6);
  });

  it('clamps a requested copy ceiling to the banner maximum', () => {
    const s = summarizePulls(100, { banner: WEAPON_BANNER, maxCopies: 99 });
    expect(s.maxCopies).toBe(6);
  });

  it('does not let copy saturation truncate the expected count', () => {
    // Far past V6, so the copy distribution is pinned at its ceiling; the
    // expectation is accumulated separately and must keep growing.
    const a = summarizePulls(2000, { banner: DOLL_BANNER });
    const b = summarizePulls(4000, { banner: DOLL_BANNER });
    expect(a.featuredAtLeast[6]).toBeCloseTo(1, 6);
    expect(b.expectedFeatured).toBeGreaterThan(a.expectedFeatured * 1.9);
  });

  it('matches the overall rate over a long horizon', () => {
    const banner = DOLL_BANNER;
    const s = summarizePulls(5000, { banner });
    expect(s.expectedElites / 5000).toBeCloseTo(overallEliteRate(banner), 3);
  });
});

describe('copyTierLabel', () => {
  it('names doll tiers from V0 and weapon tiers from R1', () => {
    expect(copyTierLabel(DOLL_BANNER, 1)).toBe('V0');
    expect(copyTierLabel(DOLL_BANNER, 7)).toBe('V6');
    expect(copyTierLabel(WEAPON_BANNER, 1)).toBe('R1');
    expect(copyTierLabel(WEAPON_BANNER, 6)).toBe('R6');
  });
});

describe('parseCopyTarget', () => {
  it('accepts the prefixed forms in any case', () => {
    expect(parseCopyTarget('V6')).toEqual({ prefix: 'V', tier: 6 });
    expect(parseCopyTarget('v0')).toEqual({ prefix: 'V', tier: 0 });
    expect(parseCopyTarget('  r3 ')).toEqual({ prefix: 'R', tier: 3 });
  });

  it('treats the older "C" calibration slang as R', () => {
    expect(parseCopyTarget('c4')).toEqual({ prefix: 'R', tier: 4 });
  });

  it('accepts a bare tier number with no prefix', () => {
    expect(parseCopyTarget('6')).toEqual({ prefix: null, tier: 6 });
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'v', 'x2', 'v-1', 'v1.5', '6v', 'vv6', '123']) {
      expect(parseCopyTarget(bad)).toBeNull();
    }
  });
});

describe('copiesForTier', () => {
  it('maps tiers onto copy counts per banner', () => {
    expect(copiesForTier(DOLL_BANNER, 0)).toBe(1);
    expect(copiesForTier(DOLL_BANNER, 6)).toBe(7);
    expect(copiesForTier(WEAPON_BANNER, 1)).toBe(1);
    expect(copiesForTier(WEAPON_BANNER, 6)).toBe(6);
  });

  it('rejects tiers the banner does not have', () => {
    expect(copiesForTier(DOLL_BANNER, 7)).toBeNull();
    // Weapons have no R0 — a single copy is already R1.
    expect(copiesForTier(WEAPON_BANNER, 0)).toBeNull();
    expect(copiesForTier(WEAPON_BANNER, 7)).toBeNull();
  });
});

describe('meanPullsToElite', () => {
  it('matches the published overall rate from zero pity', () => {
    expect(meanPullsToElite(DOLL_BANNER, 0)).toBeCloseTo(
      1 / overallEliteRate(DOLL_BANNER),
      10
    );
  });

  it('gets cheaper the more pity you carry in', () => {
    expect(meanPullsToElite(DOLL_BANNER, 50)).toBeLessThan(
      meanPullsToElite(DOLL_BANNER, 0)
    );
    // One pull short of hard pity, the next pull is a certainty.
    expect(meanPullsToElite(DOLL_BANNER, 79)).toBeCloseTo(1, 10);
  });
});

describe('meanPullsToFeatured', () => {
  it('scales linearly past the first copy', () => {
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      const perCopy = meanPullsPerElite(banner) * (2 - banner.featuredChance);
      const one = meanPullsToFeatured(banner, 1);
      expect(one).toBeCloseTo(perCopy, 10);
      expect(meanPullsToFeatured(banner, 3)).toBeCloseTo(3 * perCopy, 10);
    }
  });

  it('credits carried-in pity and an armed guarantee', () => {
    const fresh = meanPullsToFeatured(DOLL_BANNER, 1);
    expect(
      meanPullsToFeatured(DOLL_BANNER, 1, { guaranteed: true })
    ).toBeLessThan(fresh);
    expect(meanPullsToFeatured(DOLL_BANNER, 1, { pity: 70 })).toBeLessThan(
      fresh
    );
    // Only the FIRST copy benefits, so the discount doesn't compound.
    const discount = fresh - meanPullsToFeatured(DOLL_BANNER, 1, { pity: 70 });
    const discount7 =
      meanPullsToFeatured(DOLL_BANNER, 7) -
      meanPullsToFeatured(DOLL_BANNER, 7, { pity: 70 });
    expect(discount7).toBeCloseTo(discount, 10);
  });

  it('agrees exactly with the Markov model it summarises', () => {
    // Independent cross-check via E[T] = sum over n >= 0 of P(T > n). The DP
    // gives P(T <= n) as featuredAtLeast[k-1], and T can never exceed the worst
    // case, so this sum is exact — and it is derived completely separately from
    // the closed form, which is the point.
    const meanViaDp = (banner: typeof DOLL_BANNER, copies: number): number => {
      const horizon = worstCasePullsToFeatured(banner, copies);
      let expected = 0;
      for (let n = 0; n < horizon; n++) {
        const reached =
          summarizePulls(n, { banner }).featuredAtLeast[copies - 1] ?? 0;
        expected += 1 - reached;
      }
      return expected;
    };
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      for (const copies of [1, 2]) {
        expect(meanViaDp(banner, copies)).toBeCloseTo(
          meanPullsToFeatured(banner, copies),
          6
        );
      }
    }
  });

  it('matches the long-run rate the DP converges to', () => {
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      const perCopy =
        meanPullsToFeatured(banner, 2) - meanPullsToFeatured(banner, 1);
      const dp = summarizePulls(5000, { banner, maxCopies: 1 });
      // Within 1%: over a finite horizon the final interrupted cycle leaves a
      // small deficit that only vanishes as the horizon grows.
      expect(5000 / dp.expectedFeatured).toBeGreaterThan(perCopy * 0.99);
      expect(5000 / dp.expectedFeatured).toBeLessThan(perCopy * 1.01);
    }
  });

  it('sits well below the worst case', () => {
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      expect(meanPullsToFeatured(banner, banner.maxCopies)).toBeLessThan(
        worstCasePullsToFeatured(banner, banner.maxCopies)
      );
    }
  });
});

describe('worstCasePullsToFeatured', () => {
  it('costs two full pity cycles per copy from a clean slate', () => {
    expect(worstCasePullsToFeatured(DOLL_BANNER, 1)).toBe(160);
    expect(worstCasePullsToFeatured(DOLL_BANNER, 7)).toBe(1120);
    expect(worstCasePullsToFeatured(WEAPON_BANNER, 1)).toBe(140);
    expect(worstCasePullsToFeatured(WEAPON_BANNER, 6)).toBe(840);
  });

  it('credits carried-in pity and an armed guarantee once', () => {
    expect(worstCasePullsToFeatured(DOLL_BANNER, 1, { pity: 30 })).toBe(130);
    expect(worstCasePullsToFeatured(DOLL_BANNER, 1, { guaranteed: true })).toBe(
      80
    );
    expect(
      worstCasePullsToFeatured(DOLL_BANNER, 2, { pity: 30, guaranteed: true })
    ).toBe(210);
  });

  it('really is sufficient, per the Markov model', () => {
    for (const banner of [DOLL_BANNER, WEAPON_BANNER]) {
      const copies = banner.maxCopies;
      const worst = worstCasePullsToFeatured(banner, copies);
      const dp = summarizePulls(worst, { banner });
      expect(dp.featuredAtLeast[copies - 1]).toBeCloseTo(1, 12);
      // And one pity cycle short of it, it is not yet certain.
      const short = summarizePulls(worst - banner.hardPity, { banner });
      expect(short.featuredAtLeast[copies - 1]).toBeLessThan(1);
    }
  });
});

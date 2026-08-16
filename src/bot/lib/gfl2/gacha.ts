/**
 * Pull-odds calculator for GFL2: Exilium recruitment ("access").
 *
 * PURE math (no I/O, no clock) so it's trivially unit-testable. Unlike a plain
 * binomial model, GFL2 pulls are NOT independent: the Elite rate ramps once you
 * pass the soft-pity threshold, resets on every Elite, and a lost featured roll
 * flags the *next* Elite as guaranteed-featured. We therefore walk a small
 * Markov chain over (pity, guaranteed, copies) rather than closed-form binomials.
 *
 * The soft-pity ramp is NOT published. The game states only the base rate, the
 * two pity thresholds, and an "overall probability (including guarantees)" — and
 * that last figure is enough to pin the ramp down. We model it as a straight
 * line from the base rate to 100% spread evenly across the soft-pity window,
 * which reproduces both published overall rates to the digit they're shown at:
 *
 *   Doll   0.6% base, ramp over pulls 59–80  →  1.888% (game says 1.89%)
 *   Weapon 0.7% base, ramp over pulls 51–70  →  2.176% (game says 2.18%)
 *
 * That works out to about +4.5pp per pull for dolls and +5.0pp for weapons.
 * Community calculators tend to hard-code a flat +5pp for both; that is right
 * for weapons but puts dolls at 1.895% (rounds to 1.90%, not the stated 1.89%)
 * and only reaches 100% on pull 78 rather than the documented 80. Solving the
 * published rate for the step independently bounds it to [4.33pp, 4.99pp] for
 * dolls and [4.94pp, 5.53pp] for weapons, so the even-fill values sit inside
 * both bands while a flat 5pp does not fit the doll banner.
 *
 * We deliberately model only Elite (5★) odds. The 10-access Standard guarantee
 * is a separate, independent counter that doesn't touch the Elite rate, and
 * ticket/currency costs vary by shop and event.
 */

/** One recruitment banner's Elite (5★) rules. */
export interface BannerConfig {
  key: 'doll' | 'weapon';
  /** Display name of the banner. */
  label: string;
  /** What a single Elite drop is called ("Elite Doll" / "Elite Weapon"). */
  eliteLabel: string;
  /** Base per-pull chance of an Elite, before soft pity. */
  baseRate: number;
  /**
   * First pull number whose rate is boosted. The game words this as "no Elite
   * after N consecutive accesses", so the boost lands on pull N+1 — and it lands
   * as a full step up, not a ramp easing in from zero.
   */
  softPityStart: number;
  /** Pull number at which an Elite is guaranteed (rate reaches 100%). */
  hardPity: number;
  /** Chance an Elite is the featured one, when not already on a guarantee. */
  featuredChance: number;
  /** Copies of the featured unit that max it out (V6 for dolls, R6 for weapons). */
  maxCopies: number;
  /** Prefix for dupe tiers: "V" for dolls, "R" for weapons. */
  copyTierPrefix: string;
  /** Tier number a single copy is called — dolls start at V0, weapons at R1. */
  copyTierBase: number;
}

/**
 * Featured-Doll banner: 0.6% base, soft pity from 59, guaranteed by 80, 50/50.
 * Seven copies max the doll out, since the first copy is V0 and dupes run to V6.
 */
export const DOLL_BANNER: BannerConfig = {
  key: 'doll',
  label: 'Doll banner',
  eliteLabel: 'Elite Doll',
  baseRate: 0.006,
  softPityStart: 59,
  hardPity: 80,
  featuredChance: 0.5,
  maxCopies: 7,
  copyTierPrefix: 'V',
  copyTierBase: 0,
};

/**
 * Featured-Weapon banner: 0.7% base, soft pity from 51, guaranteed by 70, 75/25.
 * Six copies max the weapon out — the first copy is R1 and dupes run to R6.
 */
export const WEAPON_BANNER: BannerConfig = {
  key: 'weapon',
  label: 'Weapon banner',
  eliteLabel: 'Elite Weapon',
  baseRate: 0.007,
  softPityStart: 51,
  hardPity: 70,
  featuredChance: 0.75,
  maxCopies: 6,
  copyTierPrefix: 'R',
  copyTierBase: 1,
};

export const BANNERS: Record<BannerConfig['key'], BannerConfig> = {
  doll: DOLL_BANNER,
  weapon: WEAPON_BANNER,
};

/** Community name for the tier reached at `copies` copies, e.g. "V2" / "R3". */
export function copyTierLabel(banner: BannerConfig, copies: number): string {
  return `${banner.copyTierPrefix}${banner.copyTierBase + copies - 1}`;
}

/**
 * Rate increase per pull while soft pity is active: the gap from the base rate
 * up to 100%, divided evenly across the pulls in the soft-pity window.
 */
export function softPityStep(banner: BannerConfig): number {
  const window = banner.hardPity - banner.softPityStart + 1;
  return (1 - banner.baseRate) / window;
}

/**
 * Per-pull Elite chance given `pity` consecutive pulls since the last Elite.
 * `pity` is the count BEFORE this pull, so this pull is number `pity + 1`.
 */
export function eliteRateAt(pity: number, banner: BannerConfig): number {
  const pull = Math.max(0, Math.trunc(pity)) + 1;
  if (pull >= banner.hardPity) {
    return 1;
  }
  if (pull < banner.softPityStart) {
    return banner.baseRate;
  }
  const steps = pull - banner.softPityStart + 1;
  return Math.min(1, banner.baseRate + softPityStep(banner) * steps);
}

/**
 * The full rate curve for a banner, index 0 = first pull … index hardPity-1 =
 * the guaranteed pull. Handy for tests and for rendering the ramp.
 */
export function rateCurve(banner: BannerConfig): number[] {
  return Array.from({ length: banner.hardPity }, (_, i) =>
    eliteRateAt(i, banner)
  );
}

/** Mean pulls until the next Elite of any kind, starting from `fromPity`. */
export function meanPullsToElite(banner: BannerConfig, fromPity = 0): number {
  const start = clampPity(fromPity, banner);
  let survive = 1;
  let expected = 0;
  for (let pity = start; pity < banner.hardPity; pity++) {
    const rate = eliteRateAt(pity, banner);
    expected += survive * rate * (pity - start + 1);
    survive *= 1 - rate;
  }
  return expected;
}

/**
 * Mean pulls between Elites starting from zero pity — i.e. the reciprocal of the
 * game's published "overall probability (including guarantees)".
 */
export function meanPullsPerElite(banner: BannerConfig): number {
  return meanPullsToElite(banner, 0);
}

/** The published "overall probability (including guarantees)" for a banner. */
export function overallEliteRate(banner: BannerConfig): number {
  return 1 / meanPullsPerElite(banner);
}

/** Where a pull plan starts from: pity carried in, and whether 50/50 is armed. */
export interface PityState {
  /** Consecutive pulls since your last Elite (default 0). */
  pity?: number;
  /** True if your last Elite was off-banner, so the next one must be featured. */
  guaranteed?: boolean;
}

/**
 * Mean pulls to collect `copies` copies of the featured unit.
 *
 * Closed form rather than a simulation. Landing one featured copy from a clean
 * slate costs one Elite outright with probability `featuredChance`, or two when
 * the first goes off-banner and arms the guarantee — so it averages
 * `m · (2 - featuredChance)` pulls, where `m` is the mean pulls per Elite.
 * Winning the featured roll leaves you back at zero pity with no guarantee, so
 * every copy after the first costs that same amount, and only the first copy
 * sees any benefit from carried-in pity or an already-armed guarantee.
 */
export function meanPullsToFeatured(
  banner: BannerConfig,
  copies: number,
  state: PityState = {}
): number {
  const k = Math.max(1, Math.trunc(copies));
  const guaranteed = state.guaranteed ?? false;
  const perElite = meanPullsPerElite(banner);
  const perCopy = perElite * (2 - banner.featuredChance);
  const firstCopy =
    meanPullsToElite(banner, state.pity ?? 0) +
    (guaranteed ? 0 : (1 - banner.featuredChance) * perElite);
  return firstCopy + (k - 1) * perCopy;
}

/**
 * Pulls that collect `copies` featured copies even with the worst luck possible:
 * every Elite arrives at hard pity, and every unguaranteed one goes off-banner.
 */
export function worstCasePullsToFeatured(
  banner: BannerConfig,
  copies: number,
  state: PityState = {}
): number {
  const k = Math.max(1, Math.trunc(copies));
  const pity = clampPity(state.pity ?? 0, banner);
  const guaranteed = state.guaranteed ?? false;
  const firstCopy = banner.hardPity - pity + (guaranteed ? 0 : banner.hardPity);
  return firstCopy + (k - 1) * 2 * banner.hardPity;
}

/** A parsed "V6" / "R3" dupe target. `prefix` is null when only a number was given. */
export interface CopyTarget {
  prefix: 'V' | 'R' | null;
  tier: number;
}

/**
 * Parse community dupe shorthand: "V6", "v6", "R3", or a bare "6". "C" is
 * accepted as an alias for "R" — older tools called weapon dupes calibrations.
 */
export function parseCopyTarget(input: string): CopyTarget | null {
  const match = /^([vrc])?\s*(\d{1,2})$/i.exec(input.trim());
  if (!match) {
    return null;
  }
  const raw = match[1]?.toUpperCase();
  const prefix = raw === 'C' ? 'R' : ((raw ?? null) as 'V' | 'R' | null);
  return { prefix, tier: Number(match[2]) };
}

/**
 * Copies needed to reach a banner's dupe `tier` (V0 = 1 copy, R1 = 1 copy), or
 * null when the tier doesn't exist on that banner.
 */
export function copiesForTier(
  banner: BannerConfig,
  tier: number
): number | null {
  const copies = tier - banner.copyTierBase + 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > banner.maxCopies) {
    return null;
  }
  return copies;
}

/** Inputs to {@link summarizePulls}; everything but the pull count is optional. */
export interface PullsOptions {
  /** Which banner's rules to apply (default {@link DOLL_BANNER}). */
  banner?: BannerConfig;
  /** Consecutive pulls since your last Elite (default 0). */
  pity?: number;
  /** True if your last Elite was off-banner, so the next one must be featured. */
  guaranteed?: boolean;
  /** Highest copy count to report (default: the banner's own max). */
  maxCopies?: number;
}

/** A ready-to-render summary of what a planned number of pulls yields. */
export interface PullsSummary {
  pulls: number;
  banner: BannerConfig;
  /** Pity the plan started from, after clamping. */
  pity: number;
  guaranteed: boolean;
  maxCopies: number;
  /** Expected Elites of any kind, featured or off-banner. */
  expectedElites: number;
  /** Chance of landing at least one Elite of any kind. */
  eliteAtLeastOne: number;
  /** Expected copies of the FEATURED unit specifically. */
  expectedFeatured: number;
  /** featuredAtLeast[i] = P(at least i+1 featured copies); length === maxCopies. */
  featuredAtLeast: number[];
  /** Pulls that guarantee a first featured copy even with worst-case luck. */
  worstCaseFeatured: number;
}

/**
 * Walk the pity chain over `pulls` accesses and report Elite and featured-copy
 * odds. State is (pity, guaranteed, featured copies): each pull either misses
 * (pity + 1) or lands an Elite (pity resets), and that Elite is featured either
 * by the banner's featured chance or automatically when the guarantee is armed.
 *
 * Copies saturate at `maxCopies` — that keeps the state space small without
 * distorting any reported "≥ k" figure, and `expectedFeatured` is accumulated
 * from the transitions themselves so saturation doesn't truncate it either.
 * Negative/NaN `pulls` are treated as 0.
 */
export function summarizePulls(
  pulls: number,
  opts: PullsOptions = {}
): PullsSummary {
  const banner = opts.banner ?? DOLL_BANNER;
  const n = asPullCount(pulls);
  const pity = clampPity(opts.pity ?? 0, banner);
  const guaranteed = opts.guaranteed ?? false;
  const maxCopies = Math.max(
    1,
    Math.min(banner.maxCopies, Math.trunc(opts.maxCopies ?? banner.maxCopies))
  );

  const pityStates = banner.hardPity;
  const copyStates = maxCopies + 1;
  const index = (p: number, g: number, c: number): number =>
    (p * 2 + g) * copyStates + c;

  let current = new Float64Array(pityStates * 2 * copyStates);
  let next = new Float64Array(current.length);
  current[index(pity, guaranteed ? 1 : 0, 0)] = 1;

  let expectedElites = 0;
  let expectedFeatured = 0;
  let noElite = 1;

  for (let step = 0; step < n; step++) {
    next.fill(0);
    for (let p = 0; p < pityStates; p++) {
      const rate = eliteRateAt(p, banner);
      for (let g = 0; g < 2; g++) {
        for (let c = 0; c < copyStates; c++) {
          const mass = current[index(p, g, c)] ?? 0;
          if (mass === 0) {
            continue;
          }
          // Miss. rate is exactly 1 on the hard-pity pull, so p + 1 stays in range.
          if (rate < 1) {
            const to = index(p + 1, g, c);
            next[to] = (next[to] ?? 0) + mass * (1 - rate);
          }
          const hit = mass * rate;
          if (hit === 0) {
            continue;
          }
          expectedElites += hit;
          // An armed guarantee makes this Elite featured with certainty.
          const featured = g === 1 ? hit : hit * banner.featuredChance;
          const offBanner = hit - featured;
          expectedFeatured += featured;
          if (featured > 0) {
            const to = index(0, 0, Math.min(c + 1, maxCopies));
            next[to] = (next[to] ?? 0) + featured;
          }
          if (offBanner > 0) {
            const to = index(0, 1, c);
            next[to] = (next[to] ?? 0) + offBanner;
          }
        }
      }
    }
    [current, next] = [next, current];
    noElite *= 1 - eliteRateAt(pity + step, banner);
  }

  // Marginalise pity and the guarantee flag out, leaving the copy distribution.
  const copyDist = new Array<number>(copyStates).fill(0);
  for (let p = 0; p < pityStates; p++) {
    for (let g = 0; g < 2; g++) {
      for (let c = 0; c < copyStates; c++) {
        copyDist[c] = (copyDist[c] ?? 0) + (current[index(p, g, c)] ?? 0);
      }
    }
  }
  const featuredAtLeast: number[] = [];
  for (let k = 1; k <= maxCopies; k++) {
    let tail = 0;
    for (let c = k; c < copyStates; c++) {
      tail += copyDist[c] ?? 0;
    }
    featuredAtLeast.push(clampProb(tail));
  }

  // Worst case: ride to hard pity, lose the featured roll, then ride again.
  const worstCaseFeatured = worstCasePullsToFeatured(banner, 1, {
    pity,
    guaranteed,
  });

  return {
    pulls: n,
    banner,
    pity,
    guaranteed,
    maxCopies,
    expectedElites,
    eliteAtLeastOne: clampProb(1 - noElite),
    expectedFeatured,
    featuredAtLeast,
    worstCaseFeatured,
  };
}

/** Coerce a pull count to a non-negative integer; non-finite/negative → 0. */
function asPullCount(pulls: number): number {
  return Number.isFinite(pulls) && pulls > 0 ? Math.floor(pulls) : 0;
}

/** Clamp a pity counter into [0, hardPity - 1] — at hard pity it would reset. */
function clampPity(pity: number, banner: BannerConfig): number {
  if (!Number.isFinite(pity)) {
    return 0;
  }
  return Math.max(0, Math.min(banner.hardPity - 1, Math.trunc(pity)));
}

/** Clamp a probability into [0, 1], soaking up floating-point drift. */
function clampProb(p: number): number {
  return Math.max(0, Math.min(1, p));
}

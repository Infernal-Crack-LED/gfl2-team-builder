/**
 * Presentation layer for pull odds: how the numbers out of gacha.ts are
 * WORDED and ROUNDED, plus the mapping onto the pull infographic's card data.
 *
 * Everything that formats a pull probability lives here — the /pulls embed and
 * the rendered card both read from this module, so the same figure can never
 * come out as "63%" in one and "63.2%" in the other. gacha.ts stays pure math
 * and knows nothing about display.
 */
import {
  copyTierLabel,
  overallEliteRate,
  type BannerConfig,
  type PullsSummary,
} from './gacha.js';
import type { PullCardData } from '../../../infographics/core/pullCard.js';

/**
 * Per-banner tint: the site accent for dolls, amber for weapons. Hex strings
 * because the card draws with them; embeds go through
 * {@link bannerEmbedColor} rather than keeping a second copy of the values.
 */
export const BANNER_ACCENT: Record<BannerConfig['key'], string> = {
  doll: '#5b9dff',
  weapon: '#f4a72c',
};

/** The banner's accent as a Discord embed color integer. */
export function bannerEmbedColor(banner: BannerConfig): number {
  return Number.parseInt(BANNER_ACCENT[banner.key].slice(1), 16);
}

/** Format a per-pull rate as a percent, trimming a trailing ".0" (3% not 3.0%). */
export function ratePct(rate: number): string {
  const v = rate * 100;
  return `${Number.isInteger(v) ? v.toString() : v.toFixed(1)}%`;
}

/**
 * Format a 0-1 probability as a whole percent (e.g. "87%"). Rounding is held
 * back from the extremes: a merely-unlikely outcome must not print as a flat
 * "0%", and only a true certainty may print as "100%".
 */
export function pct0(p: number): string {
  if (p > 0 && p < 0.005) {
    return '<1%';
  }
  if (p < 1 && p >= 0.995) {
    return '>99%';
  }
  return `${Math.round(p * 100)}%`;
}

/** Format a 0-1 probability with one decimal (e.g. "98.3%"), same guards. */
export function pct1(p: number): string {
  if (p > 0 && p < 0.0005) {
    return '<0.1%';
  }
  if (p < 1 && p >= 0.9995) {
    return '>99.9%';
  }
  return `${(p * 100).toFixed(1)}%`;
}

/** One line describing where the plan starts from: pity and 50/50 state. */
export function startingState(
  banner: BannerConfig,
  guaranteed: boolean
): string {
  return guaranteed
    ? 'next Elite guaranteed featured'
    : `${pct0(banner.featuredChance)} featured on the next Elite`;
}

/**
 * A pull-odds summary as infographic card data. The card is deliberately
 * built from the SUMMARY rather than from raw options: the same Markov walk
 * feeds the embed, so the picture and the text can't disagree about what a
 * budget is worth.
 */
export function buildPullCardData(s: PullsSummary): PullCardData {
  const { banner } = s;
  const pullWord = s.pulls === 1 ? 'pull' : 'pulls';

  return {
    title: 'Pull Calculator',
    subtitle: `${s.pulls} ${pullWord} · ${banner.label} · pity ${s.pity} · ${startingState(banner, s.guaranteed)}`,
    accent: BANNER_ACCENT[banner.key],
    tiles: [
      // The headline is the question a budget is actually asked to answer —
      // "do I get her at all" — not the expected-value count beside it.
      {
        label: `1+ featured ${banner.key}`,
        value: pct1(s.featuredAtLeast[0] ?? 0),
        sub: `chance in ${s.pulls} ${pullWord}`,
        main: true,
      },
      {
        label: 'Expected copies',
        value: s.expectedFeatured.toFixed(1),
        sub: 'of the featured unit',
      },
      {
        label: `Any ${banner.eliteLabel}`,
        value: s.expectedElites.toFixed(1),
        sub: `expected · ${pct1(s.eliteAtLeastOne)} for 1+`,
      },
    ],
    rows: s.featuredAtLeast.map((p, i) => ({
      tier: copyTierLabel(banner, i + 1),
      copies: `${i + 1} cop${i === 0 ? 'y' : 'ies'}`,
      chance: pct1(p),
      p,
    })),
    meta:
      `Worst case ${s.worstCaseFeatured} pulls to a first copy · ` +
      `soft pity from ${banner.softPityStart}, guaranteed at ${banner.hardPity} · ` +
      `overall Elite rate ${(overallEliteRate(banner) * 100).toFixed(2)}%`,
    detail:
      `Tiers are cumulative — ${copyTierLabel(banner, 2)} includes everything above it. ` +
      `Odds walk the real pity chain: the ${ratePct(banner.baseRate)} rate ramps from ` +
      `pull ${banner.softPityStart}, and a lost featured roll makes the next Elite featured.`,
  };
}

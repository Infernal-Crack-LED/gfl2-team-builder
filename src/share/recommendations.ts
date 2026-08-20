/**
 * Community build recommendations, hydrated against the site's own game data.
 *
 * SOURCE: `data/recommendations-source.json`, parsed from the approved GFL2
 * Info Sheet workbook by the datamine repo and committed here. Read directly —
 * NOT through `doll_recommendations` / `/api/v1/rec-defaults`, which carry ids
 * only and drop the per-step `note` prose entirely. That prose is the reason
 * these pages are worth building, and a committed file is also the only source
 * a no-JS crawler body can render from without a database round-trip.
 *
 * NOT THE SITE'S OWN ANALYSIS. The sheet's maintainers granted this project
 * permission to use their work; that permission does not travel onward, which
 * is why `recommendations-source.json` is excluded from the repo's otherwise
 * unrestricted data reuse. Every rendering of this data must carry the credit —
 * see `RECOMMENDATION_CREDIT` and the tests that assert it is present.
 *
 * WHY HYDRATE: the sheet names a weapon or key as a bare string. Joined to
 * weapons.json / keys.json, that name becomes the weapon's real trait and
 * effect text and a link to its page. Half the roster has NO note prose at all
 * (31 of 62 dolls), so this join is what keeps their pages substantial rather
 * than a list of four names — the recommendation says what to build, and the
 * site's own data says what those things do.
 *
 * DEGRADES, NEVER GUESSES: a name that does not resolve is kept as plain text
 * rather than dropped or approximated, so the page still shows what the sheet
 * recommended even when the join misses.
 */

/** One vertical-investment step: "V2", with the sheet's explanation if any. */
export interface RecPathStep {
  step: string;
  note: string | null;
}

export interface RecAttachments {
  mainSet: string | null;
  setEffect: string | null;
  substats: string | null;
}

export interface RecKeys {
  primary: string[];
  alternatives: string[];
}

/** A block of free prose from the sheet's path cell, with the steps it names. */
export interface RecExplanationSource {
  text: string;
  refs?: string[] | null;
}

/** A raw row as it appears in data/recommendations-source.json. */
export interface RecommendationSource {
  path?: RecPathStep[] | null;
  explanation?: RecExplanationSource[] | null;
  weapons?: string[] | null;
  attachments?: Partial<RecAttachments> | null;
  keys?: Partial<RecKeys> | null;
}

/**
 * What a block of free prose IS. The sheet's authors prefix these by hand, and
 * the four kinds want four different treatments — a one-line verdict is not a
 * paragraph of rotation theory, and burying it as "prose" wastes the most
 * useful sentence on the page.
 */
export type RecExplanationKind =
  | 'verdict' // "Recommendation: V0 > V3" — where to stop investing
  | 'no-path' // "Being a 4* unit, she does not require a suggested path"
  | 'caveat' // "Disclaimer: ..." — a qualification on the advice
  | 'tip' // "TIP: ..." — mechanics, rotations, interactions
  | 'note'; // anything else the authors wrote

export interface RecExplanation {
  kind: RecExplanationKind;
  /** The block with its own label prefix removed — the label becomes UI. */
  text: string;
  /** Steps this block names, so it can be shown against them. */
  refs: string[];
}

// Spelling is as the authors typed it: both "Recommendation"/"Recomendation"
// and "Disclaimer"/"Disclamer" appear, so the patterns tolerate the variants
// rather than silently demoting a mis-typed block to an unlabelled note.
const VERDICT_RE = /^\s*recomm?[ae]nd[ae]tion\s*:\s*/i;
/*
 * The authors answer "what is her path?" with "she hasn't got one, and here is
 * why" — for a Standard unit, for one whose vertebrae are free, or for one with
 * no breakthrough worth chasing. That IS the section's content, so it stands in
 * for the step list rather than being filed away as a general note.
 */
const NO_PATH_RE = /\bdoes not require a suggested path\b/i;
const CAVEAT_RE = /^\s*disclai?mer\s*:\s*/i;
const TIP_RE = /^\s*tips?\s*:\s*/i;

/** Classify one prose block and strip the label it classified on. */
export function classifyExplanation(
  block: RecExplanationSource
): RecExplanation {
  const raw = (block.text ?? '').trim();
  const refs = (block.refs ?? []).filter(
    (r): r is string => typeof r === 'string' && r !== ''
  );
  if (NO_PATH_RE.test(raw)) {
    return { kind: 'no-path', text: raw, refs };
  }
  for (const [kind, re] of [
    ['verdict', VERDICT_RE],
    ['caveat', CAVEAT_RE],
    ['tip', TIP_RE],
  ] as const) {
    if (re.test(raw)) {
      return { kind, text: raw.replace(re, '').trim(), refs };
    }
  }
  return { kind: 'note', text: raw, refs };
}

/** A recommended thing after the join: a link when resolved, text when not. */
export interface RecLink {
  /** Exactly what the sheet said — always shown, resolved or not. */
  label: string;
  href: string | null;
  /** The site's own text for it (weapon trait, key effect). */
  detail: string | null;
  /** Secondary line: trait name, key slot. */
  meta: string | null;
  /** The sheet's own parenthetical aside, e.g. "Please get V6 first". */
  aside?: string | null;
  /**
   * Game art for the thing, as the URL appears in the data. Rendered through
   * <GameIcon>, which points it at the local mirror — never the CDN.
   */
  icon?: string | null;
}

export interface HydratedRecommendation {
  slug: string;
  path: RecPathStep[];
  /** True when at least one step carries prose. */
  hasNotes: boolean;
  /**
   * The steps worth rendering as a path: those the sheet actually explains.
   *
   * A step reaches `path` from either the marker row (a bare "V4" chip) or the
   * Explanation blob. A marker with no explanation is a breakpoint the authors
   * declared but never wrote up, and rendering it is a chip with nothing beside
   * it — so when a step has both, the explanation wins and the bare ones move
   * to `markerSteps` instead of being dropped outright.
   */
  explainedSteps: RecPathStep[];
  /** Declared breakpoints the sheet never explained — shown, but as a list. */
  markerSteps: string[];
  /** The one-line "where to stop" verdict, when the sheet states one. */
  verdict: RecExplanation | null;
  /** "Being a 4* unit, she does not require a suggested path" — stands in. */
  noPath: RecExplanation | null;
  /** Qualifications on the advice — shown with the path they qualify. */
  caveats: RecExplanation[];
  /** Everything else: mechanics, rotations, interactions. */
  notes: RecExplanation[];
  weapons: RecLink[];
  keys: { primary: RecLink[]; alternatives: RecLink[] };
  attachments: RecAttachments;
}

/**
 * The lookups the join needs, injected so this module stays pure and both the
 * server (data/*.json via gameData) and the client (web/src/data) can call it.
 */
export interface RecLookups {
  weaponByName: (name: string) => RecLink | null;
  keyByLabel: (label: string) => RecLink | null;
  /**
   * This doll's signature weapon, for the fallback below. Optional: a caller
   * that cannot supply one just gets plain text for unresolved names.
   */
  signatureWeapon?: () => RecLink | null;
}

// --- Sheet-side name reconciliation -----------------------------------------
// Lives here rather than in import-recommendations.ts because there are now two
// consumers of the same sheet: the DB import and the build pages. One table, so
// a name the importer resolves is one the page resolves too.

/** Case- and punctuation-insensitive key for matching sheet spellings. */
export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Known sheet-side spellings, maintainer-confirmed. Anything not listed stays
 * UNRESOLVED and renders as plain text — never fuzzy-matched, because a wrong
 * weapon silently attributed to the maintainers is worse than an unlinked name.
 */
export const WEAPON_ALIASES: [string, string][] = [
  ['Crowned Jackelope', 'Crowned Jackalope'],
  ['AK-15', '6P71'], // Voymastina's sig
  ["Themis' Game", 'Silent Sanction'], // Welrod's sig
  ['Dazzling Sparkles', 'Sparkling Centerstage'], // Yoohee's sig
  ['Law of Causality', 'Cause and Effect'], // Phaetusa's sig, via Sextans' tab
  ['Echoes of Sorrow', "Banshee's Whisper"], // maintainer-confirmed, Cheeta's tab
];

/** Known sheet-side shorthand for attachment set names. */
export const SET_ALIASES: [string, string][] = [
  ['Allay Support', 'Ally Support'],
  ['Summon', 'Summon Boost'],
  ['Elec boost', 'Electric Boost'],
];

/**
 * The sheet appends editorial asides to a name — "Skylla (Please get V6
 * first)". Strip the parenthetical for matching, but KEEP it for display: it
 * is the maintainers' advice, and dropping it would silently edit them.
 */
export function splitAside(raw: string): {
  name: string;
  aside: string | null;
} {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw.trim());
  if (!m || !m[1]) {
    return { name: raw.trim(), aside: null };
  }
  return { name: m[1].trim(), aside: (m[2] ?? '').trim() || null };
}

/** Shown wherever recommendations are rendered. Not optional — see the header. */
export const RECOMMENDATION_CREDIT = {
  lead: 'These recommendations are compiled by the GFL2 Info Sheet community maintainers.',
  sheetUrl:
    'https://docs.google.com/spreadsheets/d/1DogyU3K7ZXw2qbhP1EhRXIAw5nCyIV5G5e-QWviBZME/edit?usp=sharing',
  sheetName: 'GFL2 Info Sheet',
} as const;

function textOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
}

/** An unresolved name: still shown, just without a link or detail text. */
function plain(label: string): RecLink {
  return { label, href: null, detail: null, meta: null };
}

export function hydrateRecommendation(
  slug: string,
  source: RecommendationSource | undefined,
  lookups: RecLookups
): HydratedRecommendation | null {
  if (!source) {
    return null;
  }

  const path = (Array.isArray(source.path) ? source.path : [])
    .filter((s): s is RecPathStep => typeof s?.step === 'string')
    .map((s) => ({ step: s.step, note: textOrNull(s.note) }));

  // Split the sheet's aside off before matching, then put it back: "Skylla
  // (Please get V6 first)" must resolve to Skylla AND still say "please get V6
  // first", which is the maintainers' advice and not ours to drop.
  const rawWeapons = strings(source.weapons).map((raw) => {
    const { name, aside } = splitAside(raw);
    return { name, aside, link: lookups.weaponByName(name) };
  });

  /*
   * Signature-weapon fallback, matching import-recommendations.ts: the sheet
   * routinely lists a doll's own signature under a fan or pre-release name
   * ("Tidal Nocturne" for Nighttide Nocturne, "Fluffy Nova" for Nova
   * Chinchilla). Maintainer-confirmed as a pattern, so an unresolved token
   * falls back to this doll's sig — but ONLY once, and only when the sig is
   * not already among the resolved picks, which is what keeps it from
   * swallowing a genuinely unknown second name.
   *
   * The resolved weapon's real name is what shows, with the sheet's spelling
   * noted beside it: silently relabelling the maintainers' pick would be the
   * one thing worse than not linking it.
   */
  const resolvedHrefs = new Set(
    rawWeapons.map((w) => w.link?.href).filter((h): h is string => !!h)
  );
  let sigUsed = false;
  const weapons = rawWeapons.map(({ name, aside, link }) => {
    let resolved = link;
    if (!resolved && !sigUsed) {
      const sig = lookups.signatureWeapon?.() ?? null;
      if (sig && (!sig.href || !resolvedHrefs.has(sig.href))) {
        sigUsed = true;
        resolved = { ...sig, meta: sig.meta, aside: `listed as “${name}”` };
        if (sig.href) {
          resolvedHrefs.add(sig.href);
        }
      }
    }
    const out = resolved ?? plain(name);
    return aside
      ? { ...out, aside: [out.aside, aside].filter(Boolean).join(' · ') }
      : out;
  });

  const keyLinks = (labels: string[]): RecLink[] =>
    labels.map((label) => lookups.keyByLabel(label) ?? plain(label));

  const attachments: RecAttachments = {
    mainSet: textOrNull(source.attachments?.mainSet),
    setEffect: textOrNull(source.attachments?.setEffect),
    substats: textOrNull(source.attachments?.substats),
  };

  // Free prose, split by what it is. The verdict is a single line the authors
  // write at most once; a second one would mean the sheet changed shape, so
  // keep the first and let the rest fall through as notes rather than
  // silently dropping one.
  const classified = (source.explanation ?? [])
    .filter((b): b is RecExplanationSource => typeof b?.text === 'string')
    .map(classifyExplanation)
    .filter((b) => b.text !== '');
  let verdict: RecExplanation | null = null;
  let noPath: RecExplanation | null = null;
  const caveats: RecExplanation[] = [];
  const notes: RecExplanation[] = [];
  for (const block of classified) {
    if (block.kind === 'no-path' && noPath === null) {
      noPath = block;
    } else if (block.kind === 'verdict' && verdict === null) {
      verdict = block;
    } else if (block.kind === 'caveat') {
      caveats.push(block);
    } else {
      notes.push(block);
    }
  }

  const hydrated: HydratedRecommendation = {
    slug,
    path,
    hasNotes: path.some((s) => s.note !== null),
    explainedSteps: path.filter((s) => s.note !== null),
    markerSteps: path.filter((s) => s.note === null).map((s) => s.step),
    verdict,
    noPath,
    caveats,
    notes,
    weapons,
    keys: {
      primary: keyLinks(strings(source.keys?.primary)),
      alternatives: keyLinks(strings(source.keys?.alternatives)),
    },
    attachments,
  };

  // A row with nothing in any section is not a recommendation — better to show
  // no panel than an empty one with a credit line attached to nothing.
  const empty =
    hydrated.path.length === 0 &&
    verdict === null &&
    noPath === null &&
    caveats.length === 0 &&
    notes.length === 0 &&
    hydrated.weapons.length === 0 &&
    hydrated.keys.primary.length === 0 &&
    hydrated.keys.alternatives.length === 0 &&
    attachments.mainSet === null &&
    attachments.substats === null;
  return empty ? null : hydrated;
}

/**
 * The sheet labels a fixed key as "Fixed Key 2 - Logistics Specialist" — slot
 * number and name in one string. Split so a caller can match on either half.
 */
export function parseKeyLabel(label: string): {
  slot: number | null;
  name: string;
} {
  const m = /^\s*Fixed\s+Key\s+(\d+)\s*(?:-\s*(.*))?$/i.exec(label);
  if (!m) {
    return { slot: null, name: label.trim() };
  }
  return {
    slot: Number(m[1]),
    name: (m[2] ?? '').trim(),
  };
}

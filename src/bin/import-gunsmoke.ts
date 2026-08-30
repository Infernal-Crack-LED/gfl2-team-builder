/**
 * Import per-doll Gunsmoke Frontline guides (rotations + fixed/common key
 * picks) into `doll_gunsmoke_guides`, parsed live from the community
 * "GFL2 EN Gunsmoke Frontline Doll Info" sheet.
 *
 *   npm run import:gunsmoke                        # dry run (default)
 *   npm run import:gunsmoke -- --execute           # upsert
 *   npm run import:gunsmoke -- --doll tololo       # one doll only (by slug)
 *   npm run import:gunsmoke -- --force             # overwrite 'manual' rows too
 *   npm run import:gunsmoke -- --out scratchpad/gunsmoke-guides.json
 *   npm run import:gunsmoke -- --data <dir>   # resolve against other artifacts
 *
 * Name → id resolution runs against the committed data/*.json (the same
 * artifacts the server reads). Fixed keys resolve by TITLE within the doll's
 * own keys — the sheet's "Fixed Key N" numbering does not match our keys
 * table. Common-key entries that name a doll resolve to that doll's Common
 * Key; stat shorthand ("crit/cdmg/atk", "5% atk", "Any") is kept as a raw
 * label with keyId null. Anything unresolvable is REPORTED, not guessed;
 * hand-edited rows should set source='manual', which re-imports skip unless
 * --force.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dollGunsmokeGuides } from '../db/schema.js';
import { fetchGunsmokeGuides } from '../sync/gunsmoke-sheet.js';

// --- Committed game data (the same artifacts the server reads) --------------

interface DollEntry {
  id: string;
  name: string;
  slug: string;
}
interface KeyEntry {
  id: string;
  displayTitle: string | null;
  keyType: string | null;
  dollId: string | null;
}

// --data <dir> points name resolution at a different artifact set.
const dataIdx = process.argv.indexOf('--data');
const DATA_DIR =
  dataIdx >= 0 && process.argv[dataIdx + 1]
    ? path.resolve(process.argv[dataIdx + 1] as string)
    : path.resolve('data');

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf8')) as T;
}

const { dolls } = loadJson<{ dolls: DollEntry[] }>('dolls.json');
const { keys } = loadJson<{ keys: KeyEntry[] }>('keys.json');

/** Loose name equality: case/punctuation/whitespace-insensitive. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const dollByNorm = new Map(dolls.map((d) => [norm(d.name), d]));

/** Sheet-side shorthand for doll names in common-key lists. Anything not
 * listed here stays UNRESOLVED and is reported — never fuzzy-matched. */
const COMMON_KEY_DOLL_ALIASES: [string, string][] = [
  ['Dush', 'Dushevnaya'],
  ['Chey', 'Cheyanne'],
  ['QJ', 'Qiongjiu'],
  ['Maki', 'Makiatto'],
  ['Mosin', 'Mosin-Nagant'],
  ['Sharky', 'Sharkry'],
  ['Shakry', 'Sharkry'],
  ['Shrakry', 'Sharkry'],
  ['Ulrid', 'Ullrid'],
  ['Qiuhia', 'Qiuhua'],
  ['Bathilde', 'Balthilde'],
  ['Haprsy', 'Harpsy'],
  ['PPSh', 'Papasha'],
  ['YH', 'Yoohee'],
  ['SF', 'Springfield'],
  ['QH', 'Qiuhua'],
  ['Colphine', 'Colphne'],
  ['Centauressi', 'Centaureissi'],
];
for (const [alias, canonical] of COMMON_KEY_DOLL_ALIASES) {
  const target = dollByNorm.get(norm(canonical));
  if (target) {
    dollByNorm.set(norm(alias), target);
  }
}

/** Fixed-key title drift: the sheet uses community CN→EN translations that
 * predate our official EN display titles. Per-doll sheet title → data title,
 * matched by comparing the sheet's effect description against each candidate
 * key's effect text. Same shape as the weapon alias table in
 * import-recommendations.ts: unlisted titles stay UNRESOLVED, never guessed.
 * (Jiangyu is deliberately absent — her fixed keys in data/keys.json carry
 * Lenna's effect texts, so there is nothing safe to map to.)
 *
 * Keys are normally the sheet title; two lookups need the sheet SLOT to
 * disambiguate and are keyed "Slot|Title":
 *  - lotta: the sheet titles BOTH Fixed Key 2 and 3 "Confidence Booster"
 *    (copy-paste typo); FK3's description is Trembling Aim's effect.
 *  - zhaohui: her conditional Fixed Key 6 has an EMPTY title cell; its
 *    description matches Dry Humor. Also, her sheet FK2 "Light of Justice"
 *    is the community title of the key officially named "Detest Evil" — an
 *    exact-title match would wrongly hit her other key "Light of Justice". */
const FIXED_KEY_ALIASES: Record<string, Record<string, string>> = {
  robella: { 'Worse Than a Dinergate': 'Less Than A Dinergate' },
  lainie: {
    "Partner's Return": "Friend's Return",
    'Power of OGAS': "OGAS' Might",
  },
  lotta: { 'Fixed Key 3|Confidence Booster': 'Trembling Aim' },
  zhaohui: {
    'Light of Justice': 'Detest Evil',
    'Fixed Key 6|': 'Dry Humor',
  },
  voymastina: {
    'Isolated Execution': 'Solo Kill',
    'Apex Predator': 'Lordslayer',
    'Scars Bring Strength': 'Scars Are Power',
    'Global Hunt': 'All-Range Predation',
  },
  lewis: {
    'The Secret to Spreading Smiles': 'Secret of Spreading Smiles',
    'Whimsical Optimist': 'Sunny Imagination',
    'Guardian from Above': 'Guardian From The Cloud',
    'Protecting the Innocent Heart': 'Protector of Innocence',
  },
  phaetusa: {
    'Wandering Resolve': 'Wandering Will',
    'Executor’s Resolve': 'Fatal Bladebearer',
    'Cold Bloodline': 'Cold-Blooded Pulse',
    'Domain Master': 'Domain Mistress',
  },
  cheyanne: {
    'Mental Resilience': 'Psychological Resilience',
    'Full Attention': 'Total Focus',
    'The Free Me': 'Liberated Self',
  },
  liushih: {
    'Perfect Synergy': 'Mutual Complementation',
    Deadeye: 'Distant Precision',
    'Rallying Cry': 'Jumping at the Call',
    'No Expense Spared': 'Generous Disbursement',
  },
  'ots-14': {
    'Thirst for Destruction': 'Destructive Desire',
    'Perfect Battle Plan': 'Perfect Plan',
    "Predator's Stride": "Plunderer's Pace",
  },
  'nemesis-gnosis': {
    'Return Anchor': 'Homeward Anchor',
    'Blessings of Nirvana': 'Blessing of Nirvana',
    'Immune Bloodline': 'Immunosome Bloodline',
    "Prophet's Soliloquy": 'Prescient COnfession', // (sic) — typo is upstream in data/keys.json
  },
  soppo: {
    'Unbridled Bloodlust': 'Unfettered Bloodlust',
    'Pack Synergy': 'Group Coordination',
    'Wanna Get Bitten Again?': 'Beware Of Sopdog',
  },
  vepley: { 'Safe Distance viewing': 'Safe Viewing Distance' },
  belka: { 'Decisive Assessment': 'Deciding Motive' },
  sakura: {
    'One-Track Minded': 'Hard Work and Guts',
    'Jinxed Constitution': 'Jinxed by Nature',
    'Apologies Must Be Sincere': 'Apologize From the Heart',
  },
  harpsy: { 'Gathering Courage': 'Gathered Courage' },
  balthilde: { 'Poor Communication': 'Cannot Spit It Out' },
  springfield: { 'Behind the Smile': 'Behind Her Smile' },
  loreley: {
    'Enchanting Dreams': 'Enchanting Dream',
    'Angelic Tenderness': "Angel's Kindness",
  },
  sextans: {
    'Withering Oat': 'Withered Covenant',
    "Black Swan's Feather": 'Black Swan Feather',
    'Silent Inscription': 'Hushed Inscription',
    'Red Velvet Curtain': 'Red Velvet Canopy',
  },
  helen: {
    'Cold Bloom': 'Icy Blossom',
    'Maternal Radiance': 'Motherly Glow',
  },
};

const keysByDoll = new Map<string, KeyEntry[]>();
for (const k of keys) {
  if (!k.dollId) {
    continue;
  }
  const list = keysByDoll.get(k.dollId) ?? [];
  list.push(k);
  keysByDoll.set(k.dollId, list);
}

/** The sheet appends region markers to some titles ("Return Anchor\nCN"). */
function cleanTitle(title: string): string {
  return (title.split('\n')[0] ?? '').trim();
}

function resolveFixedKey(
  doll: DollEntry,
  slot: string,
  title: string
): KeyEntry | null {
  const own = keysByDoll.get(doll.id) ?? [];
  const cleaned = cleanTitle(title);
  const aliases = FIXED_KEY_ALIASES[doll.slug];
  const want = norm(
    aliases?.[`${slot}|${cleaned}`] ?? aliases?.[cleaned] ?? cleaned
  );
  return (
    own.find(
      (k) => k.keyType === 'Fixed Key' && norm(k.displayTitle ?? '') === want
    ) ?? null
  );
}

/** A common-key label naming a doll resolves to that doll's Common Key.
 * Trailing commentary ("Dush (w/ mechty)") is stripped first. */
function resolveCommonKey(label: string): KeyEntry | null {
  const name = label.replace(/\s*\(.*\)\s*$/, '');
  const doll = dollByNorm.get(norm(name));
  if (!doll) {
    return null;
  }
  return (
    (keysByDoll.get(doll.id) ?? []).find((k) => k.keyType === 'Common Key') ??
    null
  );
}

interface ResolvedCommonKey {
  label: string;
  keyId: string | null;
}

function resolveCommonKeys(labels: string[]): ResolvedCommonKey[] {
  return labels.map((label) => ({
    label,
    keyId: resolveCommonKey(label)?.id ?? null,
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const force = args.includes('--force');
  const dollIdx = args.indexOf('--doll');
  const only = dollIdx >= 0 ? args[dollIdx + 1] : null;
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

  console.log('Fetching Gunsmoke Frontline sheet…');
  const guides = await fetchGunsmokeGuides();
  console.log(`Parsed ${guides.length} doll blocks from the sheet.`);

  const manualSlugs = new Set<string>(
    (
      await db
        .select({ slug: dollGunsmokeGuides.dollSlug })
        .from(dollGunsmokeGuides)
        .where(sql`source = 'manual'`)
    ).map((r) => r.slug)
  );

  let written = 0;
  const needsReview: string[] = [];
  const dump: Record<string, unknown> = {};

  for (const guide of guides) {
    const doll = dollByNorm.get(norm(guide.sheetName));
    if (!doll) {
      console.log(
        `${guide.sheetName}: no such doll in data/dolls.json — skipped`
      );
      needsReview.push(guide.sheetName);
      continue;
    }
    if (only && doll.slug !== only) {
      continue;
    }

    const fixedKeys = guide.fixedKeys.map((k) => ({
      slot: k.slot,
      title: cleanTitle(k.title),
      description: k.description,
      tier: k.tier,
      condition: k.condition,
      keyId: resolveFixedKey(doll, k.slot, k.title)?.id ?? null,
    }));
    const commonKeys = {
      note: guide.commonKeys.note,
      bestInSlot: resolveCommonKeys(guide.commonKeys.bestInSlot),
      goodAlternatives: resolveCommonKeys(guide.commonKeys.goodAlternatives),
      conditional: resolveCommonKeys(guide.commonKeys.conditional),
    };

    const unresolvedFixed = fixedKeys.filter((k) => !k.keyId);
    const unresolvedCommon = [
      ...commonKeys.bestInSlot,
      ...commonKeys.goodAlternatives,
      ...commonKeys.conditional,
    ].filter((k) => !k.keyId);

    console.log(
      `${doll.slug} (${guide.classTab}): ${fixedKeys.length} fixed ` +
        `(${fixedKeys.filter((k) => k.tier === 'conditional').length} conditional), ` +
        `common [${commonKeys.bestInSlot.length} BiS / ${commonKeys.goodAlternatives.length} alt` +
        ` / ${commonKeys.conditional.length} cond], ${guide.rotations.length} rotations` +
        (unresolvedFixed.length
          ? `  UNRESOLVED FIXED: ${unresolvedFixed.map((k) => k.title).join('; ')}`
          : '') +
        (unresolvedCommon.length
          ? `  COMMON LABELS: ${unresolvedCommon.map((k) => k.label).join('; ')}`
          : '')
    );
    if (unresolvedFixed.length) {
      needsReview.push(doll.slug);
    }
    // Unresolved common-key labels that look like a doll name (no digits,
    // no '/', not the "Any…" shorthand) are probable typos the alias table
    // missed — surface them instead of lumping them in with stat shorthand.
    const suspiciousCommon = unresolvedCommon.filter(
      (k) => !/[\d/]/.test(k.label) && !/^any\b/i.test(k.label)
    );
    if (suspiciousCommon.length) {
      needsReview.push(
        `${doll.slug} (common: ${suspiciousCommon.map((k) => k.label).join('; ')})`
      );
    }

    dump[doll.slug] = {
      sheetName: guide.sheetName,
      classTab: guide.classTab,
      fixedKeys,
      commonKeys,
      rotations: guide.rotations,
    };

    if (!execute) {
      if (manualSlugs.has(doll.slug) && !force) {
        console.log(`  ↳ would skip on --execute (manual row)`);
      }
      continue;
    }
    if (manualSlugs.has(doll.slug) && !force) {
      console.log(`  ↳ skipped (manual row; use --force to overwrite)`);
      continue;
    }
    await db
      .insert(dollGunsmokeGuides)
      .values({
        dollSlug: doll.slug,
        classTab: guide.classTab,
        fixedKeys,
        commonKeys,
        rotations: guide.rotations,
        source: 'sheet',
      })
      .onConflictDoUpdate({
        target: dollGunsmokeGuides.dollSlug,
        set: {
          classTab: sql`excluded.class_tab`,
          fixedKeys: sql`excluded.fixed_keys`,
          commonKeys: sql`excluded.common_keys`,
          rotations: sql`excluded.rotations`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
      });
    written++;
  }

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(dump, null, 2) + '\n');
    console.log(`\nWrote parsed guides to ${outPath}`);
  }
  console.log(
    `\n${execute ? `Upserted ${written} rows.` : 'Dry run — nothing written.'}`
  );
  if (needsReview.length > 0) {
    console.log(
      `Needs manual review (${needsReview.length}): ${needsReview.join(', ')}`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

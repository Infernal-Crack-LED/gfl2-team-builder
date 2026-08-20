/**
 * Import per-doll recommendation defaults into `doll_recommendations` from
 * the committed in-house source file `data/recommendations-source.json`.
 *
 *   npm run import:recs                        # dry run (default) — write nothing
 *   npm run import:recs -- --execute           # upsert
 *   npm run import:recs -- --doll makiatto     # one doll only (by slug)
 *   npm run import:recs -- --force             # overwrite 'manual' rows too
 *
 * The source file is parsed from the approved GFL2 Info Sheet workbook by the
 * datamine repo (`python -m gfl2dm.recommendations`) and committed here — no
 * network fetch, no Google endpoints. Its shape, per doll slug:
 *
 *   { path:        [{step: "R1"|"V0".."V6", note}],
 *     weapons:     ["6P33", ...],                          // ranked
 *     attachments: {mainSet, setEffect?, substats?},
 *     keys:        {primary: ["Fixed Key 2 - Logistics Specialist", ...],
 *                   alternatives: [...]} }
 *
 * Name → id resolution runs against the committed data/*.json (the same
 * artifacts the server reads). Anything unresolvable is REPORTED, not
 * guessed; rows edited by hand should set source='manual', which re-imports
 * skip unless --force.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dollRecommendations } from '../db/schema.js';

/** Caps mirror the rec codec (share/buildCode.ts). */
const MAX_BREAKPOINTS = 8;
const MAX_WEAPONS = 3;
const MAX_KEYS = 6;
const MAX_STATS = 4;

const BREAKPOINT_RE = /^(V[0-6]|R[1-6])$/;

// --- Committed game data (the same artifacts the server reads) --------------

interface DollEntry {
  id: string;
  name: string;
  slug: string;
}
interface WeaponEntry {
  id: string;
  name: string;
  imprintDollId: string | null;
}
interface KeyEntry {
  id: string;
  keyTitle: string | null;
  displayTitle: string | null;
  keyType: string | null;
  level: number | null;
  dollId: string | null;
}

interface RecSource {
  path?: { step: string; note: string | null }[];
  weapons?: string[];
  attachments?: {
    mainSet?: string;
    setEffect?: string;
    substats?: string;
  } | null;
  keys?: { primary: string[]; alternatives: string[] };
}

// --data <dir> points name resolution at a different artifact set (e.g. the
// datamine's out-app before it has been seeded+exported into data/).
const dataIdx = process.argv.indexOf('--data');
const DATA_DIR =
  dataIdx >= 0 && process.argv[dataIdx + 1]
    ? path.resolve(process.argv[dataIdx + 1] as string)
    : path.resolve('data');

function loadJson<T>(file: string, dir: string = DATA_DIR): T {
  return JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as T;
}

const { dolls } = loadJson<{ dolls: DollEntry[] }>('dolls.json');
const { weapons } = loadJson<{ weapons: WeaponEntry[] }>('weapons.json');
const { keys } = loadJson<{ keys: KeyEntry[] }>('keys.json');
const { attachmentSets } = loadJson<{ attachmentSets: { name: string }[] }>(
  'attachment-sets.json'
);
const source = loadJson<Record<string, RecSource>>(
  'recommendations-source.json',
  path.resolve('data')
);

/** Loose name equality: case/punctuation/whitespace-insensitive. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const dollBySlug = new Map(dolls.map((d) => [d.slug, d]));
const weaponByNorm = new Map(weapons.map((w) => [norm(w.name), w]));
// Known sheet-side spellings of weapon names. Anything not listed here stays
// UNRESOLVED and is reported — never fuzzy-matched. The three fan names are
// maintainer-confirmed as those dolls' signature weapons (client names on
// the right).
for (const [alias, canonical] of [
  ['Crowned Jackelope', 'Crowned Jackalope'],
  ['AK-15', '6P71'], // Voymastina's sig
  ["Themis' Game", 'Silent Sanction'], // Welrod's sig
  ['Dazzling Sparkles', 'Sparkling Centerstage'], // Yoohee's sig
  ['Law of Causality', 'Cause and Effect'], // Phaetusa's sig, cross-referenced on Sextans' tab
  ['Echoes of Sorrow', "Banshee's Whisper"], // maintainer-confirmed (Cheeta's tab)
]) {
  const target = weaponByNorm.get(norm(canonical as string));
  if (target) {
    weaponByNorm.set(norm(alias as string), target);
  }
}
/** Doll id -> her signature weapon. The sheet routinely lists the sig under
 * a fan/pre-release name (maintainer-confirmed: "AK-15" IS Voymastina's 6P71,
 * "Themis' Game" IS Welrod's Silent Sanction, …), so an unresolved weapon
 * token falls back to the tab's own sig — but only once, and only when the
 * sig isn't already among the resolved picks. */
const sigByDollId = new Map<string, WeaponEntry>();
for (const w of weapons) {
  if (w.imprintDollId) {
    sigByDollId.set(w.imprintDollId, w);
  }
}

const setByNorm = new Map(attachmentSets.map((s) => [norm(s.name), s.name]));
// Known sheet-side shorthand of set names.
setByNorm.set(norm('Allay Support'), 'Ally Support');
setByNorm.set(norm('Summon'), 'Summon Boost');
setByNorm.set(norm('Elec boost'), 'Electric Boost');

/** "Fixed Key 2 - Logistics Specialist" → {type, slot, title}. */
const KEY_TOKEN_RE = /^(Fixed|Common|Expansion) Key\s*(\d)?\s*[-–]?\s*(.*)$/;

interface ResolvedKeys {
  fixedKeyIds: string[];
  commonKeyIds: string[];
  expansionKeyId: string | null;
  unresolved: string[];
}

function resolveKeys(doll: DollEntry, tokens: string[]): ResolvedKeys {
  const dollKeys = keys.filter((k) => k.dollId === doll.id);
  const fixedBySlot = new Map(
    dollKeys
      .filter((k) => k.keyType === 'Fixed Key' && k.level != null)
      .map((k) => [k.level as number, k])
  );
  // Tolerate both title styles: ours ("Logistics Specialist") and the old
  // prefixed one ("Fixed Key 2 - Logistics Specialist").
  const stripPrefix = (t: string) =>
    t.replace(/^(Fixed|Common|Expansion) Key\s*\d*\s*[-–]?\s*/i, '');
  const byTitle = new Map<string, KeyEntry>();
  for (const k of keys) {
    if (k.displayTitle) {
      byTitle.set(`${k.keyType}|${norm(stripPrefix(k.displayTitle))}`, k);
    }
  }
  const out: ResolvedKeys = {
    fixedKeyIds: [],
    commonKeyIds: [],
    expansionKeyId: null,
    unresolved: [],
  };
  for (const token of tokens) {
    const m = KEY_TOKEN_RE.exec(token.trim());
    if (!m) {
      out.unresolved.push(token);
      continue;
    }
    const [, type, slot, title] = m;
    let hit: KeyEntry | undefined;
    if (title) {
      hit = byTitle.get(`${type} Key|${norm(title)}`);
      // a doll's own key wins over a same-named key of another doll
      const own = dollKeys.find(
        (k) =>
          k.keyType === `${type} Key` &&
          norm(stripPrefix(k.displayTitle ?? '')) === norm(title)
      );
      if (own) {
        hit = own;
      }
    }
    if (!hit && type === 'Fixed' && slot) {
      hit = fixedBySlot.get(Number(slot));
    }
    if (!hit && type === 'Expansion') {
      hit = dollKeys.find((k) => k.keyType === 'Expansion Key');
    }
    if (!hit) {
      out.unresolved.push(token);
      continue;
    }
    if (hit.keyType === 'Fixed Key') {
      out.fixedKeyIds.push(hit.id);
    } else if (hit.keyType === 'Common Key') {
      out.commonKeyIds.push(hit.id);
    } else if (hit.keyType === 'Expansion Key') {
      out.expansionKeyId ??= hit.id;
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const force = args.includes('--force');
  const dollIdx = args.indexOf('--doll');
  const only = dollIdx >= 0 ? args[dollIdx + 1] : null;

  const manualSlugs = new Set<string>(
    (
      await db
        .select({ slug: dollRecommendations.dollSlug })
        .from(dollRecommendations)
        .where(sql`source = 'manual'`)
    ).map((r) => r.slug)
  );

  let written = 0;
  const needsReview: string[] = [];

  for (const [slug, rec] of Object.entries(source)) {
    if (only && slug !== only) {
      continue;
    }
    const doll = dollBySlug.get(slug);
    if (!doll) {
      console.log(`${slug}: no such doll in data/dolls.json — skipped`);
      needsReview.push(slug);
      continue;
    }

    const breakpoints = (rec.path ?? [])
      .map((p) => p.step)
      .filter((s) => BREAKPOINT_RE.test(s))
      .slice(0, MAX_BREAKPOINTS);

    const weaponIds: string[] = [];
    const missingWeapons: string[] = [];
    const assumedSig: string[] = [];
    const sig = sigByDollId.get(doll.id);
    for (const raw of (rec.weapons ?? []).slice(0, MAX_WEAPONS)) {
      // strip trailing commentary: "Skylla (Please get V6 first)"
      const name = raw.replace(/\s*\(.*\)\s*$/, '');
      const w = weaponByNorm.get(norm(name));
      if (w) {
        if (!weaponIds.includes(w.id)) {
          weaponIds.push(w.id);
        }
      } else if (
        sig &&
        !weaponIds.includes(sig.id) &&
        assumedSig.length === 0
      ) {
        weaponIds.push(sig.id);
        assumedSig.push(`${name} -> sig "${sig.name}"`);
      } else {
        missingWeapons.push(name);
      }
    }

    const setNames: string[] = [];
    const mainSet = rec.attachments?.mainSet;
    if (mainSet) {
      const resolved = setByNorm.get(norm(mainSet));
      if (resolved) {
        setNames.push(resolved);
      } else {
        needsReview.push(`${slug} (set: ${mainSet})`);
      }
    }

    const keyTokens = [
      ...(rec.keys?.primary ?? []),
      ...(rec.keys?.alternatives ?? []),
    ];
    const resolved = resolveKeys(doll, keyTokens);
    const fixedKeyIds = resolved.fixedKeyIds.slice(0, MAX_KEYS);
    const commonKeyIds = resolved.commonKeyIds.slice(0, MAX_KEYS);

    const statPrefs = (rec.attachments?.substats ?? '')
      .split('>')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_STATS);

    const problems = [
      ...missingWeapons.map((w) => `weapon: ${w}`),
      ...resolved.unresolved.map((k) => `key: ${k}`),
    ];
    console.log(
      `${slug}: bp [${breakpoints.join(' > ')}], ${weaponIds.length} weapons, ` +
        `${setNames.length} sets, ${fixedKeyIds.length} fixed / ${commonKeyIds.length} common` +
        `${resolved.expansionKeyId ? ' / 1 expansion' : ''}, stats [${statPrefs.join(' > ')}]` +
        (assumedSig.length ? `  ASSUMED: ${assumedSig.join('; ')}` : '') +
        (problems.length ? `  UNRESOLVED: ${problems.join('; ')}` : '')
    );
    if (problems.length) {
      needsReview.push(slug);
    }

    if (!execute) {
      continue;
    }
    if (manualSlugs.has(slug) && !force) {
      console.log(`  ↳ skipped (manual row; use --force to overwrite)`);
      continue;
    }
    await db
      .insert(dollRecommendations)
      .values({
        dollSlug: slug,
        breakpoints,
        weaponIds,
        setNames,
        fixedKeyIds,
        commonKeyIds,
        expansionKeyId: resolved.expansionKeyId,
        statPrefs,
        notes: null,
        source: 'sheet',
      })
      .onConflictDoUpdate({
        target: dollRecommendations.dollSlug,
        set: {
          breakpoints: sql`excluded.breakpoints`,
          weaponIds: sql`excluded.weapon_ids`,
          setNames: sql`excluded.set_names`,
          fixedKeyIds: sql`excluded.fixed_key_ids`,
          commonKeyIds: sql`excluded.common_key_ids`,
          expansionKeyId: sql`excluded.expansion_key_id`,
          statPrefs: sql`excluded.stat_prefs`,
          notes: sql`excluded.notes`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
      });
    written++;
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

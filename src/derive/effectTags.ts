/**
 * Effect tag derivation — pure function of `data/effects.json` (no database
 * access). Writes `data/effect-tags.json`: a queryable tag index over
 * effects, focused on buffs/debuffs, so consumers can answer questions like
 * "all sources of defense down" by joining tag → effects → matrix sources.
 *
 * Tags are DERIVED, never hand-authored: each tag is a `TagDef` rule tested
 * against the effect's upstream `effectTags` (from the source API, sparse and
 * incomplete) plus its details text. The details text carries reliable
 * signals: directional phrasing ("Defense is reduced by 30%") and the
 * canonical "Considered a <element> <stat> buff/debuff" sentence. To fix a
 * wrong tag, fix the rule — the next derive overwrites the JSON.
 *
 * Mirrors the archetype-tags pattern from nikke-sim: kebab-case ids, a
 * self-describing vocabulary ({label, blurb, group}), and a sidecar map
 * keyed by entity id (tags live next to effects, never on them).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// --- Types ---

export interface EffectTagContext {
  /** Effect display name (e.g. "Defense Down II"). */
  name: string;
  /**
   * Normalized details text. `effectDetails` is occasionally a JSON string
   * (`{"mainDetails": ..., "upgrades": [...]}`); this is the plain-text
   * extraction of it.
   */
  details: string;
  /** Upstream-provided tags from the source API (e.g. "Buff", "Defense"). */
  upstreamTags: ReadonlySet<string>;
}

export interface EffectTagDef {
  /** kebab-case id; this is what travels in the JSON and query APIs. */
  id: string;
  /** Player-facing label ("Defense Down"). */
  label: string;
  /** One-line explanation of what earns the tag. */
  blurb: string;
  /** UI filter-panel bucket. */
  group: string;
  test: (ctx: EffectTagContext) => boolean;
}

export interface EffectTagVocabularyEntry {
  label: string;
  blurb: string;
  group: string;
}

export interface EffectTagsFile {
  generator: string;
  syncedAt: string;
  vocabulary: Record<string, EffectTagVocabularyEntry>;
  /** effectId → sorted tag ids. Effects with no tags are omitted. */
  tags: Record<string, string[]>;
}

export interface EffectTagStats {
  effectsTotal: number;
  effectsTagged: number;
  /** tagId → number of effects carrying it. */
  tagCounts: Record<string, number>;
  /** Names of effects that earned no tag at all (review gate). */
  untagged: string[];
}

const GENERATOR = 'effect-tags/1';

// --- Rule helpers ---

const CONSIDERED_BUFF_RE =
  /\bconsidered (?:a|an)\b[^.\n]*\bbuff\b|\bthis buff\b/i;
const CONSIDERED_DEBUFF_RE =
  /\bconsidered (?:a|an)\b[^.\n]*\bdebuff\b|\bthis debuff\b/i;

/** "Considered a <element> ..." sentence, e.g. "Considered a Burn buff". */
function consideredElement(el: string): RegExp {
  return new RegExp(`\\bconsidered (?:a|an)\\b[^.\\n]*\\b${el}\\b`, 'i');
}

// --- Tag vocabulary + rules ---

export const EFFECT_TAG_DEFS: EffectTagDef[] = [
  // Polarity
  {
    id: 'buff',
    label: 'Buff',
    blurb: 'A beneficial status effect.',
    group: 'Polarity',
    test: ({ details, upstreamTags }) =>
      upstreamTags.has('Buff') || CONSIDERED_BUFF_RE.test(details),
  },
  {
    id: 'debuff',
    label: 'Debuff',
    blurb: 'A detrimental status effect.',
    group: 'Polarity',
    test: ({ details, upstreamTags }) =>
      upstreamTags.has('Debuff') || CONSIDERED_DEBUFF_RE.test(details),
  },
  {
    id: 'neutral',
    label: 'Neutral',
    blurb: 'Neither a buff nor a debuff.',
    group: 'Polarity',
    test: ({ details }) => /\bneutral status\b/i.test(details),
  },

  // Buffs
  {
    id: 'attack-up',
    label: 'Attack Up',
    blurb: 'Increases attack.',
    group: 'Buffs',
    test: ({ details }) =>
      /\battack is increased\b/i.test(details) ||
      /\bincreases? (?:its |their |the |this unit's )?attack\b/i.test(
        details
      ) ||
      /\battack buff\b/i.test(details),
  },
  {
    id: 'defense-up',
    label: 'Defense Up',
    blurb: 'Increases defense.',
    group: 'Buffs',
    test: ({ details }) =>
      /\bdefense is increased\b/i.test(details) ||
      /\bincreases? defense\b/i.test(details) ||
      /\bdefense(?:-type)? buff\b/i.test(details),
  },
  {
    id: 'crit-up',
    label: 'Crit Up',
    blurb: 'Increases critical rate or critical damage.',
    group: 'Buffs',
    test: ({ details }) =>
      /\bcritical (?:rate|damage)(?: is| are)? increased\b/i.test(details) ||
      /\bincreases? critical\b/i.test(details),
  },
  {
    id: 'damage-up',
    label: 'Damage Up',
    blurb: 'Increases damage dealt.',
    group: 'Buffs',
    test: ({ details }) =>
      /\bdamage dealt(?: is)? increased\b/i.test(details) ||
      /\bincreases?[^.\n]{0,30}\bdamage dealt\b/i.test(details) ||
      /\bdamage is increased\b/i.test(details),
  },
  {
    id: 'damage-taken-down',
    label: 'Damage Taken Down',
    blurb: 'Reduces damage taken (mitigation).',
    group: 'Buffs',
    test: ({ details }) =>
      /\bdamage taken(?: is)? (?:reduced|decreased)\b/i.test(details) ||
      /\breduces?[^.\n]{0,20}\bdamage taken\b/i.test(details),
  },
  {
    id: 'stability-damage-up',
    label: 'Stability Damage Up',
    blurb: 'Increases stability damage dealt.',
    group: 'Buffs',
    test: ({ details }) =>
      /\bstability damage(?: dealt)?(?: is)? increased\b/i.test(details) ||
      /\bincreases?[^.\n]{0,20}\bstability damage\b/i.test(details),
  },
  {
    id: 'movement-up',
    label: 'Movement Up',
    blurb: 'Increases movement/mobility.',
    group: 'Buffs',
    test: ({ details }) =>
      /\b(?:movement|mobility)(?: is)? increased\b/i.test(details) ||
      /\bmovement buff\b/i.test(details),
  },
  {
    id: 'ignore-defense',
    label: 'Ignore Defense',
    blurb: "Ignores a portion of the target's defense.",
    group: 'Buffs',
    test: ({ details }) =>
      /\bignores?[^.\n]{0,25}\bdefense\b/i.test(details) ||
      /\bdefense penetration\b/i.test(details),
  },
  {
    id: 'healing',
    label: 'Healing',
    blurb: 'Restores HP or improves healing received.',
    group: 'Buffs',
    test: ({ details, upstreamTags }) =>
      upstreamTags.has('Healing') ||
      /\brestores?[^.\n]{0,30}\bHP\b/i.test(details) ||
      /\bheals?\b/i.test(details) ||
      /\bhealing received(?: is)? increased\b/i.test(details),
  },
  {
    id: 'shield',
    label: 'Shield',
    blurb: 'Grants a shield.',
    group: 'Buffs',
    test: ({ details }) =>
      /\bconsidered (?:a|an)\s+(?:special\s+)?shield\b/i.test(details) ||
      /\b(?:generates?|gains?|grants?|applies)[^.\n]{0,20}\bshield\b/i.test(
        details
      ) ||
      /\bshield with\b/i.test(details),
  },

  // Debuffs
  {
    id: 'attack-down',
    label: 'Attack Down',
    blurb: 'Reduces attack.',
    group: 'Debuffs',
    test: ({ details }) =>
      /\battack is (?:reduced|decreased)\b/i.test(details) ||
      /\breduces? (?:the )?(?:attacker's |target's )?attack\b/i.test(details) ||
      /\battack debuff\b/i.test(details),
  },
  {
    id: 'defense-down',
    label: 'Defense Down',
    blurb: 'Reduces defense.',
    group: 'Debuffs',
    test: ({ details, upstreamTags }) =>
      /\bdefense is (?:reduced|decreased)\b/i.test(details) ||
      /\breduces? (?:the )?(?:target's )?defense\b/i.test(details) ||
      /\bdefense debuff\b/i.test(details) ||
      (upstreamTags.has('Defense') && upstreamTags.has('Debuff')),
  },
  {
    id: 'crit-down',
    label: 'Crit Down',
    blurb: 'Reduces critical rate or critical damage.',
    group: 'Debuffs',
    test: ({ details }) =>
      /\bcritical (?:rate|damage)(?: is| are)? (?:reduced|decreased)\b/i.test(
        details
      ),
  },
  {
    id: 'damage-taken-up',
    label: 'Damage Taken Up',
    blurb: 'Increases damage taken (vulnerability).',
    group: 'Debuffs',
    test: ({ details }) =>
      /\bdamage taken(?: is)? increased\b/i.test(details) ||
      /\bincreases?[^.\n]{0,20}\bdamage taken\b/i.test(details),
  },
  {
    id: 'stability-damage-down',
    label: 'Stability Damage Down',
    blurb: 'Reduces stability damage dealt or taken protection.',
    group: 'Debuffs',
    test: ({ details }) =>
      /\bstability damage[^.\n]{0,20}(?:reduced|decreased)\b/i.test(details) ||
      /\breduces?[^.\n]{0,20}\bstability damage\b/i.test(details),
  },
  {
    id: 'movement-down',
    label: 'Movement Down',
    blurb: 'Reduces movement/mobility or prevents moving.',
    group: 'Debuffs',
    test: ({ details }) =>
      /\b(?:movement|mobility)(?: is)? (?:decreased|reduced)\b/i.test(
        details
      ) ||
      /\bmovement debuff\b/i.test(details) ||
      /\b(?:unable|cannot) to move\b|\bimmobilized\b/i.test(details),
  },
  {
    id: 'anti-heal',
    label: 'Anti-Heal',
    blurb: 'Prevents or reduces healing received.',
    group: 'Debuffs',
    test: ({ details }) =>
      /\bcannot be healed\b/i.test(details) ||
      /\bhealing received(?: is)? (?:reduced|decreased|converted)\b/i.test(
        details
      ) ||
      /\breduces?[^.\n]{0,15}\bhealing\b/i.test(details),
  },
  {
    id: 'control',
    label: 'Control',
    blurb: 'Prevents acting (stun, command prohibition, etc.).',
    group: 'Debuffs',
    test: ({ details }) =>
      /\b(?:unable|cannot) to act\b|\bstun(?:ned)?\b|\bcommand prohibition\b/i.test(
        details
      ),
  },

  // Elements (phase damage families)
  ...(['Burn', 'Corrosion', 'Electric', 'Hydro', 'Freeze'] as const).map(
    (el): EffectTagDef => ({
      id: el.toLowerCase(),
      label: el,
      blurb: `${el}-related effect.`,
      group: 'Elements',
      test: ({ details, upstreamTags }) =>
        upstreamTags.has(el) || consideredElement(el).test(details),
    })
  ),
  {
    id: 'physical',
    label: 'Physical',
    blurb: 'Physical-damage-related effect.',
    group: 'Elements',
    test: ({ upstreamTags }) => upstreamTags.has('Physical'),
  },
  {
    id: 'weakness',
    label: 'Weakness',
    blurb: 'Phase-weakness-related effect.',
    group: 'Elements',
    test: ({ upstreamTags }) => upstreamTags.has('Weakness'),
  },

  // Meta
  {
    id: 'dot',
    label: 'Damage over Time',
    blurb: 'Deals damage at the start/end of a turn or action.',
    group: 'Meta',
    test: ({ details }) =>
      /\bat the (?:start|end) of[^.\n]{0,40}(?:turn|action)[^.\n]{0,80}damage\b/i.test(
        details
      ) || /\b(?:takes|deals) fixed damage\b/i.test(details),
  },
  {
    id: 'uncleansable',
    label: 'Uncleansable',
    blurb: 'Cannot be cleansed, dispelled, or removed.',
    group: 'Meta',
    test: ({ details }) =>
      /\bcannot be (?:cleansed|dispelled|removed)\b/i.test(details),
  },
  {
    id: 'immunity',
    label: 'Immunity',
    blurb: 'Grants immunity to some effect or damage.',
    group: 'Meta',
    test: ({ details }) => /\bimmune to\b|\bimmunity\b/i.test(details),
  },
  {
    id: 'summon',
    label: 'Summon',
    blurb: 'A summoned unit or summon-related effect.',
    group: 'Meta',
    test: ({ details, upstreamTags }) =>
      upstreamTags.has('Summon') ||
      /\bsummoned unit\b|\bsummon\b/i.test(details),
  },
  {
    id: 'artifact-recovery',
    label: 'Artifact Recovery',
    blurb: 'Recovers Confectus Index (artifact) resources.',
    group: 'Meta',
    test: ({ details, upstreamTags }) =>
      upstreamTags.has('Artifact Recovery') || /\bconfectus\b/i.test(details),
  },
];

// --- Details text normalization ---

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out);
    }
  }
}

/**
 * `effectDetails` is usually plain text, but some effects carry a JSON string
 * (`{"mainDetails": ..., "upgrades": [...]}`) — occasionally with raw
 * newlines that break JSON.parse. Extract plain text either way.
 */
export function normalizeDetails(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    return raw;
  }
  try {
    const out: string[] = [];
    collectStrings(JSON.parse(trimmed), out);
    return out.join('\n');
  } catch {
    const out: string[] = [];
    for (const m of trimmed.matchAll(
      /"(?:mainDetails|description)"\s*:\s*"((?:[^"\\]|\\.)*)"/g
    )) {
      out.push(m[1]!.replace(/\\n/g, '\n').replace(/\\"/g, '"'));
    }
    return out.length > 0 ? out.join('\n') : trimmed;
  }
}

// --- Builder ---

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function buildEffectTags(effects: Record<string, unknown>[]): {
  file: EffectTagsFile;
  stats: EffectTagStats;
} {
  const vocabulary: Record<string, EffectTagVocabularyEntry> = {};
  for (const def of EFFECT_TAG_DEFS) {
    vocabulary[def.id] = {
      label: def.label,
      blurb: def.blurb,
      group: def.group,
    };
  }

  const tags: Record<string, string[]> = {};
  const tagCounts: Record<string, number> = {};
  const untagged: string[] = [];

  const groupByTagId = new Map(
    EFFECT_TAG_DEFS.map((def) => [def.id, def.group])
  );

  const sorted = [...effects].sort((a, b) =>
    String(a.id ?? '').localeCompare(String(b.id ?? ''))
  );

  for (const eff of sorted) {
    const id = str(eff.id);
    if (!id) {
      continue;
    }
    const ctx: EffectTagContext = {
      name: str(eff.effectName) ?? '',
      details: normalizeDetails(str(eff.effectDetails) ?? ''),
      upstreamTags: new Set(
        Array.isArray(eff.effectTags) ? eff.effectTags.map(String) : []
      ),
    };
    const earned = new Set(
      EFFECT_TAG_DEFS.filter((def) => def.test(ctx)).map((def) => def.id)
    );
    // Directional tags imply polarity: anything that raises a stat is a
    // buff, anything that lowers one is a debuff — even when the text never
    // says the word ("Defense-type buff", untagged upstream, etc.).
    const groups = new Set([...earned].map((id) => groupByTagId.get(id)));
    if (groups.has('Buffs')) {
      earned.add('buff');
    }
    if (groups.has('Debuffs')) {
      earned.add('debuff');
    }
    const sortedTags = [...earned].sort();
    if (sortedTags.length === 0) {
      untagged.push(ctx.name || id);
      continue;
    }
    tags[id] = sortedTags;
    for (const tag of sortedTags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  const file: EffectTagsFile = {
    generator: GENERATOR,
    syncedAt: new Date().toISOString(),
    vocabulary,
    tags,
  };

  return {
    file,
    stats: {
      effectsTotal: effects.length,
      effectsTagged: Object.keys(tags).length,
      tagCounts,
      untagged: untagged.sort(),
    },
  };
}

/** Read the committed effects artifact, derive tags, write the output. */
export async function deriveEffectTags(dataDir: string): Promise<{
  file: EffectTagsFile;
  stats: EffectTagStats;
}> {
  const effectsJson = await readFile(join(dataDir, 'effects.json'), 'utf8');
  const effects = (
    JSON.parse(effectsJson) as { effects: Record<string, unknown>[] }
  ).effects;

  const { file, stats } = buildEffectTags(effects);

  await writeFile(
    join(dataDir, 'effect-tags.json'),
    JSON.stringify(file, null, 2) + '\n'
  );

  return { file, stats };
}

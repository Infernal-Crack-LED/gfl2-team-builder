/**
 * Effect matrix derivation — pure function of the committed JSON artifacts.
 * Reads `data/dolls.json`, `data/weapons.json`, `data/keys.json`,
 * `data/effects.json` (no database access) and writes
 * `data/effect-matrix.json`: for every effect, who confers it (sources) and
 * whose behavior references it (interactions).
 *
 * Linkage comes from the structured `[effect:<uuid>]` / `[effect:<uuid>|doll:<slug>]`
 * markers embedded in skill descriptions, effect details, weapon effects,
 * key effects, vertebrae, summons, and remolding text. Each marker
 * occurrence is classified into a relation:
 *
 *   applies      — the source puts the effect on another unit
 *   gains        — the source puts the effect on itself (or launches it)
 *   removes      — the source cleanses/strips the effect
 *   conditional  — the source's behavior depends on the effect being present
 *   mentions     — unclassified fallback (kept, never dropped)
 *
 * `applies`/`gains` edges land in the effect's `sources`; the rest land in
 * `interactions`. The classifier is deliberately conservative — every edge
 * carries the raw sentence snippet so the UI can show the underlying text.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stripHtml } from '../sync/html.js';

// --- Marker / relation primitives ---

export type Relation =
  | 'applies'
  | 'gains'
  | 'removes'
  | 'conditional'
  | 'enhances'
  | 'includes'
  | 'considered'
  | 'mentions';

export const MARKER_RE =
  /\[effect:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\|doll:([^\]]+))?\]/gi;

export interface EffectRef {
  effectId: string;
  dollSlug: string | null;
  start: number;
  end: number;
}

/** Extract every effect marker from a text, with positions. */
export function extractRefs(text: string): EffectRef[] {
  const refs: EffectRef[] = [];
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    refs.push({
      effectId: m[1]!,
      dollSlug: m[2] ?? null,
      start: m.index,
      end: m.index + m[0].length,
    });
    if (m.index === MARKER_RE.lastIndex) {
      MARKER_RE.lastIndex++;
    }
  }
  return refs;
}

const APPLIES_RE =
  /\b(appl(?:y|ies|ied|ying)|grants?|granting|inflicts?|inflicting|inflicted|leaves?)\b/gi;
const GAINS_RE =
  /\b(gains?|gaining|generates?|generating|enters?|entering|launch(?:es|ed)?|switch(?:es|ed)?|obtains?|gets?|summons?|summoning|summoned|performs?|performing|performed|triggers?|triggering|triggered|activates?|activating|uses?|using|changes?|changing|changed|replac(?:e|es|ed)|accumulat(?:e|es|ed|ing))\b/gi;
const REMOVES_RE =
  /\b(removes?|removing|removed|cleanses?|cleansing|cleansed|dispels?|strips?|stripping|consumes?|consuming|consumed|resets?)\b/gi;
/** Category-membership verbs: "Includes [A], [B] and [C]". */
const INCLUDES_RE = /\binclud(?:es|e|ing)\b/gi;
/** Any mention of immunity — the unit is unaffected by the effect. */
const IMMUNE_RE = /\bimmun(?:e|ity)\b/i;
/**
 * Pre-marker wording that signals the marker is a condition, not a target.
 * Allows up to three words between the keyword and the marker — determiners
 * ("have a [Shield]", "with the [X] active") and short clause lead-ins
 * ("when casting [X]", "when the target that [X]").
 */
const CONDITIONAL_TAIL_RE =
  /\b(has|have|with|under|while|during|if|when|against|per|in|on|before|after|immune to)(?:\s+(?:a|an|the|this|that|these|those|one|two|three|four|five|in|on|casting|using|each|every|either|\d+)(?:st|nd|rd|th)?|\s+[^\s,]{1,12}){0,5}\s*$/i;
/**
 * "is replaced with [X]" / "[A] is upgraded to [X]" — change-of-state verbs
 * govern the marker (the subject becomes the referenced effect).
 */
const CHANGE_OF_STATE_TAIL_RE =
  /\b(replaced|changed|switches?|switched|converted|upgraded?|transforms?|transformed)\s+(?:with|to|into)\s*$/i;
/** "This attack is considered a [X]" — classification of an action. */
const CONSIDERED_TAIL_RE = /\bconsidered\s+(?:a|an|the|as)?\s*$/i;
/**
 * Trailing phrasing that means the source modifies/enhances the referenced
 * effect's numbers ("the effect of [X]", "damage multiplier of [X]", ...).
 */
const ENHANCES_TAIL_RE =
  /\b(?:the\s+)?(?:effects?|effectiveness|damage\s+multiplier|mult?iplier|multipliers?|duration|damage\s+(?:dealt|value|accumulated)|value|absorption(?:\s+(?:value|amount))?|attack(?:\s+increase)?|max(?:imum)?\s+(?:absorption|stacks|number|activations)|activations|stack\s+limit|conversion\s+rate|defense\s+reduction|stability\s+damage|range)\s+(?:of|from|by|for)(?:\s+[a-z0-9'%\u2019-]+){0,2}\s*$/i;
/** Stack-count lead-ins ("each stack of [X]", "3 stacks of [X]", ...). */
const STACKS_TAIL_RE =
  /\b(?:each|every|all|more|of|the\s+number\s+of|max(?:imum)?|\d+)\s+stacks?\s+of\s*$/i;
/**
 * Misc condition lead-ins that don't fit the keyword list — including
 * trigger/count conditionals ("each time [X] is triggered", "every 2 times
 * [X]", "N or more instances of [X]").
 */
const EXTRA_CONDITIONAL_TAIL_RE =
  /\b(?:number\s+of|(?:when\s+)?possessing|holds?|before|after|for\s+each|affected\s+by|each\s+time|every\s+(?:\d+\s+)?times?|(?:\d+\s+or\s+more\s+)?instances?\s+of|(?:for\s+)?each\s+turn|(?:every|each)\s+[\d.,]+%?\s+(?:\w+\s+)?of|the\s+first\s+time)\s*$/i;
/**
 * Suffix patterns — the marker is the grammatical SUBJECT and the sentence
 * goes on to modify it ("[X] is enhanced", "[X] gains a new effect", ...).
 * Matched against the marker- and number-masked suffix.
 */
const SUFFIX_ENHANCES_RE =
  /^(?:is|are|was|were|has|have|gains?|gets?)\s+(?:enhanced|improved|strengthened|empowered|upgraded|a\s+new\s+effect|new\s+effects?|no\s+longer\s+(?:removed|expended|consumed)|a\s+stack\s+limit)/i;
/** Suffix that upgrades/transforms the subject into the referenced effect. */
const SUFFIX_UPGRADE_RE = /^(?:is|are|was|were)?\s*(?:upgraded?|changes?|switches?|converted)\s+(?:to|into)\b/i;
const TRAILING_JUNCTIONS = new Set(['and', 'or', ',', ';', '•', '']);
/** Determiners dropped after junctions ("…has [A], the [B]" → lead-in "has"). */
const TRAILING_DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that']);
/** Placeholder token substituted for inner markers during prefix cleanup. */
const MARKER_PLACEHOLDER = '×';
const SENTENCE_BOUNDARY = /[.!?\n•;]/;
/** Conditional keywords that override a preceding verb ("targets with [X]"). */
const STRONG_CONDITIONAL_KEYWORDS = new Set([
  'has',
  'have',
  'with',
  'under',
  'while',
  'during',
  'if',
  'when',
  'against',
  'per',
  'before',
  'after',
  'immune',
]);

function lastMatchIndex(re: RegExp, text: string): number {
  re.lastIndex = 0;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    last = m.index;
    if (m.index === re.lastIndex) {
      re.lastIndex++;
    }
  }
  return last;
}

/**
 * Reduce the suffix (text after the marker, within the same sentence) to its
 * leading words: markers and numbers are masked, leading punctuation and
 * junctions are dropped, so stacked subjects ("[A], [B], and [C] are
 * enhanced") all classify from the shared verb phrase.
 */
function cleanSuffix(suffix: string): string {
  return suffix
    .replace(MARKER_RE, ' ')
    .replace(/\d+(?:[.,]\d+)?%?/g, ' ')
    .replace(/[\s,;:]+/g, ' ')
    .trim()
    .replace(/^(?:and|or)\s+/i, '')
    .trim();
}

/**
 * Classify a marker occurrence from the sentence text around it.
 * `prefix` is everything from the sentence start up to the marker; `suffix`
 * is everything after the marker to the sentence end (used when the marker
 * is the grammatical subject, e.g. "[X] is enhanced").
 */
export function classifyRelation(prefix: string, suffix = ''): Relation {
  // Reduce the prefix to its trailing words: inner markers become
  // placeholders that are dropped entirely (they carry no classification
  // signal), and trailing junctions ("and", "or", commas) are removed so
  // stacked effects ("target with [A] and [B]") classify from the shared
  // lead-in.
  const words = prefix
    .replace(MARKER_RE, ` ${MARKER_PLACEHOLDER} `)
    .split(/\s+/)
    .filter((w) => w !== '' && w !== MARKER_PLACEHOLDER);
  // Pop trailing junctions and the determiners that follow them so stacked
  // refs classify from the shared lead-in ("with [A] and [B]",
  // "has [A], the [B]").
  for (;;) {
    const last = words[words.length - 1]?.toLowerCase();
    if (last === undefined) {
      break;
    }
    if (TRAILING_JUNCTIONS.has(last)) {
      words.pop();
      continue;
    }
    if (TRAILING_DETERMINERS.has(last)) {
      const prev = words[words.length - 2]?.toLowerCase();
      if (prev !== undefined && TRAILING_JUNCTIONS.has(prev)) {
        words.pop();
        continue;
      }
    }
    break;
  }
  const tail = words.join(' ');

  if (CHANGE_OF_STATE_TAIL_RE.test(tail)) {
    return 'gains';
  }
  if (CONSIDERED_TAIL_RE.test(tail)) {
    return 'considered';
  }
  // Immunity — "immune to [X]" or "immune to all damage types and [X], [Y]"
  if (IMMUNE_RE.test(prefix)) {
    return 'conditional';
  }

  const tailMatch = CONDITIONAL_TAIL_RE.exec(tail);
  if (tailMatch) {
    const keyword = tailMatch[1]!.toLowerCase().split(' ')[0]!;
    // "is inflicted with [X]" applies X — the verb governs, unlike
    // "afflicted with [X]" which describes a state the unit is in.
    const precededByInflicted =
      keyword === 'with' &&
      words.length >= 2 &&
      words[words.length - 2]!.toLowerCase() === 'inflicted';
    if (STRONG_CONDITIONAL_KEYWORDS.has(keyword) && !precededByInflicted) {
      return 'conditional';
    }
  }

  const ai = lastMatchIndex(APPLIES_RE, prefix);
  const gi = lastMatchIndex(GAINS_RE, prefix);
  const ri = lastMatchIndex(REMOVES_RE, prefix);
  const ii = lastMatchIndex(INCLUDES_RE, prefix);
  // Category membership — "Includes [A], [B] and [C]". Lists can be long, so
  // no proximity constraint: "includes" wins whenever it is the nearest verb.
  if (ii >= 0 && ii > ai && ii > gi && ii > ri) {
    return 'includes';
  }

  const best = Math.max(ai, gi, ri);
  // A verb only governs the marker when it is close — otherwise the marker
  // belongs to a later clause with its own structure ("applies [A], and the
  // effect of [B] is increased").
  const verbGoverns =
    best >= 0 && prefix.slice(best).split(/\s+/).filter(Boolean).length - 1 <= 4;
  if (best >= 0 && verbGoverns) {
    if (best === ri) {
      return 'removes';
    }
    if (best === ai) {
      return 'applies';
    }
    return 'gains';
  }

  if (ENHANCES_TAIL_RE.test(tail)) {
    return 'enhances';
  }
  if (STACKS_TAIL_RE.test(tail)) {
    return 'conditional';
  }
  if (EXTRA_CONDITIONAL_TAIL_RE.test(tail)) {
    return 'conditional';
  }
  if (tailMatch && best < 0) {
    // Weak keywords (in/on) classify when no verb governs the marker
    return 'conditional';
  }

  // Subject-position modification — the marker leads the sentence and the
  // suffix describes what happens to it ("[X] is enhanced", "[X] gains a new
  // effect", "[X] is upgraded to [Y]").
  const suffixClean = cleanSuffix(suffix);
  if (SUFFIX_UPGRADE_RE.test(suffixClean) || SUFFIX_ENHANCES_RE.test(suffixClean)) {
    return 'enhances';
  }

  if (best >= 0) {
    // Distant verb with no tail structure — better than dropping the signal
    if (best === ri) {
      return 'removes';
    }
    if (best === ai) {
      return 'applies';
    }
    return 'gains';
  }
  return 'mentions';
}

/** Extract the sentence around a marker (boundaries: . ! ? newline, bullet). */
export function extractSentence(
  text: string,
  markerStart: number,
  markerEnd: number
): { sentence: string; prefix: string; suffix: string } {
  let start = markerStart;
  while (start > 0 && !SENTENCE_BOUNDARY.test(text[start - 1]!)) {
    start--;
  }
  let end = markerEnd;
  while (end < text.length && !SENTENCE_BOUNDARY.test(text[end]!)) {
    end++;
  }
  const sentence = text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim();
  return {
    sentence: sentence.length > 300 ? `${sentence.slice(0, 297)}…` : sentence,
    prefix: text.slice(start, markerStart),
    suffix: text.slice(markerEnd, end),
  };
}

/** Normalize a text field that may be raw Tiptap HTML or already plain. */
function clean(text: string | null | undefined): string | null {
  if (text == null || text === '') {
    return null;
  }
  return stripHtml(text);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// --- Matrix edge / output types ---

interface EdgeBase {
  relation: Relation;
  snippet: string;
}

export interface MatrixSkillEdge extends EdgeBase {
  kind: 'skill';
  dollId: string;
  dollName: string;
  skillId: string | null;
  skillName: string | null;
  skillType: string | null;
  levels: number[];
}

export interface MatrixSummonSkillEdge extends EdgeBase {
  kind: 'summon-skill';
  dollId: string;
  dollName: string;
  summonName: string | null;
  skillName: string | null;
  skillType: string | null;
  levels: number[];
}

export interface MatrixSummonEdge extends EdgeBase {
  kind: 'summon';
  dollId: string;
  dollName: string;
  summonName: string | null;
  path: string;
}

export interface MatrixVertebraeEdge extends EdgeBase {
  kind: 'vertebrae';
  dollId: string;
  dollName: string;
  level: number | null;
  segment: number | null;
}

export interface MatrixRemoldingEdge extends EdgeBase {
  kind: 'remolding';
  dollId: string;
  dollName: string;
  stage: number | null;
  path: string;
}

export interface MatrixWeaponEdge extends EdgeBase {
  kind: 'weapon';
  weaponId: string;
  weaponName: string;
  imprintDollId: string | null;
  imprintDollName: string | null;
  field: 'effect' | 'imprintDescription';
}

export interface MatrixWeaponImprintEdge extends EdgeBase {
  kind: 'weapon-imprint';
  dollId: string | null;
  dollName: string | null;
  weaponName: string | null;
  field: 'effect' | 'trait';
}

export interface MatrixKeyEdge extends EdgeBase {
  kind: 'key';
  keyId: string;
  keyTitle: string | null;
  keyType: string | null;
  level: number | null;
  dollId: string | null;
  dollName: string | null;
}

export interface MatrixEffectEdge extends EdgeBase {
  kind: 'effect';
  effectId: string;
  effectName: string | null;
  ownerDollId: string | null;
  ownerDollName: string | null;
}

export type MatrixEdge =
  | MatrixSkillEdge
  | MatrixSummonSkillEdge
  | MatrixSummonEdge
  | MatrixVertebraeEdge
  | MatrixRemoldingEdge
  | MatrixWeaponEdge
  | MatrixWeaponImprintEdge
  | MatrixKeyEdge
  | MatrixEffectEdge;

export interface MatrixEffect {
  effectId: string;
  effectName: string | null;
  effectTags: string[];
  exclusiveDollId: string | null;
  exclusiveDollName: string | null;
  /** Effects that confer this one (applies/gains edges). */
  sources: MatrixEdge[];
  /** Behavior that depends on this effect (conditional/removes/mentions). */
  interactions: MatrixEdge[];
}

export interface UnresolvedRef {
  effectId: string;
  foundIn: string;
}

export interface EffectMatrixFile {
  generator: string;
  syncedAt: string;
  effects: MatrixEffect[];
  unresolvedRefs: UnresolvedRef[];
}

export interface DeriveStats {
  edgesByRelation: Record<Relation, number>;
  edgesByKind: Record<string, number>;
  effectsTotal: number;
  effectsWithSources: number;
  effectsWithInteractions: number;
  mentions: { effectName: string | null; source: string; snippet: string }[];
}

// --- Input row shapes (as exported to data/*.json) ---

export interface DeriveInput {
  dolls: Record<string, unknown>[];
  weapons: Record<string, unknown>[];
  keys: Record<string, unknown>[];
  effects: Record<string, unknown>[];
}

const GENERATOR = 'effect-matrix/1';
const SKILL_DESC_FIELDS = [
  ['description', 1],
  ['descriptionLevel2', 2],
  ['descriptionLevel3', 3],
  ['descriptionLevel4', 4],
] as const;

/** Walk arbitrary nested data and collect strings containing markers. */
function walkStrings(
  value: unknown,
  path: string,
  out: { path: string; text: string }[],
  skipKeys: ReadonlySet<string>
): void {
  if (typeof value === 'string') {
    if (value.includes('[effect:')) {
      out.push({ path, text: value });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, out, skipKeys));
    return;
  }
  const rec = asRecord(value);
  if (rec) {
    for (const [k, v] of Object.entries(rec)) {
      if (skipKeys.has(k)) {
        continue;
      }
      walkStrings(v, path ? `${path}.${k}` : k, out, skipKeys);
    }
  }
}

export function buildEffectMatrix(input: DeriveInput): {
  file: EffectMatrixFile;
  stats: DeriveStats;
} {
  const dollNameById = new Map<string, string>();
  for (const doll of input.dolls) {
    const id = str(doll.id);
    const name = str(doll.name);
    if (id && name) {
      dollNameById.set(id, name);
    }
  }
  const dollName = (id: string | null): string | null =>
    id ? (dollNameById.get(id) ?? null) : null;

  const effectById = new Map<string, { name: string | null; dollId: string | null }>();
  for (const eff of input.effects) {
    const id = str(eff.id);
    if (id) {
      effectById.set(id, {
        name: str(eff.effectName),
        dollId: str(eff.dollId),
      });
    }
  }

  // effectId → mergeKey → edge
  const edgesByEffect = new Map<string, Map<string, MatrixEdge>>();
  const unresolvedRefs: UnresolvedRef[] = [];
  const seenUnresolved = new Set<string>();

  const addEdge = (effectId: string, mergeKey: string, edge: MatrixEdge): void => {
    let byKey = edgesByEffect.get(effectId);
    if (!byKey) {
      byKey = new Map();
      edgesByEffect.set(effectId, byKey);
    }
    const existing = byKey.get(mergeKey);
    if (existing) {
      // Merge skill levels across description variants
      if (
        (existing.kind === 'skill' || existing.kind === 'summon-skill') &&
        (edge.kind === 'skill' || edge.kind === 'summon-skill')
      ) {
        for (const lvl of edge.levels) {
          if (!existing.levels.includes(lvl)) {
            existing.levels.push(lvl);
          }
        }
        existing.levels.sort((a, b) => a - b);
      }
      return;
    }
    byKey.set(mergeKey, edge);
  };

  const recordRefs = (
    text: string,
    foundIn: string,
    emit: (ref: EffectRef, relation: Relation, snippet: string) => void
  ): void => {
    for (const ref of extractRefs(text)) {
      if (!effectById.has(ref.effectId)) {
        const key = `${ref.effectId}:${foundIn}`;
        if (!seenUnresolved.has(key)) {
          seenUnresolved.add(key);
          unresolvedRefs.push({ effectId: ref.effectId, foundIn });
        }
        continue;
      }
      const { sentence, prefix, suffix } = extractSentence(text, ref.start, ref.end);
      emit(ref, classifyRelation(prefix, suffix), sentence);
    }
  };

  // --- Doll surfaces: skills, vertebrae, summons, remolding, weapon imprint ---

  for (const doll of input.dolls) {
    const dollId = str(doll.id);
    const name = str(doll.name);
    if (!dollId || !name) {
      continue;
    }

    // Skills (4 description levels — higher levels add refs of their own)
    for (const skill of asArray(doll.skills)) {
      const s = asRecord(skill);
      if (!s) {
        continue;
      }
      const skillId = str(s.id);
      const skillName = str(s.name);
      const skillType = str(s.skillType);
      const groups = new Map<string, { relation: Relation; levels: number[]; snippet: string }>();
      for (const [field, level] of SKILL_DESC_FIELDS) {
        const text = clean(str(s[field]));
        if (!text) {
          continue;
        }
        recordRefs(text, `${name}/${skillName ?? 'skill'}:${field}`, (ref, relation, snippet) => {
          const key = `${ref.effectId}:${relation}`;
          const group = groups.get(key);
          if (group) {
            if (!group.levels.includes(level)) {
              group.levels.push(level);
            }
          } else {
            groups.set(key, { relation, levels: [level], snippet });
          }
        });
      }
      for (const [key, group] of groups) {
        const effectId = key.split(':')[0]!;
        addEdge(effectId, `skill:${dollId}:${skillId}:${key}`, {
          kind: 'skill',
          relation: group.relation,
          levels: group.levels.sort((a, b) => a - b),
          snippet: group.snippet,
          dollId,
          dollName: name,
          skillId,
          skillName,
          skillType,
        });
      }
    }

    // Vertebrae (raw HTML in `effect`)
    for (const vertebra of asArray(doll.vertebrae)) {
      const v = asRecord(vertebra);
      if (!v) {
        continue;
      }
      const text = clean(str(v.effect));
      if (!text) {
        continue;
      }
      const level = num(v.level);
      const segment = num(v.segment);
      recordRefs(text, `${name}/vertebrae:${String(level)}`, (ref, relation, snippet) => {
        addEdge(ref.effectId, `vertebrae:${dollId}:${String(v.id)}:${ref.effectId}:${relation}`, {
          kind: 'vertebrae',
          relation,
          snippet,
          dollId,
          dollName: name,
          level,
          segment,
        });
      });
    }

    // Summons — skills explicitly (level merging), everything else by walk
    for (const summon of asArray(doll.summons)) {
      const su = asRecord(summon);
      if (!su) {
        continue;
      }
      const summonName = str(su.name);

      for (const skill of asArray(su.skills)) {
        const s = asRecord(skill);
        if (!s) {
          continue;
        }
        const skillName = str(s.name);
        const skillType = str(s.skillType);
        const groups = new Map<string, { relation: Relation; levels: number[]; snippet: string }>();
        for (const [field, level] of SKILL_DESC_FIELDS) {
          const text = clean(str(s[field]));
          if (!text) {
            continue;
          }
          recordRefs(
            text,
            `${name}/summon:${summonName}/${skillName ?? 'skill'}:${field}`,
            (ref, relation, snippet) => {
              const key = `${ref.effectId}:${relation}`;
              const group = groups.get(key);
              if (group) {
                if (!group.levels.includes(level)) {
                  group.levels.push(level);
                }
              } else {
                groups.set(key, { relation, levels: [level], snippet });
              }
            }
          );
        }
        for (const [key, group] of groups) {
          const effectId = key.split(':')[0]!;
          addEdge(effectId, `summon-skill:${dollId}:${str(s.id)}:${key}`, {
            kind: 'summon-skill',
            relation: group.relation,
            levels: group.levels.sort((a, b) => a - b),
            snippet: group.snippet,
            dollId,
            dollName: name,
            summonName,
            skillName,
            skillType,
          });
        }
      }

      const rest: { path: string; text: string }[] = [];
      walkStrings(su, 'summon', rest, new Set(['skills', 'doll']));
      for (const found of rest) {
        const text = clean(found.text);
        if (!text) {
          continue;
        }
        recordRefs(text, `${name}/summon:${summonName}/${found.path}`, (ref, relation, snippet) => {
          addEdge(ref.effectId, `summon:${dollId}:${found.path}:${ref.effectId}:${relation}`, {
            kind: 'summon',
            relation,
            snippet,
            dollId,
            dollName: name,
            summonName,
            path: found.path,
          });
        });
      }
    }

    // Remolding pattern (imagoforms and anything else carrying markers)
    const remold = asRecord(doll.remoldingPattern);
    if (remold) {
      const found: { path: string; text: string }[] = [];
      walkStrings(remold, 'remolding', found, new Set(['doll']));
      const imagoforms = asArray(remold.imagoforms);
      for (const f of found) {
        const text = clean(f.text);
        if (!text) {
          continue;
        }
        const imatch = /^imagoforms\[(\d+)\]/.exec(f.path);
        const stage = imatch
          ? num(asRecord(imagoforms[Number(imatch[1])])?.stage)
          : null;
        recordRefs(text, `${name}/remolding:${f.path}`, (ref, relation, snippet) => {
          addEdge(ref.effectId, `remolding:${dollId}:${f.path}:${ref.effectId}:${relation}`, {
            kind: 'remolding',
            relation,
            snippet,
            dollId,
            dollName: name,
            stage,
            path: f.path,
          });
        });
      }
    }

    // Weapon imprint (raw HTML on the doll). The weapons table usually carries
    // the same text stripped — only emit refs NOT already covered there.
    const imprint = asRecord(doll.weaponImprint);
    if (imprint) {
      const weaponRow = input.weapons.find(
        (w) => str(w.imprintDollId) === dollId
      );
      const covered = new Set<string>();
      if (weaponRow) {
        for (const field of ['effect', 'imprintDescription'] as const) {
          for (const ref of extractRefs(str(weaponRow[field]) ?? '')) {
            covered.add(ref.effectId);
          }
        }
      }
      const weaponName = str(weaponRow?.name) ?? str(imprint.name);
      for (const field of ['effect', 'trait'] as const) {
        const text = clean(str(imprint[field]));
        if (!text) {
          continue;
        }
        recordRefs(text, `${name}/weaponImprint:${field}`, (ref, relation, snippet) => {
          if (covered.has(ref.effectId)) {
            return;
          }
          addEdge(ref.effectId, `weapon-imprint:${dollId}:${field}:${ref.effectId}:${relation}`, {
            kind: 'weapon-imprint',
            relation,
            snippet,
            dollId,
            dollName: name,
            weaponName,
            field,
          });
        });
      }
    }
  }

  // --- Weapons ---

  for (const weapon of input.weapons) {
    const weaponId = str(weapon.id);
    const weaponName = str(weapon.name);
    if (!weaponId || !weaponName) {
      continue;
    }
    const imprintDollId = str(weapon.imprintDollId);
    for (const field of ['effect', 'imprintDescription'] as const) {
      const text = str(weapon[field]);
      if (!text) {
        continue;
      }
      recordRefs(text, `weapon:${weaponName}:${field}`, (ref, relation, snippet) => {
        addEdge(ref.effectId, `weapon:${weaponId}:${field}:${ref.effectId}:${relation}`, {
          kind: 'weapon',
          relation,
          snippet,
          weaponId,
          weaponName,
          imprintDollId,
          imprintDollName: dollName(imprintDollId),
          field,
        });
      });
    }
  }

  // --- Keys ---

  for (const key of input.keys) {
    const keyId = str(key.id);
    if (!keyId) {
      continue;
    }
    const text = str(key.effect);
    if (!text) {
      continue;
    }
    const keyTitle = str(key.keyTitle);
    const keyType = str(key.keyType);
    const level = num(key.level);
    const keyDollId = str(key.dollId);
    recordRefs(text, `key:${keyTitle ?? keyId}`, (ref, relation, snippet) => {
      addEdge(ref.effectId, `key:${keyId}:${ref.effectId}:${relation}`, {
        kind: 'key',
        relation,
        snippet,
        keyId,
        keyTitle,
        keyType,
        level,
        dollId: keyDollId,
        dollName: dollName(keyDollId),
      });
    });
  }

  // --- Effect → effect references (details text) ---

  for (const eff of input.effects) {
    const effectId = str(eff.id);
    if (!effectId) {
      continue;
    }
    const text = str(eff.effectDetails);
    if (!text) {
      continue;
    }
    const effectName = str(eff.effectName);
    const ownerDollId = str(eff.dollId);
    recordRefs(text, `effect:${effectName ?? effectId}`, (ref, relation, snippet) => {
      addEdge(ref.effectId, `effect:${effectId}:${ref.effectId}:${relation}`, {
        kind: 'effect',
        relation,
        snippet,
        effectId,
        effectName,
        ownerDollId,
        ownerDollName: dollName(ownerDollId),
      });
    });
  }

  // --- Assemble the matrix ---

  const effects: MatrixEffect[] = [];
  for (const eff of input.effects) {
    const effectId = str(eff.id);
    if (!effectId) {
      continue;
    }
    const exclusiveDollId = str(eff.dollId);
    const byKey = edgesByEffect.get(effectId);
    const allEdges = byKey ? [...byKey.values()] : [];
    const sources = allEdges.filter(
      (e) => e.relation === 'applies' || e.relation === 'gains'
    );
    const interactions = allEdges.filter(
      (e) => e.relation !== 'applies' && e.relation !== 'gains'
    );
    const edgeOrder = (e: MatrixEdge): string =>
      `${e.relation}:${e.kind}:${JSON.stringify(e)}`;
    sources.sort((a, b) => edgeOrder(a).localeCompare(edgeOrder(b)));
    interactions.sort((a, b) => edgeOrder(a).localeCompare(edgeOrder(b)));
    effects.push({
      effectId,
      effectName: str(eff.effectName),
      effectTags: asArray(eff.effectTags).map(String),
      exclusiveDollId,
      exclusiveDollName: dollName(exclusiveDollId),
      sources,
      interactions,
    });
  }
  effects.sort((a, b) =>
    (a.effectName ?? '').localeCompare(b.effectName ?? '')
  );

  // --- Stats ---

  const edgesByRelation: Record<Relation, number> = {
    applies: 0,
    gains: 0,
    removes: 0,
    conditional: 0,
    enhances: 0,
    includes: 0,
    considered: 0,
    mentions: 0,
  };
  const edgesByKind: Record<string, number> = {};
  const mentions: DeriveStats['mentions'] = [];
  for (const [effectId, byKey] of edgesByEffect) {
    for (const edge of byKey.values()) {
      edgesByRelation[edge.relation]++;
      edgesByKind[edge.kind] = (edgesByKind[edge.kind] ?? 0) + 1;
      if (edge.relation === 'mentions') {
        mentions.push({
          effectName: effectById.get(effectId)?.name ?? null,
          source: describeEdge(edge),
          snippet: edge.snippet,
        });
      }
    }
  }

  return {
    file: {
      generator: GENERATOR,
      syncedAt: new Date().toISOString(),
      effects,
      unresolvedRefs,
    },
    stats: {
      edgesByRelation,
      edgesByKind,
      effectsTotal: effects.length,
      effectsWithSources: effects.filter((e) => e.sources.length > 0).length,
      effectsWithInteractions: effects.filter((e) => e.interactions.length > 0)
        .length,
      mentions,
    },
  };
}

/** Human-readable one-liner for an edge (used by the QA report). */
export function describeEdge(edge: MatrixEdge): string {
  switch (edge.kind) {
    case 'skill':
      return `${edge.dollName} — ${edge.skillType ?? 'Skill'}: ${edge.skillName ?? '?'} (lv ${edge.levels.join(',')})`;
    case 'summon-skill':
      return `${edge.dollName} — summon ${edge.summonName ?? '?'}: ${edge.skillName ?? '?'} (lv ${edge.levels.join(',')})`;
    case 'summon':
      return `${edge.dollName} — summon ${edge.summonName ?? '?'} (${edge.path})`;
    case 'vertebrae':
      return `${edge.dollName} — Vertebrae lv${edge.level ?? '?'}${edge.segment != null ? `.${edge.segment}` : ''}`;
    case 'remolding':
      return `${edge.dollName} — Remolding${edge.stage != null ? ` stage ${edge.stage}` : ''} (${edge.path})`;
    case 'weapon':
      return `Weapon: ${edge.weaponName} (${edge.field})`;
    case 'weapon-imprint':
      return `${edge.dollName ?? '?'} — imprint ${edge.weaponName ?? '?'} (${edge.field})`;
    case 'key':
      return `${edge.dollName ?? '?'} — Key: ${edge.keyTitle ?? '?'} (${edge.keyType ?? '?'})`;
    case 'effect':
      return `Effect: ${edge.effectName ?? edge.effectId}${edge.ownerDollName ? ` (${edge.ownerDollName})` : ''}`;
  }
}

/** Read the committed JSON artifacts, build the matrix, write the output. */
export async function deriveEffectMatrix(dataDir: string): Promise<{
  file: EffectMatrixFile;
  stats: DeriveStats;
}> {
  const [dollsJson, weaponsJson, keysJson, effectsJson] = await Promise.all([
    readFile(join(dataDir, 'dolls.json'), 'utf8'),
    readFile(join(dataDir, 'weapons.json'), 'utf8'),
    readFile(join(dataDir, 'keys.json'), 'utf8'),
    readFile(join(dataDir, 'effects.json'), 'utf8'),
  ]);

  const input: DeriveInput = {
    dolls: (JSON.parse(dollsJson) as { dolls: Record<string, unknown>[] }).dolls,
    weapons: (JSON.parse(weaponsJson) as { weapons: Record<string, unknown>[] })
      .weapons,
    keys: (JSON.parse(keysJson) as { keys: Record<string, unknown>[] }).keys,
    effects: (JSON.parse(effectsJson) as { effects: Record<string, unknown>[] })
      .effects,
  };

  const { file, stats } = buildEffectMatrix(input);

  await writeFile(
    join(dataDir, 'effect-matrix.json'),
    JSON.stringify(file, null, 2) + '\n'
  );

  return { file, stats };
}

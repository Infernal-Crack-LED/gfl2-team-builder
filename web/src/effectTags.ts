/**
 * Effect tags — typed access to `data/effect-tags.json` (produced by
 * `npm run derive`, automatically at the end of every sync) plus the query
 * helpers that answer "all sources of X" for buffs/debuffs.
 *
 * Tags are derived per effect (see `src/derive/effectTags.ts`) from the
 * upstream `effectTags` plus the effect's details text; the sidecar map is
 * keyed by effect id and the vocabulary is self-describing ({label, blurb,
 * group}) so the UI never hardcodes tag labels.
 *
 * Canonical query: `sourcesForTag('defense-down')` returns every matrix
 * source edge (skill / weapon / key / vertebrae / summon / remolding) that
 * confers a defense-down-tagged effect.
 */

import tagsJson from '../../data/effect-tags.json';
import {
  matrixEffects,
  type MatrixEdge,
  type MatrixEffectJson,
} from './effectMatrix';

// --- JSON shapes (mirror src/derive/effectTags.ts output) ---

export interface EffectTagVocabularyEntry {
  label: string;
  blurb: string;
  group: string;
}

interface EffectTagsFileJson {
  generator: string;
  syncedAt: string;
  vocabulary: Record<string, EffectTagVocabularyEntry>;
  tags: Record<string, string[]>;
}

// --- Loaded tags ---

const tagsData = tagsJson as unknown as EffectTagsFileJson;

export const effectTagVocabulary: Record<string, EffectTagVocabularyEntry> =
  tagsData.vocabulary;

const tagsByEffectId = new Map<string, string[]>(Object.entries(tagsData.tags));

/** Derived tag ids for an effect (empty array when untagged). */
export function getEffectTags(effectId: string): string[] {
  return tagsByEffectId.get(effectId) ?? [];
}

/** Player-facing label for a tag id (falls back to the id itself). */
export function effectTagLabel(tagId: string): string {
  return effectTagVocabulary[tagId]?.label ?? tagId;
}

/** Vocabulary grouped for filter UIs, in definition order. */
export function effectTagsByGroup(): {
  group: string;
  tags: { id: string; label: string; blurb: string }[];
}[] {
  const groups = new Map<
    string,
    { id: string; label: string; blurb: string }[]
  >();
  for (const [id, entry] of Object.entries(effectTagVocabulary)) {
    let list = groups.get(entry.group);
    if (!list) {
      list = [];
      groups.set(entry.group, list);
    }
    list.push({ id, label: entry.label, blurb: entry.blurb });
  }
  return [...groups.entries()].map(([group, tags]) => ({ group, tags }));
}

/** Every matrix effect carrying the tag — e.g. `effectsWithTag('defense-down')`. */
export function effectsWithTag(tagId: string): MatrixEffectJson[] {
  return matrixEffects.filter((effect) =>
    tagsByEffectId.get(effect.effectId)?.includes(tagId)
  );
}

export interface EffectTagSource {
  effect: MatrixEffectJson;
  source: MatrixEdge;
}

/**
 * Every source that confers a tagged effect — the "all sources of defense
 * down" query. Sources are matrix `applies`/`gains` edges and carry the raw
 * text snippet for display.
 */
export function sourcesForTag(tagId: string): EffectTagSource[] {
  return effectsWithTag(tagId).flatMap((effect) =>
    effect.sources.map((source) => ({ effect, source }))
  );
}

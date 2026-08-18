/**
 * Generic common keys that the upstream Dandegate API does not carry.
 *
 * Dandegate only lists the per-doll common keys (each tied to a dollId). The
 * stat-only generics — equipable by any doll — are absent, so they are
 * maintained here and merged into the key sets at the load boundaries
 * (`web/src/data.ts` and `src/server/gameData.ts`). Keeping them in code
 * (not in data/keys.json) means a re-sync never wipes them.
 *
 * DOM-free and dependency-free — imported by both the browser bundle and the
 * Node server, same contract as buildCode.ts. Ids are fixed synthetic UUIDs:
 * share codes reference common keys by id, so these must never change.
 */

export interface GenericCommonKey {
  id: string;
  keyTitle: string;
  displayTitle: string;
  keyType: string;
  level: number | null;
  attributes: { name: string; value: string }[];
  effect: string | null;
  materials: Record<string, unknown> | null;
  dollId: string | null;
  imageUrl: string | null;
  regionTag: string | null;
  searchTags: string[];
}

function genericCommonKey(
  id: string,
  keyTitle: string,
  attributes: { name: string; value: string }[]
): GenericCommonKey {
  return {
    id,
    keyTitle,
    displayTitle: `Common Key - ${keyTitle}`,
    keyType: 'Common Key',
    level: null,
    attributes,
    effect: null,
    materials: null,
    dollId: null,
    imageUrl: null,
    regionTag: null,
    searchTags: [],
  };
}

export const GENERIC_COMMON_KEYS: GenericCommonKey[] = [
  genericCommonKey('00000000-0000-4000-8000-000000000001', 'Generic Atk/Crit', [
    { name: 'Attack Boost', value: '3%' },
    { name: 'Crit Rate', value: '3%' },
  ]),
  genericCommonKey('00000000-0000-4000-8000-000000000002', 'Generic Atk/Def', [
    { name: 'Attack Boost', value: '3%' },
    { name: 'Defense Boost', value: '3%' },
  ]),
  genericCommonKey('00000000-0000-4000-8000-000000000003', 'Generic Atk/Hp', [
    { name: 'Attack Boost', value: '3%' },
    { name: 'Health Boost', value: '3%' },
  ]),
  // Unspecified generic placeholder — used when a community sheet lists
  // "Global" or "Affinity" without naming a specific key.
  genericCommonKey('00000000-0000-4000-8000-000000000004', 'Generic Key', []),
];

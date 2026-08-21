/**
 * Server binding for the community build recommendations.
 *
 * The join rules live in `src/share/recommendations.ts`; this supplies the
 * lookups over the committed `data/*.json` rows, exactly as
 * `web/src/recommendations.ts` does over the client's copy. Two bindings, one
 * set of rules — so the panel a crawler is served resolves the same weapons,
 * the same keys and the same signature-weapon fallbacks the visitor sees.
 *
 * Read straight from `data/recommendations-source.json` at boot: it is a build
 * input like every other artifact here, and the no-JS body cannot wait on a
 * database round-trip.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  WEAPON_ALIASES,
  hydrateRecommendation,
  normName,
  parseKeyLabel,
  type HydratedRecommendation,
  type RecLink,
  type RecLookups,
  type RecommendationSource,
} from '../share/recommendations.js';
import {
  allKeys,
  allWeapons,
  type DollEntry,
  type KeyEntry,
  type WeaponEntry,
} from './gameData.js';

const SOURCE = JSON.parse(
  readFileSync(path.resolve('data', 'recommendations-source.json'), 'utf8')
) as Record<string, RecommendationSource>;

/** Weapon names normalized for matching, plus the sheet's known spellings. */
const weaponByNorm = new Map(allWeapons().map((w) => [normName(w.name), w]));
for (const [alias, canonical] of WEAPON_ALIASES) {
  const target = weaponByNorm.get(normName(canonical));
  if (target) {
    weaponByNorm.set(normName(alias), target);
  }
}

function weaponLink(w: WeaponEntry): RecLink {
  return {
    label: w.name,
    href: `/weapons/${w.slug}`,
    detail: w.effect,
    meta: [w.rarity, w.trait].filter(Boolean).join(' · ') || null,
    icon: w.imageUrl,
  };
}

function lookupsFor(doll: DollEntry): RecLookups {
  const dollKeys = allKeys().filter((k: KeyEntry) => k.dollId === doll.id);
  const sig = allWeapons().find((w) => w.imprintDollId === doll.id) ?? null;

  return {
    signatureWeapon: () => (sig ? weaponLink(sig) : null),

    weaponByName: (name: string): RecLink | null => {
      const w = weaponByNorm.get(normName(name));
      return w ? weaponLink(w) : null;
    },

    keyByLabel: (label: string): RecLink | null => {
      const { slot, name } = parseKeyLabel(label);
      const match =
        // The slot is unambiguous within one doll's six fixed keys.
        (slot !== null
          ? dollKeys.find((k) => k.keyType === 'Fixed Key' && k.level === slot)
          : undefined) ??
        (name
          ? allKeys().find(
              (k) =>
                normName(k.displayTitle ?? k.keyTitle ?? '') === normName(name)
            )
          : undefined);
      if (!match) {
        return null;
      }
      return {
        label: match.displayTitle ?? match.keyTitle ?? label,
        href: null,
        detail: match.effect ?? null,
        meta: match.level ? `Slot ${match.level}` : (match.keyType ?? null),
        icon: null,
      };
    },
  };
}

/** The hydrated recommendation for a doll, or null when the sheet has none. */
export function recommendationFor(
  doll: DollEntry
): HydratedRecommendation | null {
  return hydrateRecommendation(doll.slug, SOURCE[doll.slug], lookupsFor(doll));
}

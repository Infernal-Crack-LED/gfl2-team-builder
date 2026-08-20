/**
 * Client binding for the community build recommendations.
 *
 * The join rules live in `src/share/recommendations.ts`; this supplies the
 * lookups over the client's own rows, so a weapon named by the sheet resolves
 * to the same trait text and the same /weapons/<slug> link the crawler body
 * gets from the server.
 */
import recommendationsJson from '../../data/recommendations-source.json';
import {
  allKeys,
  allWeapons,
  getKeysForDoll,
  type Doll,
  type Weapon,
} from './data';
import { stripHtml } from '../../src/share/html';
import {
  WEAPON_ALIASES,
  hydrateRecommendation,
  normName,
  parseKeyLabel,
  type HydratedRecommendation,
  type RecLink,
  type RecLookups,
  type RecommendationSource,
} from '../../src/share/recommendations';

export {
  RECOMMENDATION_CREDIT,
  type HydratedRecommendation,
  type RecLink,
} from '../../src/share/recommendations';

const SOURCE = recommendationsJson as unknown as Record<
  string,
  RecommendationSource
>;

/**
 * Weapon names normalized for matching, plus the maintainer-confirmed aliases
 * the sheet uses (shared with the DB importer — see share/recommendations.ts).
 */
const weaponByNorm = new Map(allWeapons.map((w) => [normName(w.name), w]));
for (const [alias, canonical] of WEAPON_ALIASES) {
  const target = weaponByNorm.get(normName(canonical));
  if (target) {
    weaponByNorm.set(normName(alias), target);
  }
}

/**
 * The RAW game text, or null when there is none. Deliberately not flattened
 * here: `[<kind>:<uuid>]` markers and Tiptap HTML are resolved at render time
 * by <RichText>, the one module that does it, so an effect reference in this
 * panel looks and behaves exactly as it does on the doll and weapon pages.
 */
function gameText(text: string | null | undefined): string | null {
  return typeof text === 'string' && stripHtml(text)?.trim() ? text : null;
}

/** A weapon row as the panel's link shape. */
function weaponLink(w: Weapon): RecLink {
  return {
    label: w.name,
    href: `/weapons/${w.slug}`,
    detail: gameText(w.effect),
    meta: [w.rarity, w.trait].filter(Boolean).join(' · ') || null,
  };
}

function lookupsFor(doll: Doll): RecLookups {
  // Fixed keys are scoped to the doll: the sheet says "Fixed Key 2 - Name",
  // and slot 2 means a different key for every doll.
  const dollKeys = getKeysForDoll(doll.id);
  const sig = allWeapons.find((w) => w.imprintDollId === doll.id) ?? null;

  return {
    signatureWeapon: () => (sig ? weaponLink(sig) : null),
    weaponByName: (name: string): RecLink | null => {
      const w = weaponByNorm.get(normName(name));
      return w ? weaponLink(w) : null;
    },

    keyByLabel: (label: string): RecLink | null => {
      const { slot, name } = parseKeyLabel(label);
      const match =
        // Prefer the slot: it is unambiguous within one doll's six keys.
        (slot !== null
          ? dollKeys.find((k) => k.keyType === 'Fixed Key' && k.level === slot)
          : undefined) ??
        // Otherwise fall back to a name match anywhere in the pool, which is
        // how expansion and common keys resolve.
        (name
          ? allKeys.find(
              (k) =>
                normName(k.displayTitle ?? k.keyTitle ?? '') === normName(name)
            )
          : undefined);
      if (!match) {
        return null;
      }
      const title = match.displayTitle ?? match.keyTitle ?? label;
      return {
        label: title,
        href: null, // keys have no detail page of their own yet
        detail: gameText(match.effect),
        meta: match.level ? `Slot ${match.level}` : match.keyType,
      };
    },
  };
}

/** The hydrated recommendation for a doll, or null when the sheet has none. */
export function recommendationFor(doll: Doll): HydratedRecommendation | null {
  return hydrateRecommendation(doll.slug, SOURCE[doll.slug], lookupsFor(doll));
}

/** Slugs the sheet covers — 62 of 64 today. */
export function recommendedSlugs(): string[] {
  return Object.keys(SOURCE);
}

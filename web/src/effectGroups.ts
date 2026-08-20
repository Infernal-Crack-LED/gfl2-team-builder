/**
 * Doll-page effect list: dedup + upgrade-source attribution.
 *
 * The dataset ships one effect record per citation context, so a doll's
 * effect list carries exact duplicates (same name + details under two ids)
 * and upgraded variants (Helen's Succor again with the V4 bonus folded in).
 * This module collapses the former and labels the latter with what unlocks
 * them, derived entirely from who cites the effect id:
 *
 *   - the base skill description        → base kit (no label)
 *   - a levelled skill description      → the vertebra that unlocks that
 *     level (`skill.vertebraeUpgradeLevelN.segment` → "V4")
 *   - a vertebra's own effect text      → that vertebra
 *   - a key's effect text               → that key ("Fixed Key 2" / title)
 *   - another effect's details (chains) → that effect's source, transitively
 *
 * When one id is cited from several contexts the base kit wins, then keys,
 * then vertebrae — an effect referenced by the base kit isn't "from V4" just
 * because the V4 text also mentions it.
 */
import {
  getEffectsForDoll,
  getKeysForDoll,
  getVertebraeForDoll,
  type Doll,
  type Effect,
} from './data';

export interface EffectVariant {
  effect: Effect;
  /** What unlocks this variant — "V4", "Fixed Key 2", a key title — or null
   * for the base kit (and for names with only one distinct variant). */
  source: string | null;
}

const RANK_BASE = 0;
const RANK_KEY = 1;
const RANK_VERTEBRA = 2;

function markerIds(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of String(text ?? '').matchAll(/\[effect:([^\]]+)\]/g)) {
    out.push(m[1]!);
  }
  return out;
}

/** The doll's effects, exact duplicates collapsed, upgrade variants labeled. */
export function getDollEffectVariants(doll: Doll): EffectVariant[] {
  const effects = getEffectsForDoll(doll.id);
  if (effects.length === 0) {
    return [];
  }

  const src = new Map<string, { rank: number; label: string | null }>();
  const record = (id: string, rank: number, label: string | null) => {
    const cur = src.get(id);
    if (!cur || rank < cur.rank) {
      src.set(id, { rank, label });
    }
  };

  for (const sk of doll.skills ?? []) {
    for (const id of markerIds(sk.description)) {
      record(id, RANK_BASE, null);
    }
    for (const lv of [2, 3, 4] as const) {
      const upgrade = sk[`vertebraeUpgradeLevel${lv}`] as {
        segment?: number | null;
      } | null;
      const seg = upgrade?.segment;
      const label = seg != null ? `V${seg}` : null;
      for (const id of markerIds(sk[`descriptionLevel${lv}`])) {
        record(id, label ? RANK_VERTEBRA : RANK_BASE, label);
      }
    }
  }

  for (const v of getVertebraeForDoll(doll)) {
    const label = v.segment != null ? `V${v.segment}` : null;
    for (const id of markerIds(v.effect)) {
      record(id, RANK_VERTEBRA, label);
    }
  }

  for (const k of getKeysForDoll(doll.id)) {
    const label =
      k.keyType === 'Fixed Key' && k.level != null
        ? `Fixed Key ${k.level}`
        : (k.displayTitle ?? k.keyTitle ?? 'Key');
    for (const id of markerIds(k.effect)) {
      record(id, RANK_KEY, label);
    }
  }

  // Chains: an effect only cited by another effect (Hunting Instinct Ⅱ from
  // Ⅰ's details) inherits the citing effect's source. Bounded fixpoint.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const e of effects) {
      const s = src.get(e.id);
      if (!s) {
        continue;
      }
      for (const id of markerIds(e.effectDetails)) {
        const cur = src.get(id);
        if (!cur || s.rank < cur.rank) {
          src.set(id, s);
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }

  // Group by name in first-appearance order; collapse identical details.
  const groups = new Map<string, Effect[]>();
  for (const e of effects) {
    const name = e.effectName ?? e.id;
    const g = groups.get(name);
    if (g) {
      g.push(e);
    } else {
      groups.set(name, [e]);
    }
  }

  const out: EffectVariant[] = [];
  for (const g of groups.values()) {
    const seen = new Set<string>();
    const variants: EffectVariant[] = [];
    for (const e of g) {
      const detailsKey = e.effectDetails ?? '';
      if (seen.has(detailsKey)) {
        continue;
      }
      seen.add(detailsKey);
      variants.push({ effect: e, source: src.get(e.id)?.label ?? null });
    }
    if (variants.length === 1) {
      // a lone variant needs no provenance chip, wherever it's cited from
      out.push({ effect: variants[0]!.effect, source: null });
    } else {
      variants.sort(
        (a, b) => (a.source === null ? 0 : 1) - (b.source === null ? 0 : 1)
      );
      out.push(...variants);
    }
  }
  return out;
}

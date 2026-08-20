/**
 * Weapon counterpart cards — the same gun at its other rarity tiers.
 *
 * Both detail pages show these: a doll's page lists her imprint weapon's Elite
 * twin, and a weapon's own page lists all three relations. They render through
 * ONE component so the two can't drift into different-looking cards.
 *
 * The counterpart blobs in weapons.json carry only `{ id, name, slug }` — no
 * rarity and no art. Everything past the name therefore comes from RESOLVING
 * the id against the weapon table (which is also why the link must use the
 * resolved SLUG: detail routes are keyed by slug, so an id-based href would
 * land on "Weapon not found"). A blob that fails to resolve still renders off
 * its own name and slug, just without art — degrade, never vanish.
 */
import { getWeaponById, type Weapon } from '../data';
import { GameIcon } from './GameIcon';
import { hrefForWeapon, onSpaLinkClick } from '../router';

/** Which tier a counterpart sits at, relative to the weapon showing it. */
export type CounterpartRelation = 'Elite' | 'Standard' | 'Retired';

export interface ResolvedCounterpart {
  relation: CounterpartRelation;
  /** Resolved weapon slug — null when the blob carried none either. */
  slug: string | null;
  name: string;
  rarity: string | null;
  imageUrl: string | null;
}

const RELATION_FIELD: Record<CounterpartRelation, keyof Weapon> = {
  Elite: 'eliteCounterpart',
  Standard: 'standardCounterpart',
  Retired: 'retiredCounterpart',
};

/**
 * A weapon's counterparts, in tier order, skipping the relations it doesn't
 * have. Callers own the empty case — a page section says "no data" where an
 * inline block hides itself.
 */
export function counterpartsOf(
  weapon: Weapon,
  relations: readonly CounterpartRelation[] = ['Elite', 'Standard', 'Retired']
): ResolvedCounterpart[] {
  const out: ResolvedCounterpart[] = [];
  for (const relation of relations) {
    const blob = weapon[RELATION_FIELD[relation]] as Record<
      string,
      unknown
    > | null;
    if (!blob) {
      continue;
    }
    const id = blob.id as string | undefined;
    const resolved = id ? getWeaponById(id) : undefined;
    const name = resolved?.name ?? (blob.name as string | undefined);
    if (!name) {
      continue;
    }
    out.push({
      relation,
      slug: resolved?.slug ?? (blob.slug as string | undefined) ?? null,
      name,
      rarity: resolved?.rarity ?? null,
      imageUrl: resolved?.imageUrl ?? null,
    });
  }
  return out;
}

/**
 * The card grid. `showRelation` labels each card with its tier — the weapon
 * page needs it (three cards, and the label is the only thing distinguishing
 * "the Standard version" from "the Retired one"), the doll page doesn't (one
 * card, whose rarity pill already says Elite).
 */
export function CounterpartCards({
  counterparts,
  showRelation = false,
}: {
  counterparts: ResolvedCounterpart[];
  showRelation?: boolean;
}) {
  return (
    <div className="counterpart-grid">
      {counterparts.map((c) => {
        // With the relation shown, a rarity pill saying the same word twice is
        // noise — a Standard counterpart is Standard rarity. It only earns its
        // place when the two differ (or when nothing else states the tier).
        const showRarity =
          c.rarity && (!showRelation || c.rarity !== c.relation);
        const inner = (
          <div className="counterpart-card">
            {c.imageUrl ? (
              <GameIcon
                className="portrait portrait-contain counterpart-img"
                src={c.imageUrl}
                alt={c.name}
              />
            ) : (
              <div
                className="portrait portrait-empty counterpart-img"
                aria-hidden="true"
              >
                ?
              </div>
            )}
            <div className="counterpart-info">
              {showRelation && (
                <span className="counterpart-relation">{c.relation}</span>
              )}
              <strong>{c.name}</strong>
              {showRarity && c.rarity && (
                <span
                  className={
                    'unit-ident' + (c.rarity === 'Elite' ? ' elite' : '')
                  }
                >
                  {c.rarity}
                </span>
              )}
            </div>
          </div>
        );

        return c.slug ? (
          <a
            key={c.relation}
            href={hrefForWeapon(c.slug)}
            onClick={onSpaLinkClick(hrefForWeapon(c.slug))}
            className="counterpart-link"
          >
            {inner}
          </a>
        ) : (
          <div key={c.relation}>{inner}</div>
        );
      })}
    </div>
  );
}

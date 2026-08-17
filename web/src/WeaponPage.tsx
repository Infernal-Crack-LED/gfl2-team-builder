/**
 * Weapon detail page — everything derived from data/*.json. Degrades, never
 * vanishes. Sets its own document head.
 */
import { useEffect } from 'react';
import { getDollById, getWeaponById, getWeaponBySlug } from './data';
import { GameIcon } from './components/GameIcon';
import { RichText } from './components/RichText';
import { hrefFor, hrefForDoll, hrefForWeapon, onSpaLinkClick } from './router';
import { escapeJsonLd } from './jsonLd';
import { setDetailMeta, weaponPageMeta } from './useDocumentHead';

export function WeaponPage({ slug }: { slug: string | null }) {
  const weapon = slug ? getWeaponBySlug(slug) : undefined;

  useEffect(() => {
    if (weapon) {
      const meta = weaponPageMeta(weapon);
      setDetailMeta(meta.title, meta.description);

      const existing = document.getElementById('jsonld-page');
      if (existing) {
        existing.remove();
      }
      const script = document.createElement('script');
      script.id = 'jsonld-page';
      script.type = 'application/ld+json';
      script.innerHTML = escapeJsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${weapon.name} — GFL2 Weapon`,
        about: { '@type': 'Thing', name: weapon.name },
      });
      document.head.appendChild(script);
      return () => {
        script.remove();
      };
    }
  }, [weapon]);

  if (!weapon) {
    return (
      <div className="app weaponpage">
        <h1>Weapon not found</h1>
        <p className="muted">
          <a
            href={hrefFor('weapons')}
            onClick={onSpaLinkClick(hrefFor('weapons'))}
          >
            ← Back to weapons
          </a>
        </p>
      </div>
    );
  }

  const imprintDoll = weapon.imprintDollId
    ? getDollById(weapon.imprintDollId)
    : undefined;

  // Resolve counterpart links. Detail routes are keyed by slug (see
  // router.slugFromPath), so return the counterpart's slug, not its id —
  // an id-based href would land on "Weapon not found".
  const resolveCounterpart = (
    cp: Record<string, unknown> | null
  ): { slug: string; name: string } | null => {
    if (!cp) {
      return null;
    }
    const id = cp.id as string | undefined;
    if (!id) {
      return null;
    }
    const w = getWeaponById(id);
    return w ? { slug: w.slug, name: w.name } : null;
  };

  const elite = resolveCounterpart(weapon.eliteCounterpart);
  const standard = resolveCounterpart(weapon.standardCounterpart);
  const retired = resolveCounterpart(weapon.retiredCounterpart);

  return (
    <div className="app weaponpage">
      {/* Breadcrumb */}
      <nav className="unit-crumbs">
        <a
          href={hrefFor('weapons')}
          onClick={onSpaLinkClick(hrefFor('weapons'))}
        >
          Weapons
        </a>
        {' / '}
        {weapon.name}
      </nav>

      {/* Header */}
      <div className="weaponpage-header">
        <div className="weaponpage-image">
          {weapon.imageUrl ? (
            // Weapon art is wide (512×256) with transparency —
            // .portrait-contain letterboxes instead of cropping.
            <GameIcon
              className="portrait portrait-contain"
              src={weapon.imageUrl}
              alt={weapon.name}
            />
          ) : (
            <div className="portrait portrait-empty" aria-hidden="true">
              ?
            </div>
          )}
        </div>
        <div className="weaponpage-info">
          <h1>{weapon.name}</h1>
          <div className="unit-idents">
            {weapon.rarity && (
              <span
                className={
                  'unit-ident' + (weapon.rarity === 'Elite' ? ' elite' : '')
                }
              >
                {weapon.rarity}
              </span>
            )}
            {weapon.weaponType && (
              <span className="unit-ident">{weapon.weaponType}</span>
            )}
            {weapon.primaryAttribute && (
              <span className="unit-ident">
                {weapon.primaryAttribute}
                {weapon.primaryAttributeStat != null
                  ? ` ${weapon.primaryAttributeStat}`
                  : ''}
              </span>
            )}
            {weapon.secondaryAttribute && (
              <span className="unit-ident">
                {weapon.secondaryAttribute}
                {weapon.secondaryAttributeStat
                  ? ` ${weapon.secondaryAttributeStat}`
                  : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Trait */}
      <section className="unit-section unit-panel">
        <h2>Trait</h2>
        {weapon.trait ? (
          <RichText text={weapon.trait} />
        ) : (
          <p className="muted">No trait data.</p>
        )}
      </section>

      {/* Effect */}
      <section className="unit-section unit-panel">
        <h2>Effect</h2>
        {weapon.effect ? (
          <RichText text={weapon.effect} />
        ) : (
          <p className="muted">No effect data.</p>
        )}
      </section>

      {/* Imprint doll */}
      <section className="unit-section unit-panel">
        <h2>Imprint Doll</h2>
        {imprintDoll ? (
          <div>
            <a
              href={hrefForDoll(imprintDoll.slug)}
              onClick={onSpaLinkClick(hrefForDoll(imprintDoll.slug))}
            >
              {imprintDoll.name}
            </a>
            <RichText text={weapon.imprintDescription} className="muted" />
          </div>
        ) : (
          <p className="muted">No imprint doll.</p>
        )}
      </section>

      {/* Counterparts */}
      <section className="unit-section unit-panel">
        <h2>Counterparts</h2>
        {elite || standard || retired ? (
          <ul>
            {elite && (
              <li>
                Elite:{' '}
                <a
                  href={hrefForWeapon(elite.slug)}
                  onClick={onSpaLinkClick(hrefForWeapon(elite.slug))}
                >
                  {elite.name}
                </a>
              </li>
            )}
            {standard && (
              <li>
                Standard:{' '}
                <a
                  href={hrefForWeapon(standard.slug)}
                  onClick={onSpaLinkClick(hrefForWeapon(standard.slug))}
                >
                  {standard.name}
                </a>
              </li>
            )}
            {retired && (
              <li>
                Retired:{' '}
                <a
                  href={hrefForWeapon(retired.slug)}
                  onClick={onSpaLinkClick(hrefForWeapon(retired.slug))}
                >
                  {retired.name}
                </a>
              </li>
            )}
          </ul>
        ) : (
          <p className="muted">No counterpart data.</p>
        )}
      </section>

      {/* Tools */}
      <section className="unit-section unit-panel">
        <h2>Tools</h2>
        <div className="unit-tools">
          <a
            className="chip"
            href={hrefFor('weapons')}
            onClick={onSpaLinkClick(hrefFor('weapons'))}
          >
            All Weapons
          </a>
          <a
            className="chip"
            href={hrefFor('characters')}
            onClick={onSpaLinkClick(hrefFor('characters'))}
          >
            All Characters
          </a>
          <a
            className="chip"
            href={hrefFor('team-builder')}
            onClick={onSpaLinkClick(hrefFor('team-builder'))}
          >
            Team Builder
          </a>
        </div>
      </section>
    </div>
  );
}

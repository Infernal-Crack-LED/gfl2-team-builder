/**
 * Weapon detail page — everything derived from data/*.json. Degrades, never
 * vanishes. Sets its own document head.
 */
import { useEffect } from 'react';
import { getDollById, getWeaponBySlug } from './data';
import { GameIcon } from './components/GameIcon';
import { RichText } from './components/RichText';
import {
  CounterpartCards,
  counterpartsOf,
} from './components/WeaponCounterparts';
import { hrefFor, hrefForDoll, onSpaLinkClick } from './router';
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

  // Counterpart resolution (blob id → the real weapon row, for its slug, art
  // and rarity) is shared with the doll page — see components/WeaponCounterparts.
  const counterparts = counterpartsOf(weapon);

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
          <div className="weaponpage-imprint">
            {/* Portrait + name as one link, mirroring the counterpart cards:
                the doll is the subject of this panel, so she gets a face. */}
            <a
              className="weaponpage-imprint-doll"
              href={hrefForDoll(imprintDoll.slug)}
              onClick={onSpaLinkClick(hrefForDoll(imprintDoll.slug))}
            >
              {imprintDoll.avatarUrl ? (
                <GameIcon
                  className="portrait weaponpage-imprint-portrait"
                  src={imprintDoll.avatarUrl}
                  alt={imprintDoll.name}
                />
              ) : (
                <div
                  className="portrait portrait-empty weaponpage-imprint-portrait"
                  aria-hidden="true"
                >
                  ?
                </div>
              )}
              <span className="weaponpage-imprint-info">
                <strong>{imprintDoll.name}</strong>
                <span className="muted">
                  {[imprintDoll.class, imprintDoll.phase, imprintDoll.rarity]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
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
        {counterparts.length > 0 ? (
          <CounterpartCards counterparts={counterparts} showRelation />
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

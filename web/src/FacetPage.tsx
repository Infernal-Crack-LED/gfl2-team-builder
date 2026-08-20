/**
 * Facet landing page — `/characters/class/sentinel`, `/weapons/type/blade`.
 *
 * The complete membership of one category, which is the whole point: these
 * queries ("gfl2 sentinel dolls") are answered elsewhere with three examples
 * inside a tier list, and answered here with all of them.
 *
 * The pool is pre-restricted to the facet, then handed to the SAME filter hook
 * the full catalogue uses — so a visitor who lands on Sentinels can still
 * narrow by phase without leaving, and the filter UI has one implementation.
 *
 * A path that is not a real facet renders the not-found body rather than an
 * empty grid; the server 404s the same URL, so the two agree.
 */
import { useEffect } from 'react';
import { DollCards, DollFilters, useDollFilter } from './components/DollGrid';
import {
  WeaponCards,
  WeaponFilters,
  useWeaponFilter,
} from './components/WeaponGrid';
import {
  facetDescription,
  facetFromPath,
  facetHeading,
  facetMembers,
  facetTitle,
  facetsInGroup,
  introFor,
  type Facet,
} from './facets';
import { escapeJsonLd } from './jsonLd';
import { setDetailMeta } from './useDocumentHead';
import { hrefFor, onSpaLinkClick, useLocationPathname } from './router';
import type { Doll, Weapon } from './data';

/** Sibling facets plus the parent catalogue — the page's "Related" row. */
function RelatedFacets({ facet }: { facet: Facet }) {
  const siblings = facetsInGroup(facet.group.key).filter(
    (f) => f.slug !== facet.slug
  );
  if (siblings.length === 0) {
    return null;
  }
  const parent = facet.group.base;
  return (
    <section className="unit-section">
      <h2>Related</h2>
      <div className="unit-tools">
        {siblings.map((f) => (
          <a key={f.path} href={f.path} onClick={onSpaLinkClick(f.path)}>
            {facetHeading(f)}
          </a>
        ))}
        <a href={parent} onClick={onSpaLinkClick(parent)}>
          {facet.group.entity === 'doll' ? 'All characters' : 'All weapons'}
        </a>
      </div>
    </section>
  );
}

function FacetHeader({ facet, count }: { facet: Facet; count: number }) {
  return (
    <header>
      <nav className="unit-crumbs">
        <a href={facet.group.base} onClick={onSpaLinkClick(facet.group.base)}>
          {facet.group.entity === 'doll' ? 'Characters' : 'Weapons'}
        </a>
        {' › '}
        <span>{facetHeading(facet)}</span>
      </nav>
      <h1>{facetHeading(facet)}</h1>
      <p className="muted">{introFor(facet)}</p>
      <p className="muted">
        {count} {facet.group.noun}.
      </p>
    </header>
  );
}

function DollFacet({ facet }: { facet: Facet }) {
  const members = facetMembers(facet) as Doll[];
  const filterResult = useDollFilter({ restrict: members });
  return (
    <div className="app characters-page">
      <FacetHeader facet={facet} count={members.length} />
      <DollFilters filterResult={filterResult} defaultOpen={false} />
      <DollCards dolls={filterResult.dolls} mode="navigation" />
      <RelatedFacets facet={facet} />
    </div>
  );
}

function WeaponFacet({ facet }: { facet: Facet }) {
  const members = facetMembers(facet) as Weapon[];
  const filterResult = useWeaponFilter({ restrict: members });
  return (
    <div className="app weapons-page">
      <FacetHeader facet={facet} count={members.length} />
      <WeaponFilters filterResult={filterResult} defaultOpen={false} />
      <WeaponCards weapons={filterResult.weapons} />
      <RelatedFacets facet={facet} />
    </div>
  );
}

export function FacetPage() {
  const pathname = useLocationPathname();
  const facet = facetFromPath(pathname);

  // Facet paths have two segments under the catalogue, which useDocumentHead
  // deliberately skips — so, like DollPage and WeaponPage, this page owns its
  // own head. Titles come from the shared taxonomy, so an SPA navigation lands
  // on the same title the server injected for a cold load.
  useEffect(() => {
    if (facet) {
      setDetailMeta(facetTitle(facet), facetDescription(facet));
    }
  }, [facet]);

  // CollectionPage JSON-LD naming the members, so the category and its
  // membership are machine-readable and not just a styled grid.
  useEffect(() => {
    if (!facet) {
      return;
    }
    const existing = document.getElementById('jsonld-page');
    if (existing) {
      existing.remove();
    }
    const script = document.createElement('script');
    script.id = 'jsonld-page';
    script.type = 'application/ld+json';
    script.innerHTML = escapeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: facetHeading(facet),
      description: introFor(facet),
      hasPart: facetMembers(facet)
        .slice(0, 100)
        .map((m) => ({ '@type': 'Thing', name: m.name })),
    });
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [facet]);

  if (!facet) {
    const home = hrefFor('home');
    return (
      <div className="app">
        <header>
          <h1>Not found</h1>
          <p className="muted">
            That category doesn’t exist.{' '}
            <a href={home} onClick={onSpaLinkClick(home)}>
              Back to the home page
            </a>
            .
          </p>
        </header>
      </div>
    );
  }

  return facet.group.entity === 'doll' ? (
    <DollFacet facet={facet} />
  ) : (
    <WeaponFacet facet={facet} />
  );
}

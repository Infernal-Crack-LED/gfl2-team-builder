/**
 * Weapons page — browsable weapon grid with filters.
 * Every card is a real <a href> for crawlability.
 */
import { useEffect } from 'react';
import {
  WeaponCards,
  WeaponFilters,
  useWeaponFilter,
} from './components/WeaponGrid';
import { escapeJsonLd } from './jsonLd';

export function WeaponsPage() {
  const filterResult = useWeaponFilter();

  useEffect(() => {
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
      name: 'GFL2 Weapons',
      description: "Browse every weapon in Girls' Frontline 2: Exilium.",
    });
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return (
    <div className="app weapons-page">
      <header>
        <h1>Weapons</h1>
        <p className="muted">
          Browse every weapon. Filter by rarity, type, and primary attribute.
        </p>
      </header>

      <WeaponFilters filterResult={filterResult} defaultOpen={true} />
      <WeaponCards weapons={filterResult.weapons} />
    </div>
  );
}

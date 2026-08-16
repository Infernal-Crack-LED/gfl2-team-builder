/**
 * Characters page — browsable doll grid with filters.
 * Every card is a real <a href> for crawlability.
 * JSON-LD: CollectionPage.
 */
import { useEffect } from 'react';
import { DollCards, DollFilters, useDollFilter } from './components/DollGrid';
import { escapeJsonLd } from './jsonLd';

export function CharactersPage() {
  const filterResult = useDollFilter();

  // JSON-LD for search engines
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
      name: 'GFL2 Characters',
      description: "Browse every doll in Girls' Frontline 2: Exilium.",
    });
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return (
    <div className="app characters-page">
      <header>
        <h1>Characters</h1>
        <p className="muted">
          Browse every doll. Filter by class, phase, weapon type, and more.
        </p>
      </header>

      <DollFilters filterResult={filterResult} defaultOpen={false} />
      <DollCards dolls={filterResult.dolls} mode="navigation" />
    </div>
  );
}

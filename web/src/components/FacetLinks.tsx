/**
 * "Browse by class / phase / weapon type" — the facet links a catalogue page
 * lists.
 *
 * These are what keep the facet pages from being orphans that only the sitemap
 * knows about: a crawler reaching /characters finds every facet as a real
 * link, and each facet links back. Mirrors `facetLinks()` in
 * src/server/noJsBody.ts, which renders the same rows server-side.
 */
import { facetsInGroup } from '../facets';
import { onSpaLinkClick } from '../router';

const GROUP_LABEL: Record<string, string> = {
  class: 'class',
  phase: 'phase',
  type: 'weapon type',
};

export function FacetLinks({ groups }: { groups: string[] }) {
  const rows = groups
    .map((key) => ({ key, facets: facetsInGroup(key) }))
    .filter((r) => r.facets.length > 0);
  if (rows.length === 0) {
    return null;
  }
  return (
    <>
      {rows.map(({ key, facets }) => (
        <div className="facet-row" key={key}>
          <span className="facet-row-label">
            Browse by {GROUP_LABEL[key] ?? key}
          </span>
          <div className="facet-links">
            {facets.map((f) => (
              <a key={f.path} href={f.path} onClick={onSpaLinkClick(f.path)}>
                {f.value} <span className="facet-count">{f.count}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

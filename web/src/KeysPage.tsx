/**
 * Keys page (/keys) — the whole key catalogue in one place, split into the
 * three sections a build actually chooses from: Fixed, Expansion, Common.
 *
 * Affinity keys are excluded by construction (see `browsableKeys` in data.ts):
 * they are an affinity-level reward with a flat stat line, identical in shape
 * for every doll, so listing 62 of them would bury the keys that are real
 * decisions.
 *
 * Filter semantics match DollGrid's (binding across the site): OR within a
 * row, AND across rows, empty row = inactive. Search matches the key title,
 * its effect text, the owning doll's name, and the sync's search tags.
 */
import { useMemo, useState } from 'react';
import {
  browsableKeys,
  getDollById,
  CLASS_OPTIONS,
  KEY_ATTRIBUTE_OPTIONS,
  KEY_TYPE_OPTIONS,
  PHASE_COLORS,
  PHASE_OPTIONS,
  type Doll,
  type Key,
} from './data';
import { FilterRow } from './components/FilterRow';
import { GameIcon } from './components/GameIcon';
import { RichText } from './components/RichText';
import { hrefForBuilder, hrefForDoll, onSpaLinkClick } from './router';

interface KeyFilterState {
  type: Set<string>;
  attribute: Set<string>;
  class: Set<string>;
  phase: Set<string>;
  search: string;
}

function emptyFilter(): KeyFilterState {
  return {
    type: new Set(),
    attribute: new Set(),
    class: new Set(),
    phase: new Set(),
    search: '',
  };
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** A key plus its owning doll, resolved once so filtering/sorting is cheap. */
interface KeyRow {
  key: Key;
  doll: Doll | undefined;
  /** Everything the search box matches against, pre-lowercased. */
  haystack: string;
}

const ROWS: KeyRow[] = browsableKeys.map((key) => {
  const doll = key.dollId ? getDollById(key.dollId) : undefined;
  return {
    key,
    doll,
    haystack: norm(
      [
        key.keyTitle ?? '',
        key.displayTitle ?? '',
        key.effect ?? '',
        doll?.name ?? '',
        ...(key.searchTags ?? []),
        ...(key.attributes ?? []).map((a) => `${a.name} ${a.value}`),
      ].join(' ')
    ),
  };
});

// Doll name first, then level, then title — stable and readable in every
// section. Keys with no owning doll (the generic common keys) sort first.
function compareRows(a: KeyRow, b: KeyRow): number {
  const an = a.doll?.name ?? '';
  const bn = b.doll?.name ?? '';
  if (an !== bn) {
    return an.localeCompare(bn);
  }
  if ((a.key.level ?? 0) !== (b.key.level ?? 0)) {
    return (a.key.level ?? 0) - (b.key.level ?? 0);
  }
  return (a.key.keyTitle ?? '').localeCompare(b.key.keyTitle ?? '');
}

function KeyCard({ row }: { row: KeyRow }) {
  const { key, doll } = row;
  const phaseColor = PHASE_COLORS[doll?.phase ?? ''] ?? 'var(--border)';
  const title = key.keyTitle ?? key.displayTitle ?? 'Unnamed key';

  return (
    <article className="keycard" style={{ borderLeftColor: phaseColor }}>
      <div className="keycard-head">
        {key.imageUrl ? (
          <GameIcon className="keycard-img" src={key.imageUrl} />
        ) : (
          <div className="keycard-img keycard-img-empty" aria-hidden="true">
            ?
          </div>
        )}
        <div className="keycard-titles">
          <h3 className="keycard-title">{title}</h3>
          <div className="keycard-meta">
            {doll ? (
              <a
                href={hrefForDoll(doll.slug)}
                onClick={onSpaLinkClick(hrefForDoll(doll.slug))}
              >
                {doll.name}
              </a>
            ) : (
              <span className="muted">Any doll</span>
            )}
            {key.level != null && (
              <span className="keycard-level">Lv.{key.level}</span>
            )}
          </div>
        </div>
      </div>

      {(key.attributes?.length ?? 0) > 0 && (
        <ul className="keycard-attrs">
          {key.attributes?.map((a, i) => (
            <li key={i}>
              <span className="keycard-attr-name">{a.name}</span>
              <span className="keycard-attr-value">{a.value}</span>
            </li>
          ))}
        </ul>
      )}

      {key.effect ? (
        <RichText text={key.effect} className="keycard-effect" />
      ) : (
        <p className="keycard-effect muted">Stat bonus only.</p>
      )}

      {doll && (
        <a
          className="keycard-build-link"
          href={hrefForBuilder(doll.slug)}
          onClick={onSpaLinkClick(hrefForBuilder(doll.slug))}
        >
          Build {doll.name} →
        </a>
      )}
    </article>
  );
}

/**
 * One key-type section. Fixed keys alone number ~384, and every card resolves
 * `[effect:…]` markers in its text, so sections render in pages of PAGE_SIZE
 * with an explicit "show all" — first paint stays fast without hiding
 * anything behind an interaction the user can't see.
 */
const PAGE_SIZE = 48;

function KeySection({ label, rows }: { label: string; rows: KeyRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, PAGE_SIZE);

  return (
    <section className="keys-section">
      <h2>
        {label} Keys
        <span className="keys-section-count">{rows.length}</span>
      </h2>
      <div className="keygrid">
        {visible.map((row) => (
          <KeyCard key={row.key.id} row={row} />
        ))}
      </div>
      {rows.length > visible.length && (
        <button
          type="button"
          className="btn-outline keys-more"
          onClick={() => setExpanded(true)}
        >
          Show all {rows.length} {label.toLowerCase()} keys
        </button>
      )}
    </section>
  );
}

export function KeysPage() {
  const [filter, setFilter] = useState<KeyFilterState>(emptyFilter);

  const toggle = (row: keyof Omit<KeyFilterState, 'search'>, id: string) => {
    setFilter((prev) => {
      const set = new Set(prev[row]);
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      return { ...prev, [row]: set };
    });
  };

  const anyActive =
    filter.type.size > 0 ||
    filter.attribute.size > 0 ||
    filter.class.size > 0 ||
    filter.phase.size > 0 ||
    filter.search.trim().length > 0;

  const matched = useMemo(() => {
    const q = norm(filter.search);
    return ROWS.filter((row) => {
      if (filter.type.size > 0 && !filter.type.has(row.key.keyType ?? '')) {
        return false;
      }
      if (filter.attribute.size > 0) {
        const names = (row.key.attributes ?? []).map((a) => norm(a.name));
        if (!names.some((n) => filter.attribute.has(n))) {
          return false;
        }
      }
      if (filter.class.size > 0) {
        if (!filter.class.has(norm(row.doll?.class ?? ''))) {
          return false;
        }
      }
      if (filter.phase.size > 0) {
        if (!filter.phase.has(norm(row.doll?.phase ?? ''))) {
          return false;
        }
      }
      if (q && !row.haystack.includes(q)) {
        return false;
      }
      return true;
    });
  }, [filter]);

  // One bucket per section, in KEY_TYPE_OPTIONS order.
  const sections = useMemo(
    () =>
      KEY_TYPE_OPTIONS.map((opt) => ({
        ...opt,
        rows: matched.filter((r) => r.key.keyType === opt.id).sort(compareRows),
      })),
    [matched]
  );

  return (
    <div className="app keys-page">
      <header>
        <h1>Keys</h1>
        <p className="muted">
          Every Fixed, Expansion, and Common key in Girls&apos; Frontline 2:
          Exilium. Affinity keys are omitted — they are a flat affinity-level
          stat reward, not a build choice.
        </p>
      </header>

      <details className="dollfilter-panel" open>
        <summary className="dollfilter-summary">
          Filters
          <span className="dollfilter-count">
            Showing {matched.length} of {ROWS.length}
          </span>
        </summary>

        <div className="dollfilter-body">
          <input
            type="search"
            className="dollfilter-search"
            placeholder="Search keys, effects, dolls…"
            aria-label="Search keys"
            value={filter.search}
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, search: e.target.value }))
            }
          />

          <FilterRow
            label="Type"
            options={KEY_TYPE_OPTIONS}
            selected={filter.type}
            onToggle={(id) => toggle('type', id)}
          />
          <FilterRow
            label="Stat"
            options={KEY_ATTRIBUTE_OPTIONS}
            selected={filter.attribute}
            onToggle={(id) => toggle('attribute', id)}
          />
          <FilterRow
            label="Doll class"
            options={CLASS_OPTIONS}
            selected={filter.class}
            onToggle={(id) => toggle('class', id)}
          />
          <FilterRow
            label="Doll phase"
            options={PHASE_OPTIONS}
            selected={filter.phase}
            onToggle={(id) => toggle('phase', id)}
          />

          {anyActive && (
            <button
              type="button"
              className="dollfilter-clear"
              onClick={() => setFilter(emptyFilter())}
            >
              Clear all
            </button>
          )}
        </div>
      </details>

      {matched.length === 0 && (
        <div className="dollgrid-empty">
          <p className="muted">No keys match your filters.</p>
        </div>
      )}

      {sections.map((section) =>
        section.rows.length === 0 ? null : (
          <KeySection
            key={section.id}
            label={section.label}
            rows={section.rows}
          />
        )
      )}
    </div>
  );
}

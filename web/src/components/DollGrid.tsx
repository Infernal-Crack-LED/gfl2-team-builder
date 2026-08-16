/**
 * DollGrid — the central shared filter module for dolls, used by both
 * `/characters` (navigation mode) and `/team-builder` (badge mode).
 *
 * Three exports, one filter vocabulary:
 * - useDollFilter — owns ALL filter/search state + the derived doll list
 * - DollFilters — collapsible panel + search box + count + clear all
 * - DollCards — the grid, renders in navigation or badge mode
 *
 * Filter semantics (binding): OR within a row, AND across rows. An empty row
 * is inactive (all values pass). Text search matches name + searchTags aliases.
 * The same hook shape is shared so the filter vocabulary can never drift
 * between /characters and /team-builder.
 *
 * Icon vs pill fallback: each option is `{ id, label, icon? }`. The row
 * renders an icon button when the icon file exists, otherwise a text pill.
 * Dropping assets into web/public/gfl2-icons/ later is a zero-code change.
 */
import { useMemo, useState } from 'react';
import {
  allDolls,
  AMMO_OPTIONS,
  CLASS_OPTIONS,
  PHASE_COLORS,
  PHASE_OPTIONS,
  RARITY_OPTIONS,
  WEAPON_TYPE_OPTIONS,
  type Doll,
} from '../data';
import { hrefForDoll } from '../router';
import { onSpaLinkClick } from '../router';

// --- Filter types ---

interface FilterOption {
  id: string;
  label: string;
  icon?: string;
}

interface FilterState {
  class: Set<string>;
  phase: Set<string>;
  ammo: Set<string>;
  weaponType: Set<string>;
  rarity: Set<string>;
  search: string;
}

interface UseDollFilterOpts {
  /** Doll IDs to exclude from the result (used by team builder). */
  exclude?: Set<string>;
  /** Restrict the pool to these dolls only. */
  restrict?: Doll[];
}

export interface DollFilterResult {
  dolls: Doll[];
  totalCount: number;
  filteredCount: number;
  filter: FilterState;
  toggleFilter: (row: keyof Omit<FilterState, 'search'>, id: string) => void;
  setSearch: (q: string) => void;
  clearAll: () => void;
  anyActive: boolean;
}

function emptyFilter(): FilterState {
  return {
    class: new Set(),
    phase: new Set(),
    ammo: new Set(),
    weaponType: new Set(),
    rarity: new Set(),
    search: '',
  };
}

/**
 * Normalize a string for search matching — lowercase, trimmed.
 */
function norm(s: string): string {
  return s.toLowerCase().trim();
}

export function useDollFilter(opts?: UseDollFilterOpts): DollFilterResult {
  const [filter, setFilter] = useState<FilterState>(emptyFilter);
  const pool = opts?.restrict ?? allDolls;
  const exclude = opts?.exclude;

  const toggleFilter = (row: keyof Omit<FilterState, 'search'>, id: string) => {
    setFilter((prev) => {
      const next = { ...prev };
      const set = new Set(prev[row]);
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      next[row] = set;
      return next;
    });
  };

  const setSearch = (q: string) => {
    setFilter((prev) => ({ ...prev, search: q }));
  };

  const clearAll = () => {
    setFilter(emptyFilter());
  };

  const anyActive =
    filter.class.size > 0 ||
    filter.phase.size > 0 ||
    filter.ammo.size > 0 ||
    filter.weaponType.size > 0 ||
    filter.rarity.size > 0 ||
    filter.search.trim().length > 0;

  const dolls = useMemo(() => {
    const q = norm(filter.search);

    return pool.filter((doll) => {
      // Exclude placed dolls (team builder)
      if (exclude?.has(doll.id)) {
        return false;
      }

      // Class filter (OR within row)
      if (filter.class.size > 0) {
        const cls = (doll.class ?? '').toLowerCase();
        let match = false;
        for (const id of filter.class) {
          if (cls === id) {
            match = true;
            break;
          }
        }
        if (!match) {
          return false;
        }
      }

      // Phase filter (OR within row)
      if (filter.phase.size > 0) {
        const ph = (doll.phase ?? '').toLowerCase();
        let match = false;
        for (const id of filter.phase) {
          if (ph === id) {
            match = true;
            break;
          }
        }
        if (!match) {
          return false;
        }
      }

      // Ammo filter (OR within row — a doll passes if ANY of its ammo types matches)
      if (filter.ammo.size > 0) {
        const dollAmmo = (doll.ammoTypes ?? []).map((a) => a.toLowerCase());
        let match = false;
        for (const id of filter.ammo) {
          if (dollAmmo.includes(id)) {
            match = true;
            break;
          }
        }
        if (!match) {
          return false;
        }
      }

      // Weapon type filter
      if (filter.weaponType.size > 0) {
        const wt = (doll.weaponImprintType ?? '').toLowerCase();
        let match = false;
        for (const id of filter.weaponType) {
          if (wt === id) {
            match = true;
            break;
          }
        }
        if (!match) {
          return false;
        }
      }

      // Rarity filter
      if (filter.rarity.size > 0) {
        const r = (doll.rarity ?? '').toLowerCase();
        let match = false;
        for (const id of filter.rarity) {
          if (r === id) {
            match = true;
            break;
          }
        }
        if (!match) {
          return false;
        }
      }

      // Text search — matches name and searchTags aliases
      if (q) {
        const nameMatch = norm(doll.name).includes(q);
        const tagMatch = (doll.searchTags ?? []).some((t) =>
          norm(t).includes(q)
        );
        if (!nameMatch && !tagMatch) {
          return false;
        }
      }

      return true;
    });
  }, [pool, exclude, filter]);

  return {
    dolls,
    totalCount: pool.length,
    filteredCount: dolls.length,
    filter,
    toggleFilter,
    setSearch,
    clearAll,
    anyActive,
  };
}

// --- Filter rows ---

interface FilterRowProps {
  label: string;
  options: readonly FilterOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function FilterRow({ label, options, selected, onToggle }: FilterRowProps) {
  return (
    <div className="dollfilter-row">
      <span className="dollfilter-row-label">{label}</span>
      <div className="dollfilter-row-options">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={'pill-toggle' + (selected.has(opt.id) ? ' on' : '')}
            aria-pressed={selected.has(opt.id)}
            onClick={() => onToggle(opt.id)}
          >
            {opt.icon ? (
              <img
                src={opt.icon}
                alt=""
                className="dollfilter-icon"
                loading="lazy"
              />
            ) : null}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- DollFilters ---

export function DollFilters({
  filterResult,
  defaultOpen,
}: {
  filterResult: DollFilterResult;
  defaultOpen?: boolean;
}) {
  const {
    filter,
    toggleFilter,
    setSearch,
    clearAll,
    anyActive,
    filteredCount,
    totalCount,
  } = filterResult;

  return (
    <details className="dollfilter-panel" open={defaultOpen}>
      <summary className="dollfilter-summary">
        Filters
        <span className="dollfilter-count">
          Showing {filteredCount} of {totalCount}
        </span>
      </summary>

      <div className="dollfilter-body">
        {/* Search */}
        <input
          type="search"
          className="dollfilter-search"
          placeholder="Search dolls…"
          aria-label="Search dolls"
          value={filter.search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Filter rows */}
        <FilterRow
          label="Class"
          options={CLASS_OPTIONS}
          selected={filter.class}
          onToggle={(id) => toggleFilter('class', id)}
        />
        <FilterRow
          label="Phase"
          options={PHASE_OPTIONS}
          selected={filter.phase}
          onToggle={(id) => toggleFilter('phase', id)}
        />
        <FilterRow
          label="Ammo"
          options={AMMO_OPTIONS}
          selected={filter.ammo}
          onToggle={(id) => toggleFilter('ammo', id)}
        />
        <FilterRow
          label="Weapon"
          options={WEAPON_TYPE_OPTIONS}
          selected={filter.weaponType}
          onToggle={(id) => toggleFilter('weaponType', id)}
        />
        <FilterRow
          label="Rarity"
          options={RARITY_OPTIONS}
          selected={filter.rarity}
          onToggle={(id) => toggleFilter('rarity', id)}
        />

        {anyActive && (
          <button type="button" className="dollfilter-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>
    </details>
  );
}

// --- DollCards ---

type DollCardMode = 'navigation' | 'badge';

export function DollCards({
  dolls,
  mode,
  onSelect,
}: {
  dolls: Doll[];
  mode: DollCardMode;
  /** Badge mode: called when a card is clicked (e.g. place in squad slot). */
  onSelect?: (doll: Doll) => void;
}) {
  if (dolls.length === 0) {
    return (
      <div className="dollgrid-empty">
        <p className="muted">No dolls match your filters.</p>
      </div>
    );
  }

  return (
    <div className="dollgrid">
      {dolls.map((doll) => {
        const phaseColor = PHASE_COLORS[doll.phase ?? ''] ?? 'var(--border)';
        const href = hrefForDoll(doll.slug);

        if (mode === 'navigation') {
          return (
            <a
              key={doll.id}
              href={href}
              className="dollcard"
              style={{ borderLeftColor: phaseColor }}
              onClick={onSpaLinkClick(href)}
            >
              <div className="dollcard-img">
                {doll.avatarUrl ? (
                  <img
                    className="portrait"
                    src={doll.avatarUrl}
                    alt={doll.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="portrait-empty" aria-hidden="true">
                    ?
                  </div>
                )}
              </div>
              <div className="dollcard-body">
                <div className="dollcard-name">{doll.name}</div>
                <div className="dollcard-meta">
                  {doll.class}
                  {doll.phase ? ` · ${doll.phase}` : ''}
                </div>
              </div>
              {doll.rarity && (
                <span
                  className={
                    'dollcard-badge' + (doll.rarity === 'Elite' ? ' elite' : '')
                  }
                >
                  {doll.rarity}
                </span>
              )}
              {doll.regionTag === 'cn' && (
                <span className="dollcard-region">CN</span>
              )}
            </a>
          );
        }

        // Badge mode — click to select, corner link to profile
        return (
          <div
            key={doll.id}
            className="dollcard dollcard-badge-mode"
            style={{ borderLeftColor: phaseColor }}
            onClick={() => onSelect?.(doll)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              // Ignore keys bubbling from the nested profile link — its own
              // Enter must navigate, not also place the doll in the squad.
              if (e.target !== e.currentTarget) {
                return;
              }
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(doll);
              }
            }}
          >
            <div className="dollcard-img">
              {doll.avatarUrl ? (
                <img
                  className="portrait"
                  src={doll.avatarUrl}
                  alt={doll.name}
                  loading="lazy"
                />
              ) : (
                <div className="portrait-empty" aria-hidden="true">
                  ?
                </div>
              )}
            </div>
            <div className="dollcard-body">
              <div className="dollcard-name">{doll.name}</div>
              <div className="dollcard-meta">
                {doll.class}
                {doll.phase ? ` · ${doll.phase}` : ''}
              </div>
            </div>
            {doll.rarity && (
              <span
                className={
                  'dollcard-badge' + (doll.rarity === 'Elite' ? ' elite' : '')
                }
              >
                {doll.rarity}
              </span>
            )}
            {doll.regionTag === 'cn' && (
              <span className="dollcard-region">CN</span>
            )}
            <a
              href={href}
              className="dollcard-profile-link"
              // stopPropagation: without it the click bubbles to the card's
              // onSelect and ALSO navigates — placing the doll while leaving.
              onClick={(e) => {
                e.stopPropagation();
                onSpaLinkClick(href)(e);
              }}
              title={`View ${doll.name}'s profile`}
              aria-label={`View ${doll.name}'s profile`}
            >
              ↗
            </a>
          </div>
        );
      })}
    </div>
  );
}

/**
 * WeaponGrid — weapon-grid analog of DollGrid.tsx. Same module shape:
 * useWeaponFilter + WeaponFilters + WeaponCards. Filter axes: rarity,
 * weapon type, primary attribute, imprint doll search.
 */
import { useMemo, useState } from 'react';
import {
  allWeapons,
  allDolls,
  WEAPON_TYPE_OPTIONS,
  type Weapon,
} from '../data';
import { hrefForWeapon } from '../router';
import { onSpaLinkClick } from '../router';

// --- Filter options ---

const WEAPON_RARITY_OPTIONS = [
  { id: 'elite', label: 'Elite' },
  { id: 'standard', label: 'Standard' },
  { id: 'retired', label: 'Retired' },
] as const;

const PRIMARY_ATTR_OPTIONS = [
  { id: 'attack', label: 'Attack' },
  { id: 'hp', label: 'HP' },
] as const;

// --- Filter state ---

interface WeaponFilterState {
  rarity: Set<string>;
  weaponType: Set<string>;
  primaryAttr: Set<string>;
  search: string;
}

interface UseWeaponFilterOpts {
  restrict?: Weapon[];
}

export interface WeaponFilterResult {
  weapons: Weapon[];
  totalCount: number;
  filteredCount: number;
  filter: WeaponFilterState;
  toggleFilter: (
    row: keyof Omit<WeaponFilterState, 'search'>,
    id: string
  ) => void;
  setSearch: (q: string) => void;
  clearAll: () => void;
  anyActive: boolean;
}

function emptyWeaponFilter(): WeaponFilterState {
  return {
    rarity: new Set(),
    weaponType: new Set(),
    primaryAttr: new Set(),
    search: '',
  };
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Build a doll name lookup for imprint-doll search. */
const dollNameById = new Map<string, string>();
for (const d of allDolls) {
  dollNameById.set(d.id, d.name);
}

export function useWeaponFilter(
  opts?: UseWeaponFilterOpts
): WeaponFilterResult {
  const [filter, setFilter] = useState<WeaponFilterState>(emptyWeaponFilter);
  const pool = opts?.restrict ?? allWeapons;

  const toggleFilter = (
    row: keyof Omit<WeaponFilterState, 'search'>,
    id: string
  ) => {
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
    setFilter(emptyWeaponFilter());
  };

  const anyActive =
    filter.rarity.size > 0 ||
    filter.weaponType.size > 0 ||
    filter.primaryAttr.size > 0 ||
    filter.search.trim().length > 0;

  const weapons = useMemo(() => {
    const q = norm(filter.search);

    return pool.filter((w) => {
      // Rarity
      if (filter.rarity.size > 0) {
        const r = (w.rarity ?? '').toLowerCase();
        if (![...filter.rarity].includes(r)) {
          return false;
        }
      }

      // Weapon type
      if (filter.weaponType.size > 0) {
        const wt = (w.weaponType ?? '').toLowerCase();
        if (![...filter.weaponType].includes(wt)) {
          return false;
        }
      }

      // Primary attribute
      if (filter.primaryAttr.size > 0) {
        const pa = (w.primaryAttribute ?? '').toLowerCase();
        if (![...filter.primaryAttr].includes(pa)) {
          return false;
        }
      }

      // Search — name + imprint doll name
      if (q) {
        const nameMatch = norm(w.name).includes(q);
        const imprintName = w.imprintDollId
          ? dollNameById.get(w.imprintDollId)
          : null;
        const imprintMatch = imprintName
          ? norm(imprintName).includes(q)
          : false;
        if (!nameMatch && !imprintMatch) {
          return false;
        }
      }

      return true;
    });
  }, [pool, filter]);

  return {
    weapons,
    totalCount: pool.length,
    filteredCount: weapons.length,
    filter,
    toggleFilter,
    setSearch,
    clearAll,
    anyActive,
  };
}

// --- Filter row (same shape as DollGrid) ---

interface FilterRowProps {
  label: string;
  options: readonly { id: string; label: string }[];
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
            className={
              'pill-toggle' + (selected.has(opt.id) ? ' on' : '')
            }
            aria-pressed={selected.has(opt.id)}
            onClick={() => onToggle(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- WeaponFilters ---

export function WeaponFilters({
  filterResult,
  defaultOpen,
}: {
  filterResult: WeaponFilterResult;
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
        <input
          type="search"
          className="dollfilter-search"
          placeholder="Search weapons…"
          aria-label="Search weapons"
          value={filter.search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <FilterRow
          label="Rarity"
          options={WEAPON_RARITY_OPTIONS}
          selected={filter.rarity}
          onToggle={(id) => toggleFilter('rarity', id)}
        />
        <FilterRow
          label="Type"
          options={WEAPON_TYPE_OPTIONS}
          selected={filter.weaponType}
          onToggle={(id) => toggleFilter('weaponType', id)}
        />
        <FilterRow
          label="Primary"
          options={PRIMARY_ATTR_OPTIONS}
          selected={filter.primaryAttr}
          onToggle={(id) => toggleFilter('primaryAttr', id)}
        />

        {anyActive && (
          <button
            type="button"
            className="dollfilter-clear"
            onClick={clearAll}
          >
            Clear all
          </button>
        )}
      </div>
    </details>
  );
}

// --- WeaponCards ---

export function WeaponCards({ weapons }: { weapons: Weapon[] }) {
  if (weapons.length === 0) {
    return (
      <div className="dollgrid-empty">
        <p className="muted">No weapons match your filters.</p>
      </div>
    );
  }

  return (
    <div className="dollgrid">
      {weapons.map((w) => {
        const href = hrefForWeapon(w.slug);
        return (
          <a
            key={w.id}
            href={href}
            className="weaponcard"
            onClick={onSpaLinkClick(href)}
          >
            <div className="weaponcard-img">
              {w.imageUrl ? (
                // Weapon art is wide (512×256) with transparency —
                // .portrait-contain letterboxes instead of cropping.
                <img
                  className="portrait portrait-contain"
                  src={w.imageUrl}
                  alt={w.name}
                  loading="lazy"
                />
              ) : (
                <div className="portrait-empty" aria-hidden="true">
                  ?
                </div>
              )}
            </div>
            <div className="dollcard-body">
              <div className="dollcard-name">{w.name}</div>
              <div className="dollcard-meta">
                {w.weaponType}
                {w.rarity ? ` · ${w.rarity}` : ''}
              </div>
              <div className="dollcard-meta">
                {w.primaryAttribute}
                {w.primaryAttributeStat != null
                  ? ` ${w.primaryAttributeStat}`
                  : ''}
              </div>
            </div>
            {w.rarity && (
              <span
                className={
                  'dollcard-badge' +
                  (w.rarity === 'Elite' ? ' elite' : '')
                }
              >
                {w.rarity}
              </span>
            )}
            {w.regionTag === 'cn' && (
              <span className="dollcard-region">CN</span>
            )}
          </a>
        );
      })}
    </div>
  );
}

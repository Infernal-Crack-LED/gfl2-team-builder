/**
 * One row of toggle pills, shared by every filter panel on the site
 * (/characters, /weapons, /keys). Previously each panel carried its own copy,
 * which is how the keys page ended up as the only one without icons.
 *
 * An option renders its iopwiki icon when it has one and its label always —
 * some rows (rarity, stat names) have no wiki art, and SMG and HG share the
 * light-ammo icon, so the label is what carries the distinction.
 */
import type { FilterOption } from '../data';

export interface FilterRowProps {
  label: string;
  options: readonly FilterOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export function FilterRow({
  label,
  options,
  selected,
  onToggle,
}: FilterRowProps) {
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
                data-colored={opt.colored ? '' : undefined}
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

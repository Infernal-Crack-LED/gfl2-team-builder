import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

// Shared media-query hook (SSR/JSDOM-safe): true when `query` matches.
export function useMediaQuery(query: string): boolean {
  const supported =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() =>
    supported ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (!supported) {
      return;
    }
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query, supported]);
  return matches;
}

export interface TabItem {
  key: string;
  label: ReactNode;
  active: boolean;
  href?: string; // present → rendered as an <a> (page nav); absent → <button>
  onSelect: (e: MouseEvent) => void;
}

// Mobile "focused tab + expandable menu": the current item shows as a full-width
// button with a caret; tapping it drops a panel listing every item. Closes on
// select, outside-click, or Escape. Desktop keeps its own inline row — render
// this only under the mobile breakpoint.
export function TabDropdown({
  items,
  label,
}: {
  items: TabItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = items.find((i) => i.active) ?? items[0];
  const pick = (e: MouseEvent, it: TabItem) => {
    it.onSelect(e);
    setOpen(false);
  };

  return (
    <div className={`tab-dd${open ? ' open' : ''}`} ref={ref}>
      <button
        className="tab-dd-current"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tab-dd-label">{current?.label}</span>
        <span className="tab-dd-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="tab-dd-panel" role="menu">
          {items.map((it) =>
            it.href ? (
              <a
                key={it.key}
                role="menuitem"
                className={'tab-dd-item' + (it.active ? ' on' : '')}
                href={it.href}
                onClick={(e) => pick(e, it)}
              >
                {it.label}
              </a>
            ) : (
              <button
                key={it.key}
                role="menuitem"
                className={'tab-dd-item' + (it.active ? ' on' : '')}
                onClick={(e) => pick(e, it)}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

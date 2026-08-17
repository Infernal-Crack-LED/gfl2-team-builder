/**
 * Modal dialog — the site's one overlay recipe (the .modal-* CSS was ported
 * from nikke-sim with the rest of the chrome; this is the component that
 * finally uses it).
 *
 * Dismiss follows the same rules as every other popover on the site (§5):
 * Escape and a click on the BACKDROP close it; clicks inside the panel never
 * do. While it is open the page behind cannot scroll, so a long modal (the
 * embedded character builder) scrolls its own backdrop instead of dragging
 * the page underneath along with it.
 *
 * `onClose` is the only exit — callers that need to commit state on close do
 * it there, so closing by Escape, backdrop, or the × are all the same action.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Roomier panel for grid/builder content. */
  wide?: boolean;
  children: ReactNode;
}) {
  // onClose through a ref: callers pass an inline arrow, so depending on it
  // would tear down and re-add the key listener — and re-run the body-overflow
  // override — on every render of the host page.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      // Dismiss on mousedown, not click, and only when the press LANDED on the
      // backdrop: a text-selection drag that starts inside the panel and ends
      // out here never presses the backdrop, so it can't close the dialog.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={'modal-panel' + (wide ? ' modal-wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="modal-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

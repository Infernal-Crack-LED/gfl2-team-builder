/**
 * Keeps the CSS tooltips ([data-tooltip] + its ::after) inside the visible box.
 *
 * The tooltip is a pseudo-element centered on its anchor, so an anchor near an
 * edge — of the viewport, or of a clipping container like the team builder's
 * effects panel — renders half cut off. There is no CSS-only way to clamp it
 * (anchor positioning isn't broadly shipped), so on hover/focus we measure
 * where the pseudo-element lands and hand CSS two custom properties:
 *
 *   --tt-shift  px to nudge it back inside (folded into the transform)
 *   --tt-max    a narrower max-width, when the space is tighter than the
 *               tooltip's natural width
 *
 * Measurement reads the pseudo-element's own computed `left`/`right`/width and
 * base transform, so this works for both the centered default and variants
 * that align to an edge instead (e.g. .teameffect-name).
 */

/** Gap kept between a tooltip and the edge it would otherwise cross. */
const EDGE_GAP = 8;

/**
 * How far to move a tooltip of `width` sitting at `left` so it fits within
 * [min, max]. Positive shifts right. When the tooltip cannot fit at all, it is
 * pinned to `min` — the overflow then falls off the far edge, which is the
 * lesser evil since the text starts at the readable end.
 */
export function tooltipShift(
  box: { left: number; width: number },
  bounds: { min: number; max: number }
): number {
  const rightmost = Math.max(bounds.min, bounds.max - box.width);
  const target = Math.min(Math.max(box.left, bounds.min), rightmost);
  return target - box.left;
}

/**
 * Horizontal bounds the tooltip must stay inside: the viewport, narrowed by
 * every ancestor that clips horizontally (overflow-x other than visible).
 */
function clipBounds(el: Element): { min: number; max: number } {
  let min = EDGE_GAP;
  let max = window.innerWidth - EDGE_GAP;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (getComputedStyle(p).overflowX === 'visible') {
      continue;
    }
    const r = p.getBoundingClientRect();
    min = Math.max(min, r.left + EDGE_GAP);
    max = Math.min(max, r.right - EDGE_GAP);
  }
  return { min, max };
}

/**
 * Where the tooltip currently sits, in viewport coordinates. `left` is
 * resolved against the anchor's padding box (the containing block for an
 * absolutely positioned pseudo-element), plus whatever its base transform
 * already translates by.
 */
function tooltipBox(
  el: Element,
  anchor: DOMRect
): { left: number; width: number } | null {
  const tip = getComputedStyle(el, '::after');
  const width = parseFloat(tip.width);
  if (!Number.isFinite(width) || width <= 0) {
    return null;
  }

  const anchorStyle = getComputedStyle(el);
  const borderLeft = parseFloat(anchorStyle.borderLeftWidth) || 0;
  const borderRight = parseFloat(anchorStyle.borderRightWidth) || 0;

  // matrix(a, b, c, d, tx, ty) — tx holds the base translateX, e.g. -50% of
  // the tooltip's own width for the centered default.
  const matrix = tip.transform.match(/matrix\(([^)]+)\)/);
  const tx = matrix ? parseFloat(matrix[1].split(',')[4]) || 0 : 0;

  const left = parseFloat(tip.left);
  if (Number.isFinite(left)) {
    return { left: anchor.left + borderLeft + left + tx, width };
  }
  // `left: auto` — the variant is pinned by `right` instead.
  const right = parseFloat(tip.right);
  if (Number.isFinite(right)) {
    return { left: anchor.right - borderRight - right - width + tx, width };
  }
  return null;
}

function place(el: HTMLElement): void {
  el.style.removeProperty('--tt-shift');
  el.style.removeProperty('--tt-max');

  const bounds = clipBounds(el);
  const available = bounds.max - bounds.min;
  if (available <= 0) {
    return;
  }

  let box = tooltipBox(el, el.getBoundingClientRect());
  if (box && box.width > available) {
    // Re-flow narrower first, then measure again: wrapping changes the width.
    el.style.setProperty('--tt-max', `${Math.floor(available)}px`);
    box = tooltipBox(el, el.getBoundingClientRect());
  }
  if (!box) {
    return;
  }

  const shift = Math.round(tooltipShift(box, bounds));
  if (shift !== 0) {
    el.style.setProperty('--tt-shift', `${shift}px`);
  }
}

/**
 * One delegated listener pair for the whole document — tooltips are plain
 * markup, so nothing has to register itself, and dynamically rendered anchors
 * are covered too. Idempotent.
 */
let installed = false;
export function installTooltipClamping(): void {
  if (installed) {
    return;
  }
  installed = true;

  const onEnter = (e: Event) => {
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest('[data-tooltip]');
    if (anchor instanceof HTMLElement) {
      place(anchor);
    }
  };

  // Capture phase: fires even where a child stops propagation.
  document.addEventListener('pointerover', onEnter, true);
  document.addEventListener('focusin', onEnter, true);
}

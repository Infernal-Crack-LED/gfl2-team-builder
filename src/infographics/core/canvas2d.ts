/**
 * Platform-free 2D canvas contract + drawing helpers.
 *
 * The renderers in this package draw against `Canvas2DLike`, a structural
 * subset of the DOM CanvasRenderingContext2D API, so the same draw code runs
 * under @napi-rs/canvas on the server and (potentially) a browser canvas.
 *
 * BOUNDARY: this package (`src/infographics/core/**`) must NEVER import
 * @napi-rs/canvas or sharp — those live in `src/infographics/node/**`. Keep
 * the core pure so renderers stay testable and portable.
 *
 * Deliberately there is NO stroke API: borders are drawn as two fills (an
 * outer rounded rect in the border color, an inner one inset by the border
 * width in the fill color). Stroke widths/aliasing differ subtly between skia
 * builds; two fills render identically everywhere.
 */

export interface Canvas2DLike {
  fillStyle: string | unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  closePath(): void;
  fill(): void;
  save(): void;
  restore(): void;
  clip(): void;
  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  drawImage(
    image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
}

/**
 * Vertical anchor for square-cropping doll portraits, mirroring nikke-sim.
 * MUST stay in sync with `--portrait-crop-top: 16%` in web/src/styles.css —
 * the CSS `<img>` crop and the canvas crop must show the same face region.
 */
export const PORTRAIT_CROP_TOP = 0.16;

/** Trace a rounded-rect path (does not fill/stroke — caller fills). */
export function roundRect(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/**
 * Shrink-to-fit text: reduce the font size (keeping family/weight) until the
 * text fits `maxWidth`, then draw it. Card geometry is fixed, so overlong
 * names shrink instead of reflowing the layout.
 */
export function fitText(
  ctx: Canvas2DLike,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: string,
  maxSize: number,
  family: string,
  minSize = 10
): number {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(text, x, y);
  return size;
}

/**
 * Contain-fit `image` (iw×ih) inside the box (dx,dy,dw,dh), centered, and
 * draw it. Used for weapon art (wide transparent banners) — portraits are
 * pre-cropped square by node/portraits.ts and drawn directly.
 */
export function drawContained(
  ctx: Canvas2DLike,
  image: unknown,
  iw: number,
  ih: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  if (iw <= 0 || ih <= 0) {
    return;
  }
  const scale = Math.min(dw / iw, dh / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(image, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
}

/**
 * Greedy word-wrap against the CURRENT ctx.font. Returns at most `maxLines`
 * lines; when words remain after that, the last line is ellipsized.
 */
export function wrapText(
  ctx: Canvas2DLike,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i] ?? '';
    i += 1;
    while (
      i < words.length &&
      ctx.measureText(`${line} ${words[i] ?? ''}`).width <= maxWidth
    ) {
      line = `${line} ${words[i] ?? ''}`;
      i += 1;
    }
    lines.push(line);
  }
  if (i < words.length && lines.length > 0) {
    let last = lines[lines.length - 1] ?? '';
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

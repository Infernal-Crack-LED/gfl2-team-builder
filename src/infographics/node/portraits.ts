/**
 * Portrait loading for server-side rendering.
 *
 * Pipeline: HTTP fetch (browser-like User-Agent — cdn.dandegate.net needs no
 * CORS handling server-side but some CDNs 403 obvious bots) → sharp decode →
 * square crop at PORTRAIT_CROP_TOP (matching the site's CSS `.portrait`
 * object-position) → raw RGBA → putImageData onto a small canvas.
 *
 * WHY sharp + putImageData instead of skia's Image/loadImage: on the owner's
 * macOS, @napi-rs/canvas's loadImage silently no-ops drawImage for these
 * raster sources — images decode "successfully" and then draw nothing.
 * Rasterizing through sharp sidesteps skia's image decoders entirely.
 *
 * Failures return null — the renderers draw a placeholder box instead, so a
 * dead CDN URL never 500s a share image.
 */
import { createCanvas, ImageData } from '@napi-rs/canvas';
import sharp from 'sharp';
import { PORTRAIT_CROP_TOP } from '../core/canvas2d.js';

const PORTRAIT_PX = 512; // decoded edge length (drawn down to 440/64)
const CACHE_MAX = 256;
const FETCH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;

/** Bounded in-memory LRU: url → decoded portrait canvas (or null). */
const cache = new Map<string, Promise<unknown | null>>();

function lruSet(key: string, value: Promise<unknown | null>): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
}

async function fetchAndDecode(imageUrl: string): Promise<unknown | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': FETCH_UA, Accept: 'image/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const input = Buffer.from(await res.arrayBuffer());

    const meta = await sharp(input).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w <= 0 || h <= 0) {
      return null;
    }
    // Square crop, vertically anchored at PORTRAIT_CROP_TOP of the overflow —
    // the canvas stand-in for CSS `object-fit: cover; object-position: center
    // var(--portrait-crop-top)`. Landscape sources crop horizontally centered.
    const side = Math.min(w, h);
    const left = w > side ? Math.round((w - side) / 2) : 0;
    const top = h > side ? Math.round((h - side) * PORTRAIT_CROP_TOP) : 0;

    const { data, info } = await sharp(input)
      .extract({ left, top, width: side, height: side })
      .resize(PORTRAIT_PX, PORTRAIT_PX)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const canvas = createCanvas(info.width, info.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(
      new ImageData(
        new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
        info.width,
        info.height
      ),
      0,
      0
    );
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Load a doll portrait for rendering. Returns null on ANY failure (network,
 * decode, bad URL) — never throws.
 */
export function loadPortrait(imageUrl: string | null | undefined): Promise<unknown | null> {
  if (!imageUrl) {
    return Promise.resolve(null);
  }
  const cached = cache.get(imageUrl);
  if (cached) {
    // Refresh recency.
    cache.delete(imageUrl);
    cache.set(imageUrl, cached);
    return cached;
  }
  const pending = fetchAndDecode(imageUrl);
  lruSet(imageUrl, pending);
  return pending;
}

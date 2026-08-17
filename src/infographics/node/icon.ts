/**
 * The shared nikkesim.app site icon drawn beside every card's wordmark
 * (core/theme.ts drawBrandMark). Loaded ONCE, lazily, and cached for the
 * process; the asset ships beside the fonts under assets/ and is copied into
 * dist-server by `npm run build:server`.
 *
 * Decoded through sharp → putImageData, exactly like node/portraits.ts, and
 * for the same reason: on macOS @napi-rs/canvas's own image decoders can
 * "succeed" and then draw nothing.
 *
 * A load failure resolves to null rather than throwing — drawBrandMark thins
 * the mark to its wordmark, so a missing icon degrades the card instead of
 * 500ing the share image.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import sharp from 'sharp';

const ICON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/nikkesim-icon.png'
);

const ICON_PX = 128; // decoded edge length (drawn down to the 40px mark)

let iconPromise: Promise<unknown | null> | null = null;

async function decodeIcon(): Promise<unknown | null> {
  try {
    const { data, info } = await sharp(ICON_PATH)
      .resize(ICON_PX, ICON_PX, { fit: 'contain', background: '#00000000' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const canvas = createCanvas(info.width, info.height);
    canvas
      .getContext('2d')
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
          info.width,
          info.height
        ),
        0,
        0
      );
    return canvas;
  } catch (err) {
    console.warn('[infographics] site icon unavailable:', err);
    return null;
  }
}

export function loadSiteIcon(): Promise<unknown | null> {
  iconPromise ??= decodeIcon();
  return iconPromise;
}

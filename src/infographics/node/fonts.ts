/**
 * Font registration — MUST be imported before ANY canvas draw happens
 * (node/render.ts imports it first). An unregistered font does not error: it
 * silently falls back to a blank/tofu face, so registration failure throws at
 * import time instead of shipping blank images in production.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';

const FONT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/fonts'
);

// All three weights are registered under the ONE family name "Roboto" so a
// CSS-style font string ('700 28px Roboto') picks the right weight — the
// same way the site's system stack resolves weights.
const FONTS: [file: string, family: string][] = [
  ['Roboto-Regular.ttf', 'Roboto'],
  ['Roboto-Medium.ttf', 'Roboto'],
  ['Roboto-Bold.ttf', 'Roboto'],
];

for (const [file, family] of FONTS) {
  const p = path.join(FONT_DIR, file);
  if (!existsSync(p)) {
    throw new Error(`[infographics] missing font file: ${p}`);
  }
  if (!GlobalFonts.registerFromPath(p, family)) {
    throw new Error(`[infographics] failed to register font: ${p}`);
  }
}

export const FONTS_REGISTERED = true;

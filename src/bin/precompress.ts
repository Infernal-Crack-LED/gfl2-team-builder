/**
 * Brotli-precompress the built static assets.
 *
 *   npm run precompress    (runs as part of `npm run vite:build`)
 *
 * WHY: the origin serves `dist/` uncompressed and lets the edge compress on the
 * fly. On-the-fly compression is time-boxed, so the edge picks a cheap gzip
 * level — the measured result was 523 kB on the wire for the shared data chunk
 * where brotli -11 gets it to 366 kB. That 30% is pure latency on the critical
 * path of every doll page, and it costs nothing at request time to precompute.
 *
 * Only text-ish assets are worth it: .js/.css/.json/.svg/.xml/.txt. Game art is
 * already webp/png and would grow. Files that fail to shrink are skipped, so a
 * `.br` on disk always means "smaller than the original".
 *
 * app.ts serves a `.br` only when the client's Accept-Encoding asks for it and
 * the sibling exists; nothing here changes what a br-less client receives.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const DIST = path.resolve('dist');

/** Extensions that compress well enough to be worth a second file on disk. */
const COMPRESSIBLE = new Set([
  '.js',
  '.css',
  '.json',
  '.svg',
  '.xml',
  '.txt',
  '.html',
  '.map',
]);

/** Below this, the header overhead and the extra stat() are not worth it. */
const MIN_BYTES = 1024;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export function precompress(root = DIST): {
  files: number;
  before: number;
  after: number;
} {
  let files = 0;
  let before = 0;
  let after = 0;

  for (const file of walk(root)) {
    if (file.endsWith('.br') || !COMPRESSIBLE.has(path.extname(file))) {
      continue;
    }
    const raw = readFileSync(file);
    if (raw.length < MIN_BYTES) {
      continue;
    }
    const compressed = brotliCompressSync(raw, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    });
    // A `.br` that isn't smaller would make the response worse; skip it and
    // the serve path falls back to the original automatically.
    if (compressed.length >= raw.length) {
      continue;
    }
    writeFileSync(`${file}.br`, compressed);
    files += 1;
    before += raw.length;
    after += compressed.length;
  }

  return { files, before, after };
}

function main(): void {
  const { files, before, after } = precompress();
  const kb = (n: number) => `${Math.round(n / 1024)} kB`;
  const saved = before === 0 ? 0 : Math.round((1 - after / before) * 100);
  console.log(
    `precompress: ${files} files, ${kb(before)} → ${kb(after)} (−${saved}%)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

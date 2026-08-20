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

/**
 * Brotli budget for a single JS chunk, in bytes.
 *
 * The site's weight is dominated by ONE shared chunk — the committed game data
 * compiled into JavaScript. Measured on the wire, a content page pulls about
 * 372 kB of JS and the landing page 71 kB, because that chunk is immutable and
 * shared: a visitor pays for it once, then every other content route is free.
 * That is why it has not been split apart, and the number that matters is
 * whether it stays put rather than creeping up each sync.
 *
 * Set with headroom over the current 298 kB. Tripping it means the data grew
 * enough to be worth splitting the datasets out of the JS graph — which needs
 * an async boundary in <RichText>, the component behind every tooltip on the
 * site, and so should be a deliberate piece of work rather than a surprise.
 */
const CHUNK_BROTLI_BUDGET = 360 * 1024;

export function precompress(root = DIST): {
  files: number;
  before: number;
  after: number;
  largest: { name: string; brotli: number } | null;
} {
  let files = 0;
  let before = 0;
  let after = 0;
  let largest: { name: string; brotli: number } | null = null;

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
    if (
      path.extname(file) === '.js' &&
      compressed.length > (largest?.brotli ?? 0)
    ) {
      largest = { name: path.basename(file), brotli: compressed.length };
    }
  }

  return { files, before, after, largest };
}

function main(): void {
  const { files, before, after, largest } = precompress();
  const kb = (n: number) => `${Math.round(n / 1024)} kB`;
  const saved = before === 0 ? 0 : Math.round((1 - after / before) * 100);
  console.log(
    `precompress: ${files} files, ${kb(before)} → ${kb(after)} (−${saved}%)`
  );
  if (!largest) {
    return;
  }
  console.log(
    `  largest chunk: ${largest.name} ${kb(largest.brotli)} brotli ` +
      `(budget ${kb(CHUNK_BROTLI_BUDGET)})`
  );
  if (largest.brotli > CHUNK_BROTLI_BUDGET) {
    // Fail the build rather than warn: a bundle that grows quietly is exactly
    // how a site ends up shipping a megabyte nobody decided to ship.
    console.error(
      `\nBUNDLE BUDGET EXCEEDED — ${largest.name} is ${kb(largest.brotli)} ` +
        `brotli, over the ${kb(CHUNK_BROTLI_BUDGET)} budget.\n` +
        'The committed game data is compiled into this chunk. Either the data ' +
        'grew a lot, or something new was pulled into the shared graph.\n' +
        'See the budget comment in src/bin/precompress.ts before raising it.'
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

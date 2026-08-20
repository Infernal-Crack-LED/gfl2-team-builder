import { describe, expect, it } from 'vitest';
import {
  IMMUTABLE,
  NO_CACHE,
  acceptsBrotli,
  cacheControlFor,
  etagFor,
  isNotModified,
} from './httpCache';

describe('acceptsBrotli', () => {
  it('accepts the br token in any position or casing', () => {
    for (const h of ['br', 'gzip, br', 'BR', 'gzip, deflate, br, zstd']) {
      expect(acceptsBrotli(h), h).toBe(true);
    }
  });

  it('declines when br is absent or explicitly refused', () => {
    for (const h of [undefined, '', 'gzip', 'gzip, deflate', 'br;q=0']) {
      expect(acceptsBrotli(h), String(h)).toBe(false);
    }
  });

  it('does not match encodings that merely contain "br"', () => {
    expect(acceptsBrotli('brotli')).toBe(false);
    expect(acceptsBrotli('gzip, xbr')).toBe(false);
  });

  it('honours a positive explicit q-value', () => {
    expect(acceptsBrotli('br;q=1.0')).toBe(true);
    expect(acceptsBrotli('gzip;q=0.5, br;q=0.9')).toBe(true);
  });
});

describe('etagFor', () => {
  it('gives the brotli variant a different tag than the identity one', () => {
    const stat = { size: 1234, mtimeMs: 1_700_000_000_000 };
    // Same bytes on disk, two representations on the wire: a shared cache that
    // keyed both on one tag could serve br bytes to a client that never asked.
    expect(etagFor(stat, 'br')).not.toBe(etagFor(stat));
    expect(etagFor(stat)).toBe(etagFor(stat, undefined));
  });
});

describe('cacheControlFor', () => {
  it('marks content-hashed bundles and fonts immutable', () => {
    expect(cacheControlFor('/assets/index-a1B2c3D4.js')).toBe(IMMUTABLE);
    expect(cacheControlFor('/assets/styles-a1B2c3D4.css')).toBe(IMMUTABLE);
    expect(cacheControlFor('/fonts/Roboto-Regular.woff2')).toBe(IMMUTABLE);
  });

  it('revalidates everything served at a fixed URL', () => {
    for (const p of [
      '/index.html',
      '/og.png',
      '/sitemap.xml',
      '/llms.txt',
      '/robots.txt',
      // Mirrored game art has no hash segment: it is replaced in place when
      // `npm run icons` re-runs, so a long cache would pin stale tiles.
      '/game-assets/dolls/abc123.webp',
      // An /assets/ path WITHOUT vite's 8-char hash is not immutable.
      '/assets/hand-added.png',
    ]) {
      expect(cacheControlFor(p), p).toBe(NO_CACHE);
    }
  });
});

describe('conditional requests', () => {
  const stat = { size: 1234, mtimeMs: 1_700_000_000_500 };
  const etag = etagFor(stat);

  it('derives a weak validator from size and mtime', () => {
    expect(etag).toBe('W/"1234-1700000000500"');
    expect(etagFor({ ...stat, size: 1235 })).not.toBe(etag);
  });

  it('304s on a matching If-None-Match, including `*`', () => {
    expect(isNotModified(etag, stat.mtimeMs, etag, undefined)).toBe(true);
    expect(
      isNotModified(etag, stat.mtimeMs, `W/"other", ${etag}`, undefined)
    ).toBe(true);
    expect(isNotModified(etag, stat.mtimeMs, '*', undefined)).toBe(true);
    expect(isNotModified(etag, stat.mtimeMs, 'W/"stale"', undefined)).toBe(
      false
    );
  });

  it('lets If-None-Match win over If-Modified-Since', () => {
    const future = new Date(stat.mtimeMs + 60_000).toUTCString();
    expect(isNotModified(etag, stat.mtimeMs, 'W/"stale"', future)).toBe(false);
  });

  it('compares If-Modified-Since at whole-second granularity', () => {
    // The header cannot carry the .500 fraction, so the floored second must
    // count as fresh rather than re-sending the body on every request.
    expect(
      isNotModified(
        etag,
        stat.mtimeMs,
        undefined,
        new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString()
      )
    ).toBe(true);
    expect(
      isNotModified(
        etag,
        stat.mtimeMs,
        undefined,
        new Date(stat.mtimeMs - 2000).toUTCString()
      )
    ).toBe(false);
  });

  it('ignores an unparseable If-Modified-Since', () => {
    expect(isNotModified(etag, stat.mtimeMs, undefined, 'yesterday')).toBe(
      false
    );
  });
});

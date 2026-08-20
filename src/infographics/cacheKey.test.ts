/**
 * Pins the content-addressed cache-key contract: logically equal payloads
 * must produce the same filename REGARDLESS of source key order (the wire
 * codec normalizes anyway, but the hasher must not depend on it), and a
 * RENDERER_VERSION bump must change every key (that's the cache-busting
 * mechanism for visual changes).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CACHE_FILENAME_RE,
  RENDERER_VERSION,
  renderCacheFilename,
  renderCacheKey,
  stableStringify,
} from './cacheKey.js';
import {
  decodeDollBuild,
  encodeDollBuild,
  type DollBuild,
} from '../share/buildCode.js';

const BUILD: DollBuild = {
  v: 3,
  doll: 'alva',
  weapon: '6d890f29-636c-4f04-bb2d-f91e3ff014fa',
  keys: ['a', 'b'],
  vert: [1, 3],
};

describe('stableStringify', () => {
  it('is key-order independent', () => {
    expect(stableStringify({ a: 1, b: { x: 1, y: 2 } })).toBe(
      stableStringify({ b: { y: 2, x: 1 }, a: 1 })
    );
  });

  it('drops undefined fields (codec-optional fields)', () => {
    expect(stableStringify({ d: 'alva', w: undefined })).toBe(
      stableStringify({ d: 'alva' })
    );
  });

  it('keeps array order significant', () => {
    expect(stableStringify({ k: ['a', 'b'] })).not.toBe(
      stableStringify({ k: ['b', 'a'] })
    );
  });
});

describe('renderCacheKey', () => {
  it('pins the exact filename for a known payload', () => {
    const expected = createHash('sha256')
      .update(`${RENDERER_VERSION}|build|${stableStringify(BUILD)}`)
      .digest('hex')
      .slice(0, 16);
    expect(renderCacheKey('build', BUILD)).toBe(expected);
    expect(renderCacheFilename('build', BUILD)).toBe(`build.${expected}.png`);
    expect(CACHE_FILENAME_RE.test(renderCacheFilename('build', BUILD))).toBe(
      true
    );
  });

  it('produces the same key for a payload rebuilt via the codec with different key order', () => {
    // Hand-assembled JSON with shuffled keys still decodes to an equal
    // payload; hashing the DECODED struct keeps the filename stable.
    const shuffled = Buffer.from(
      JSON.stringify({
        vert: [1, 3],
        keys: ['a', 'b'],
        weapon: '6d890f29-636c-4f04-bb2d-f91e3ff014fa',
        doll: 'alva',
        v: 3,
      })
    ).toString('base64url');
    const a = decodeDollBuild(encodeDollBuild(BUILD));
    const b = decodeDollBuild(shuffled);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(renderCacheFilename('build', a)).toBe(
      renderCacheFilename('build', b)
    );
  });

  it('accepts every render kind in the cache-filename guard', () => {
    for (const kind of ['build', 'team', 'rec', 'weapon'] as const) {
      expect(CACHE_FILENAME_RE.test(renderCacheFilename(kind, BUILD))).toBe(
        true
      );
    }
    expect(CACHE_FILENAME_RE.test('other.0123456789abcdef.png')).toBe(false);
  });

  it('changes when RENDERER_VERSION changes', () => {
    const current = renderCacheKey('build', BUILD);
    const bumped = createHash('sha256')
      .update(`${RENDERER_VERSION + 1}|build|${stableStringify(BUILD)}`)
      .digest('hex')
      .slice(0, 16);
    expect(current).not.toBe(bumped);
  });
});

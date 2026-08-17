/**
 * The remote → local mapping is a pure function rather than a manifest, so
 * these cases are what stands between a URL shape change and 900 silently
 * broken images.
 */
import { describe, expect, it } from 'vitest';
import {
  localAssetUrl,
  parseRemoteAsset,
  MIRRORED_CATEGORIES,
} from '../../src/share/assets';

describe('parseRemoteAsset', () => {
  it('maps a flat CDN path to its category directory', () => {
    const asset = parseRemoteAsset('https://cdn.dandegate.net/skills/abc.webp');
    expect(asset).toMatchObject({
      category: 'skills',
      filename: 'abc.webp',
      localPath: 'game-assets/skills/abc.webp',
      maxEdge: MIRRORED_CATEGORIES.skills,
    });
  });

  it('drops the name-slug directory some keys are nested under', () => {
    // The slug is human-authored text; the basename is the content hash.
    const asset = parseRemoteAsset(
      "https://cdn.dandegate.net/keys/lion's-determination/30d6.webp"
    );
    expect(asset?.localPath).toBe('game-assets/keys/30d6.webp');
  });

  it('rejects a foreign host', () => {
    expect(parseRemoteAsset('https://example.com/skills/abc.webp')).toBeNull();
  });

  it('rejects an uncovered category', () => {
    expect(
      parseRemoteAsset('https://cdn.dandegate.net/doll-images/Skin/a.webp')
    ).toBeNull();
  });

  it('rejects a traversal attempt in the basename', () => {
    expect(
      parseRemoteAsset('https://cdn.dandegate.net/keys/..%2F..%2Fetc%2Fpasswd')
    ).toBeNull();
  });

  it('rejects a category-only path', () => {
    expect(parseRemoteAsset('https://cdn.dandegate.net/keys')).toBeNull();
  });
});

describe('localAssetUrl', () => {
  it('rewrites mirrored art to the local path', () => {
    expect(localAssetUrl('https://cdn.dandegate.net/keys/abc.webp')).toBe(
      '/game-assets/keys/abc.webp'
    );
  });

  it('passes through art we do not mirror', () => {
    const url = 'https://cdn.dandegate.net/doll-images/Card/x.webp';
    expect(localAssetUrl(url)).toBe(url);
  });

  it('passes through a path that is already local', () => {
    expect(localAssetUrl('/gfl2-icons/class-support.png')).toBe(
      '/gfl2-icons/class-support.png'
    );
  });

  it('preserves null so callers can keep their empty-state branch', () => {
    expect(localAssetUrl(null)).toBeNull();
  });
});

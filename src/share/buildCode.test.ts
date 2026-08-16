import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  decodeAnyBuild,
  decodeDollBuild,
  decodeTeamBuild,
  encodeDollBuild,
  encodeTeamBuild,
  shareProfileName,
} from './buildCode';

const dollBuild = {
  v: 2 as const,
  doll: 'alva',
  weapon: '6d890f29-636c-4f04-bb2d-f91e3ff014fa',
  keys: ['6d402750-28ac-497f-9dcc-7e9c774a01fb'],
  vert: [1, 2, 3],
};

describe('b64url', () => {
  it('roundtrips unicode', () => {
    const s = 'héllo ✓ "quotes" {json:true}';
    expect(b64urlDecode(b64urlEncode(s))).toBe(s);
  });

  it('produces URL-safe output without padding', () => {
    const enc = b64urlEncode('?????>>>>');
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('doll build codec', () => {
  it('roundtrips', () => {
    expect(decodeDollBuild(encodeDollBuild(dollBuild))).toEqual(dollBuild);
  });

  it('returns null on garbage', () => {
    expect(decodeDollBuild('not-valid!!!')).toBeNull();
    expect(decodeDollBuild('')).toBeNull();
  });

  it('returns null on wrong version', () => {
    expect(
      decodeDollBuild(b64urlEncode(JSON.stringify({ ...dollBuild, v: 99 })))
    ).toBeNull();
  });

  it('returns null when required fields are missing or mistyped', () => {
    expect(
      decodeDollBuild(
        b64urlEncode(JSON.stringify({ v: 2, keys: [], vert: [] }))
      )
    ).toBeNull();
    expect(
      decodeDollBuild(b64urlEncode(JSON.stringify({ ...dollBuild, keys: [1] })))
    ).toBeNull();
  });

  it('accepts a null weapon', () => {
    const b = { ...dollBuild, weapon: null };
    expect(decodeDollBuild(encodeDollBuild(b))).toEqual(b);
  });
});

describe('team build codec', () => {
  const team = {
    v: 2 as const,
    s: [{ d: 'alva', w: 'x', k: ['y'], t: [1] }, null, { d: 'tololo' }],
  };

  it('roundtrips', () => {
    expect(decodeTeamBuild(encodeTeamBuild(team))).toEqual(team);
  });

  it('returns null on garbage / wrong version / too many slots', () => {
    expect(decodeTeamBuild('junk')).toBeNull();
    expect(
      decodeTeamBuild(b64urlEncode(JSON.stringify({ v: 9, s: [] })))
    ).toBeNull();
    expect(
      decodeTeamBuild(
        b64urlEncode(JSON.stringify({ v: 2, s: Array(6).fill(null) }))
      )
    ).toBeNull();
  });

  it('returns null on a slot with a bad doll slug', () => {
    expect(
      decodeTeamBuild(b64urlEncode(JSON.stringify({ v: 2, s: [{ d: 5 }] })))
    ).toBeNull();
  });
});

describe('decodeAnyBuild', () => {
  it('distinguishes doll builds from team builds', () => {
    expect(decodeAnyBuild(encodeDollBuild(dollBuild))?.kind).toBe('build');
    expect(
      decodeAnyBuild(encodeTeamBuild({ v: 2, s: [{ d: 'alva' }] }))?.kind
    ).toBe('team');
    expect(decodeAnyBuild('junk')).toBeNull();
  });
});

describe('shareProfileName', () => {
  it('is deterministic and content-sensitive', () => {
    const a = shareProfileName('code-a');
    expect(a).toBe(shareProfileName('code-a'));
    expect(a).not.toBe(shareProfileName('code-b'));
    expect(a).toMatch(/^share-[0-9a-f]{16}$/);
  });
});

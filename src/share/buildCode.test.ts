import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  decodeAnyBuild,
  decodeDollBuild,
  decodeRecBuild,
  decodeTeamBuild,
  dollBuildFromTeamSlot,
  encodeDollBuild,
  encodeRecBuild,
  encodeTeamBuild,
  shareProfileName,
  teamSlotFromDollBuild,
} from './buildCode';

const dollBuild = {
  v: 3 as const,
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
        b64urlEncode(JSON.stringify({ v: 3, keys: [], vert: [] }))
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
    v: 3 as const,
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
        b64urlEncode(JSON.stringify({ v: 3, s: Array(6).fill(null) }))
      )
    ).toBeNull();
  });

  it('returns null on a slot with a bad doll slug', () => {
    expect(
      decodeTeamBuild(b64urlEncode(JSON.stringify({ v: 3, s: [{ d: 5 }] })))
    ).toBeNull();
  });

  it('roundtrips a slot carrying a full build', () => {
    const full = {
      v: 3 as const,
      s: [
        {
          d: 'alva',
          w: 'weapon-id',
          k: ['k1', 'k2'],
          t: [3],
          ex: 'exp-id',
          cal: 5,
          st: ['ATK%', 'Crit DMG'],
          ck: ['ck1'],
        },
      ],
    };
    expect(decodeTeamBuild(encodeTeamBuild(full))).toEqual(full);
  });

  it('rejects build fields that break their own limits', () => {
    const bad = (slot: Record<string, unknown>) =>
      decodeTeamBuild(b64urlEncode(JSON.stringify({ v: 3, s: [slot] })));
    // >4 stat prefs, >3 common keys, and non-string members are all refused.
    expect(bad({ d: 'alva', st: ['a', 'b', 'c', 'd', 'e'] })).toBeNull();
    expect(bad({ d: 'alva', ck: ['a', 'b', 'c', 'd'] })).toBeNull();
    expect(bad({ d: 'alva', ck: [1] })).toBeNull();
    // An out-of-range refinement is DROPPED, not fatal — same as DollBuild.
    expect(bad({ d: 'alva', cal: 9 })).toEqual({ v: 3, s: [{ d: 'alva' }] });
    // An over-long attachment set name is fatal, like the other caps here.
    expect(bad({ d: 'alva', as: 'x'.repeat(65) })).toBeNull();
  });
});

describe('team slot ↔ doll build', () => {
  it('roundtrips a full build through a slot', () => {
    const build = {
      v: 3 as const,
      doll: 'alva',
      weapon: 'weapon-id',
      keys: ['k1'],
      vert: [2],
      cal: 4,
      stats: ['ATK%'],
      ck: ['ck1'],
      exp: 'exp-id',
      set: 'Ultimate Pursuit',
    };
    expect(dollBuildFromTeamSlot(teamSlotFromDollBuild(build))).toEqual(build);
  });

  it('reads a legacy doll-only slot as an empty build', () => {
    expect(dollBuildFromTeamSlot({ d: 'alva', w: 'weapon-id' })).toEqual({
      v: 3,
      doll: 'alva',
      weapon: 'weapon-id',
      keys: [],
      vert: [],
      cal: null,
      stats: [],
      ck: [],
      exp: null,
      set: null,
    });
  });

  it('omits empty fields from the slot so codes stay short', () => {
    expect(
      teamSlotFromDollBuild({
        v: 3,
        doll: 'alva',
        weapon: null,
        keys: [],
        vert: [],
        cal: null,
        stats: [],
        ck: [],
        exp: null,
      })
    ).toEqual({ d: 'alva', w: null, k: [] });
  });
});

describe('rec build codec', () => {
  const rec = {
    v: 3 as const,
    card: 'rec' as const,
    doll: 'alva',
    bp: ['V0', 'R1', 'V3', 'V6', 'R6'],
    opt: 'V3R1',
    ws: ['w1', 'w2'],
    sets: ['Ultimate Pursuit'],
    keys: ['k1', 'k2'],
    exp: 'exp-id',
    ck: ['ck1'],
    stats: ['ATK%', 'Crit DMG'],
    notes: 'Works at V0; R1 is the first big jump.',
  };

  it('roundtrips', () => {
    expect(decodeRecBuild(encodeRecBuild(rec))).toEqual(rec);
  });

  it('returns null on garbage / wrong version / missing discriminant', () => {
    expect(decodeRecBuild('junk')).toBeNull();
    expect(
      decodeRecBuild(b64urlEncode(JSON.stringify({ ...rec, v: 9 })))
    ).toBeNull();
    // A DollBuild code is NOT a rec code — no `card: 'rec'`.
    expect(decodeRecBuild(encodeDollBuild(dollBuild))).toBeNull();
  });

  it('rejects malformed breakpoint sequences', () => {
    const bad = (bp: unknown[]) =>
      decodeRecBuild(b64urlEncode(JSON.stringify({ ...rec, bp })));
    expect(bad(['V7'])).toBeNull(); // out of range
    expect(bad(['R0'])).toBeNull(); // refinement starts at 1
    expect(bad(['v3'])).toBeNull(); // case-sensitive
    expect(bad(['V1', 'V1'])).toBeNull(); // duplicates
    expect(bad(['V0', 'R1', 'V1', 'R2', 'V2', 'R3', 'V3', 'R4', 'V4'])) // >8
      .toBeNull();
  });

  it('rejects over-cap weapon / set lists', () => {
    expect(
      decodeRecBuild(
        b64urlEncode(JSON.stringify({ ...rec, ws: ['a', 'b', 'c', 'd'] }))
      )
    ).toBeNull();
    expect(
      decodeRecBuild(
        b64urlEncode(JSON.stringify({ ...rec, sets: ['a', 'b', 'c', 'd'] }))
      )
    ).toBeNull();
    expect(
      decodeRecBuild(
        b64urlEncode(JSON.stringify({ ...rec, sets: ['x'.repeat(65)] }))
      )
    ).toBeNull();
  });

  it('drops a malformed optimal token and keeps single-axis ones', () => {
    const opt = (o: unknown) =>
      decodeRecBuild(b64urlEncode(JSON.stringify({ ...rec, opt: o })))?.opt;
    expect(opt('V3R1')).toBe('V3R1');
    expect(opt('V6')).toBe('V6');
    expect(opt('R1')).toBe('R1');
    expect(opt('R1V3')).toBeUndefined(); // V before R, always
    expect(opt('V7R1')).toBeUndefined();
    expect(opt('optimal')).toBeUndefined();
  });

  it('accepts six priority keys of each kind and rejects seven', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    const ok = decodeRecBuild(encodeRecBuild({ ...rec, keys: six, ck: six }));
    expect(ok?.keys).toEqual(six);
    expect(ok?.ck).toEqual(six);
    expect(
      decodeRecBuild(
        b64urlEncode(JSON.stringify({ ...rec, keys: [...six, 'g'] }))
      )
    ).toBeNull();
    // An over-cap ck is DROPPED (optional field), not fatal — same contract
    // as DollBuild's optional fields.
    expect(
      decodeRecBuild(
        b64urlEncode(JSON.stringify({ ...rec, ck: [...six, 'g'] }))
      )?.ck
    ).toBeUndefined();
  });

  it('trims an over-long note instead of rejecting it', () => {
    const long = decodeRecBuild(
      b64urlEncode(JSON.stringify({ ...rec, notes: 'x'.repeat(400) }))
    );
    expect(long?.notes).toHaveLength(280);
  });
});

describe('decodeAnyBuild', () => {
  it('distinguishes doll, team and rec builds', () => {
    expect(decodeAnyBuild(encodeDollBuild(dollBuild))?.kind).toBe('build');
    expect(
      decodeAnyBuild(encodeTeamBuild({ v: 3, s: [{ d: 'alva' }] }))?.kind
    ).toBe('team');
    expect(
      decodeAnyBuild(
        encodeRecBuild({
          v: 3,
          card: 'rec',
          doll: 'alva',
          bp: ['V0'],
          ws: [],
          sets: [],
          keys: [],
        })
      )?.kind
    ).toBe('rec');
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

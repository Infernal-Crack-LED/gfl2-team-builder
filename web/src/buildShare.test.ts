/**
 * Tests for the /builder/<slug> share-link boot helpers. The contract under
 * test: valid links apply, and EVERYTHING else — junk params, wrong-doll
 * codes, malformed ids, failed fetches, odd response bodies — degrades to
 * null so a bad link never breaks the page or clobbers state.
 */
import { describe, expect, it } from 'vitest';
import { encodeDollBuild, encodeTeamBuild } from '../../src/share/buildCode';
import type { DollBuild, TeamBuild } from '../../src/share/buildCode';
import {
  bootBuildFromCodeParam,
  bootIdFromSearch,
  bootTeamFromCodeParam,
  fetchSharedBuild,
  fetchSharedTeam,
} from './buildShare';
import type { ShareFetcher } from './buildShare';

const ALVA_BUILD: DollBuild = {
  v: 2,
  doll: 'alva',
  weapon: '6d890f29-636c-4f04-bb2d-f91e3ff014fa',
  keys: ['k1', 'k2'],
  vert: [1, 3],
};

const SQUAD: TeamBuild = {
  v: 2,
  s: [
    { d: 'alva', w: '6d890f29-636c-4f04-bb2d-f91e3ff014fa' },
    null,
    { d: 'qiongjiu' },
  ],
};

const VALID_ID = '123e4567-e89b-42d3-a456-426614174000';

function searchWith(params: Record<string, string>): string {
  return '?' + new URLSearchParams(params).toString();
}

describe('bootBuildFromCodeParam', () => {
  it('decodes a valid round-tripped code for the page doll', () => {
    const search = searchWith({ b: encodeDollBuild(ALVA_BUILD) });
    expect(bootBuildFromCodeParam(search, 'alva')).toEqual(ALVA_BUILD);
  });

  it('returns null when ?b= is missing', () => {
    expect(bootBuildFromCodeParam('', 'alva')).toBeNull();
    expect(bootBuildFromCodeParam('?id=' + VALID_ID, 'alva')).toBeNull();
  });

  it('returns null for junk codes', () => {
    expect(bootBuildFromCodeParam('?b=%%%', 'alva')).toBeNull();
    expect(bootBuildFromCodeParam('?b=AAAA', 'alva')).toBeNull();
    // Valid base64url, valid JSON, wrong schema.
    expect(bootBuildFromCodeParam('?b=eyJ2Ijo5OX0', 'alva')).toBeNull();
  });

  it('returns null when the build belongs to a different doll', () => {
    const code = encodeDollBuild({ ...ALVA_BUILD, doll: 'qiongjiu' });
    expect(bootBuildFromCodeParam(searchWith({ b: code }), 'alva')).toBeNull();
  });
});

describe('bootTeamFromCodeParam', () => {
  it('decodes a valid round-tripped squad, empty slots included', () => {
    const search = searchWith({ b: encodeTeamBuild(SQUAD) });
    expect(bootTeamFromCodeParam(search)).toEqual(SQUAD);
  });

  it('returns null when ?b= is missing or undecodable', () => {
    expect(bootTeamFromCodeParam('')).toBeNull();
    expect(bootTeamFromCodeParam('?id=' + VALID_ID)).toBeNull();
    expect(bootTeamFromCodeParam('?b=%%%')).toBeNull();
  });

  it('returns null for a doll-build code (wrong codec, not a squad)', () => {
    expect(
      bootTeamFromCodeParam(searchWith({ b: encodeDollBuild(ALVA_BUILD) }))
    ).toBeNull();
  });
});

describe('bootIdFromSearch', () => {
  it('accepts a well-formed uuid', () => {
    expect(bootIdFromSearch(`?id=${VALID_ID}`)).toBe(VALID_ID);
    // Case-insensitive.
    expect(bootIdFromSearch(`?id=${VALID_ID.toUpperCase()}`)).toBe(
      VALID_ID.toUpperCase()
    );
  });

  it('rejects missing or malformed ids without touching the network', () => {
    expect(bootIdFromSearch('')).toBeNull();
    expect(bootIdFromSearch('?id=abc')).toBeNull();
    expect(bootIdFromSearch('?id=' + VALID_ID + 'zz')).toBeNull();
    expect(bootIdFromSearch('?id=<script>')).toBeNull();
  });
});

describe('fetchSharedBuild', () => {
  const okFetcher =
    (body: unknown): ShareFetcher =>
    () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

  it('fetches the /public endpoint and decodes the stored code', async () => {
    let calledWith = '';
    const fetcher: ShareFetcher = (url) => {
      calledWith = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ code: encodeDollBuild(ALVA_BUILD) }),
      });
    };
    const build = await fetchSharedBuild(VALID_ID, 'alva', fetcher);
    expect(build).toEqual(ALVA_BUILD);
    expect(calledWith).toBe(`/api/profiles/${VALID_ID}/public`);
  });

  it('returns null for a code belonging to a different doll', async () => {
    const code = encodeDollBuild({ ...ALVA_BUILD, doll: 'qiongjiu' });
    expect(
      await fetchSharedBuild(VALID_ID, 'alva', okFetcher({ code }))
    ).toBeNull();
  });

  it('returns null on non-OK responses (e.g. deleted share row)', async () => {
    const fetcher: ShareFetcher = () =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    expect(await fetchSharedBuild(VALID_ID, 'alva', fetcher)).toBeNull();
  });

  it('returns null when the body has no string code', async () => {
    expect(await fetchSharedBuild(VALID_ID, 'alva', okFetcher({}))).toBeNull();
    expect(
      await fetchSharedBuild(VALID_ID, 'alva', okFetcher({ code: 42 }))
    ).toBeNull();
    expect(
      await fetchSharedBuild(VALID_ID, 'alva', okFetcher(null))
    ).toBeNull();
  });

  it('returns null when the stored code is undecodable', async () => {
    expect(
      await fetchSharedBuild(VALID_ID, 'alva', okFetcher({ code: '%%%' }))
    ).toBeNull();
  });

  it('returns null when the fetch itself throws (offline, endpoint down)', async () => {
    const fetcher: ShareFetcher = () =>
      Promise.reject(new Error('network down'));
    expect(await fetchSharedBuild(VALID_ID, 'alva', fetcher)).toBeNull();
  });
});

describe('fetchSharedTeam', () => {
  const okFetcher =
    (body: unknown): ShareFetcher =>
    () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

  it('fetches the /public endpoint and decodes the stored squad', async () => {
    let calledWith = '';
    const fetcher: ShareFetcher = (url) => {
      calledWith = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ code: encodeTeamBuild(SQUAD) }),
      });
    };
    expect(await fetchSharedTeam(VALID_ID, fetcher)).toEqual(SQUAD);
    expect(calledWith).toBe(`/api/profiles/${VALID_ID}/public`);
  });

  it('returns null for every failure mode', async () => {
    const failing: ShareFetcher = () =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    const throwing: ShareFetcher = () => Promise.reject(new Error('offline'));
    expect(await fetchSharedTeam(VALID_ID, failing)).toBeNull();
    expect(await fetchSharedTeam(VALID_ID, throwing)).toBeNull();
    expect(await fetchSharedTeam(VALID_ID, okFetcher({}))).toBeNull();
    expect(await fetchSharedTeam(VALID_ID, okFetcher({ code: 42 }))).toBeNull();
    expect(
      await fetchSharedTeam(VALID_ID, okFetcher({ code: '%%%' }))
    ).toBeNull();
    // A doll build stored under a share row is not a squad.
    expect(
      await fetchSharedTeam(
        VALID_ID,
        okFetcher({ code: encodeDollBuild(ALVA_BUILD) })
      )
    ).toBeNull();
  });
});

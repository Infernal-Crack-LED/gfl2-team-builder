/**
 * Pins mintShareId's decision tree — which of the two mint paths a short link
 * takes, and when a failed owned save is allowed to become an ANONYMOUS
 * (expiring) row instead.
 *
 * That distinction is invisible in the UI: both paths return an id and produce
 * the same `?id=` URL, but only one of them expires, and the hint that warns
 * about expiry is hidden while the user is logged in. So a wrong branch here
 * hands someone a link that dies three days later with nothing having said so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintShareId } from './auth';

const TOKEN_KEY = 'gfl2.auth';
const CODE = 'abc123';

/** Minimal localStorage — auth.ts reads the token through it. */
function stubStorage(token: string | null) {
  const store = new Map<string, string>();
  if (token !== null) {
    store.set(TOKEN_KEY, token);
  }
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** Routes by path so a test can fail the owned save and still serve the anon mint. */
function stubFetch(
  handlers: Record<string, () => Response>
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: string) => {
    const path = input.split('?')[0] ?? input;
    const handler = handlers[path];
    if (!handler) {
      throw new Error(`unexpected fetch: ${input}`);
    }
    return Promise.resolve(handler());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ANON_OK = () => jsonResponse(200, { id: 'anon-id' });
const OWNED_OK = () => jsonResponse(200, { id: 'owned-id' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mintShareId', () => {
  describe('with no token', () => {
    beforeEach(() => stubStorage(null));

    it('mints anonymously without touching the profiles API', async () => {
      const fetchMock = stubFetch({ '/api/share': ANON_OK });
      await expect(mintShareId(CODE)).resolves.toBe('anon-id');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('with a token', () => {
    beforeEach(() => stubStorage('a-token'));

    it('mints an owned, permanent row', async () => {
      stubFetch({ '/api/profiles': OWNED_OK });
      await expect(mintShareId(CODE)).resolves.toBe('owned-id');
    });

    it('sends the token to the profiles API but never to the anon mint', async () => {
      const fetchMock = stubFetch({ '/api/profiles': OWNED_OK });
      await mintShareId(CODE);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer a-token'
      );
    });

    it('falls through to an anonymous row when the token is REJECTED', async () => {
      // 401 means this user is effectively logged out; an expiring short link
      // beats no short link.
      stubFetch({
        '/api/profiles': () => jsonResponse(401, { error: 'unauthorized' }),
        '/api/share': ANON_OK,
      });
      await expect(mintShareId(CODE)).resolves.toBe('anon-id');
    });

    it('does NOT demote a logged-in user to an expiring row at the profile cap', async () => {
      // The regression this test exists for: a blanket catch turned a 400 into
      // a silent 3-day link for someone the expiry hint is hidden from. Throwing
      // instead sends the caller to the permanent `?b=` link.
      stubFetch({
        '/api/profiles': () => jsonResponse(400, { error: 'limit_reached' }),
      });
      await expect(mintShareId(CODE)).rejects.toThrow('limit_reached');
    });

    it('does NOT demote on a server error either', async () => {
      stubFetch({
        '/api/profiles': () => jsonResponse(500, null),
      });
      await expect(mintShareId(CODE)).rejects.toThrow('save failed (500)');
    });
  });
});

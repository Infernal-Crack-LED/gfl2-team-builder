/**
 * Auth + saved-profiles client — THE API contract pages import (conventions
 * §7). Single pattern, ported from the playbook §8.2: bearer token in
 * localStorage, delivered by the server via URL fragment after the Discord
 * OAuth round-trip.
 *
 * All API calls use RELATIVE paths: same-origin in prod (Hono serves both
 * dist/ and /api), and in dev the vite proxy forwards /auth + /api to
 * localhost:4173 — so CORS never enters the picture for the SPA itself.
 */
import { useCallback, useEffect, useState } from 'react';
import { shareProfileName } from '../../src/share/buildCode';
import { SHARE_PROFILE_KIND } from './buildShare';

export interface AuthUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface SavedProfile {
  id: string;
  kind: string;
  name: string;
  code: string;
  updatedAt: string;
}

/** Profiles kind slug for saved per-doll builds (/builder/<slug>). */
export const BUILD_KIND = 'gfl2-build';

/** Profiles kind slug for saved squads (/team-builder). */
export const TEAM_KIND = 'gfl2-team';

const TOKEN_KEY = 'gfl2.auth';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private-mode / disabled storage: behave as logged out.
    return null;
  }
}

/**
 * Read the OAuth result out of location.hash, store the token, then scrub
 * the URL. Call ONCE at startup (main.tsx) before React renders.
 *
 * The server delivers the token in the FRAGMENT (`#nsat=…`), never the
 * query: fragments are not sent to the server on requests and are not
 * leaked via the Referer header, so the token stays out of logs and
 * third-party analytics. Scrubbing via replaceState keeps it out of
 * history/bookmarks too.
 */
export function captureTokenFromUrl(): void {
  const hash = window.location.hash;
  if (!hash.startsWith('#nsat')) {
    return;
  }
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('nsat');
  const error = params.get('nsat_error');
  if (token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage unavailable — the user simply stays logged out.
    }
  }
  if (error) {
    console.warn(`[auth] Discord login failed: ${error}`);
  }
  history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search
  );
}

/**
 * URL for the login button. This is a FULL page navigation (top-level
 * redirect to Discord), not SPA routing — the OAuth round-trip leaves the
 * app and comes back to `return_to` with the token fragment.
 */
export function loginUrl(): string {
  return `/auth/discord/login?return_to=${encodeURIComponent(window.location.href)}`;
}

export function logout(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // See getToken — storage can be unavailable.
  }
}

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  return fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Current user, or null when logged out / token rejected. */
export async function fetchMe(): Promise<AuthUser | null> {
  if (!getToken()) {
    return null;
  }
  const res = await apiFetch('/api/me');
  if (res.status === 401) {
    // Token expired or forged — drop it so the UI settles on logged out.
    logout();
    return null;
  }
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as AuthUser;
}

export async function listProfiles(kind: string): Promise<SavedProfile[]> {
  const res = await apiFetch(`/api/profiles?kind=${encodeURIComponent(kind)}`);
  if (!res.ok) {
    return [];
  }
  return (await res.json()) as SavedProfile[];
}

/**
 * An API call that came back !ok, carrying the HTTP status.
 *
 * The status is the point: "your token is dead" and "you have hit your
 * profile cap" both surface as a rejected save, but only the first one should
 * silently reroute a share to the anonymous bucket (see mintShareId).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Upsert by (kind, name) — saving over an existing name replaces its code. */
export async function saveProfile(
  kind: string,
  name: string,
  code: string
): Promise<SavedProfile> {
  const res = await apiFetch('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, name, code }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(
      body?.error ?? `save failed (${res.status})`,
      res.status
    );
  }
  return (await res.json()) as SavedProfile;
}

/**
 * Mint a public share row with NO session, returning its id. Deliberately
 * bypasses apiFetch: this is the one write that must work logged out, and
 * sending a stale/rejected token with it would only invite a 401.
 *
 * The server derives the row's dedup name from the code, so re-minting the
 * same build returns the same id. Rows expire — see
 * ANON_SHARE_RETENTION_DAYS.
 */
export async function createAnonShare(code: string): Promise<string> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(
      body?.error ?? `share failed (${res.status})`,
      res.status
    );
  }
  const row = (await res.json()) as { id: string };
  return row.id;
}

/**
 * Mint the `?id=` row behind a short link and return its id.
 *
 * With a token the row is the user's own: owned, counted against their profile
 * cap, and permanent. Without one it goes to the shared anonymous bucket and
 * expires after ANON_SHARE_RETENTION_DAYS. Same URL either way, so callers
 * need only this one function — but the UI should say which one they get.
 *
 * Keyed on the TOKEN, not on useAuth's `user`, which is null for the first
 * moment of every page load while fetchMe is in flight. Keying on the resolved
 * user would silently hand a signed-in user an expiring row if they clicked
 * inside that window.
 *
 * A 401 — and ONLY a 401 — falls through to the anonymous mint: the token is
 * dead, so this user is effectively logged out and an expiring short link
 * beats no short link. Every other failure rethrows, because the caller's
 * fallback is the permanent `?b=` link, and quietly handing a signed-in user
 * an expiring row instead would be a downgrade they were never told about —
 * the hint that warns about expiry is hidden precisely because they are
 * logged in.
 */
export async function mintShareId(code: string): Promise<string> {
  if (!getToken()) {
    return createAnonShare(code);
  }
  try {
    const row = await saveProfile(
      SHARE_PROFILE_KIND,
      shareProfileName(code),
      code
    );
    return row.id;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return createAnonShare(code);
    }
    throw err;
  }
}

export async function deleteProfile(id: string): Promise<void> {
  await apiFetch(`/api/profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * React binding for the nav + save controls. `login` is a full-page
 * navigation to loginUrl(); `logout` clears the token locally (sessions are
 * stateless HMAC tokens — there is no server-side session to revoke).
 */
export function useAuth(): {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchMe()
      .then((u) => {
        if (live) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const login = useCallback(() => {
    window.location.assign(loginUrl());
  }, []);
  const doLogout = useCallback(() => {
    logout();
    setUser(null);
  }, []);

  return { user, loading, login, logout: doLogout };
}

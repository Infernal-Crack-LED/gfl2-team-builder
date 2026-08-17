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
    throw new Error(body?.error ?? `save failed (${res.status})`);
  }
  return (await res.json()) as SavedProfile;
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

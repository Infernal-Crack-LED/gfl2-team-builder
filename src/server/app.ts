/**
 * Hono app factory — static dist/ hosting with SPA fallback, Discord OAuth,
 * and the per-user saved-profiles API. Ported from the nikke-sim server
 * shape. This is the ONLY runtime API the site has (conventions §7): game
 * data stays client-side as build-imported JSON.
 */
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { getMimeType } from 'hono/utils/mime';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userProfiles } from '../db/schema.js';
import { registerImgApi } from './imgApi.js';
import { injectShareMeta } from './ogInject.js';
import { PUBLIC_KINDS, PUBLIC_PROFILE_ID_RE } from './publicShare.js';
import { sign, verify } from './session.js';

/** Claims carried inside the HMAC session token. */
interface SessionUser {
  sub: string; // Discord user id
  u: string; // display name (global_name ?? username)
  a: string | null; // Discord avatar hash
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-insecure-secret';
if (!process.env.SESSION_SECRET) {
  console.warn(
    '[server] SESSION_SECRET is not set — using an insecure dev default'
  );
}

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:4173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID ?? '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET ?? '';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';

const STATE_TTL_SEC = 600; // OAuth state lives for one login attempt
const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const PROFILE_CAP_PER_KIND = 100;

const KIND_RE = /^[a-z0-9-]+$/;
// `code` is an opaque base64url blob produced by the client; the DB and this
// server never interpret it, so validation is shape-and-size only.
const CODE_RE = /^[A-Za-z0-9_-]+$/;

const DIST = path.resolve('dist');

function redirectUri(requestUrl: string): string {
  // OAUTH_REDIRECT_URI overrides; otherwise derive from the request origin so
  // the same code serves dev (4173) and prod without config.
  return (
    process.env.OAUTH_REDIRECT_URI ??
    new URL('/auth/discord/callback', requestUrl).toString()
  );
}

/**
 * Only let the OAuth round-trip return to an origin we operate. Relative
 * paths resolve against the first allowed origin; anything pointing at a
 * foreign origin falls back to it too — an open redirect here would let an
 * attacker harvest session tokens via the `#nsat=` fragment.
 */
function safeReturnTo(raw: string | undefined): string {
  const fallback = ALLOWED_ORIGINS[0] ?? '/';
  if (!raw) {
    return fallback;
  }
  try {
    const url = new URL(raw, fallback);
    return ALLOWED_ORIGINS.includes(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

/** Extract and verify the Bearer session; null → caller answers 401. */
function bearerUser(authHeader: string | undefined): SessionUser | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const payload = verify<SessionUser>(authHeader.slice(7), SESSION_SECRET);
  if (!payload || typeof payload.sub !== 'string') {
    return null;
  }
  return payload;
}

export function createServer(): Hono {
  const app = new Hono();

  // ---- CORS ----
  // Reflect the Origin ONLY when it is in ALLOWED_ORIGINS; unknown origins
  // get no CORS headers at all, so browsers block them by default.
  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin');
    const allowed = origin !== undefined && ALLOWED_ORIGINS.includes(origin);
    if (c.req.method === 'OPTIONS') {
      if (!allowed) {
        return c.body(null, 204);
      }
      return c.body(null, 204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      });
    }
    await next();
    if (allowed) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
    }
  });

  // ---- Auth: Discord OAuth (no PKCE — the HMAC-signed state is the CSRF
  // protection; only we can mint a state that ties the callback to a
  // validated return_to) ----

  app.get('/auth/discord/login', (c) => {
    const returnTo = safeReturnTo(c.req.query('return_to'));
    const state = sign({ r: returnTo }, SESSION_SECRET, STATE_TTL_SEC);
    const params = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      response_type: 'code',
      scope: 'identify',
      redirect_uri: redirectUri(c.req.url),
      state,
    });
    return c.redirect(`${DISCORD_AUTHORIZE_URL}?${params.toString()}`);
  });

  app.get('/auth/discord/callback', async (c) => {
    const state = verify<{ r?: unknown }>(
      c.req.query('state') ?? '',
      SESSION_SECRET
    );
    const returnTo = safeReturnTo(
      typeof state?.r === 'string' ? state.r : undefined
    );
    // Errors also ride the fragment (#nsat_error=) so they reach the client
    // without ever appearing in server logs as query params.
    const fail = (reason: string) =>
      c.redirect(`${returnTo}#nsat_error=${encodeURIComponent(reason)}`);

    const code = c.req.query('code');
    if (!state || !code) {
      return fail('bad_state');
    }

    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(c.req.url),
      }),
    });
    if (!tokenRes.ok) {
      return fail('token_exchange');
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      return fail('token_exchange');
    }

    const meRes = await fetch(DISCORD_ME_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) {
      return fail('user_fetch');
    }
    const me = (await meRes.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };

    const session = sign(
      { sub: me.id, u: me.global_name ?? me.username, a: me.avatar ?? null },
      SESSION_SECRET,
      SESSION_TTL_SEC
    );
    // The session token is delivered in the URL FRAGMENT, never the query:
    // fragments are not sent to servers (kept out of access logs) and are not
    // leaked via the Referer header. web/src/auth.ts reads and scrubs it.
    return c.redirect(`${returnTo}#nsat=${session}`);
  });

  // ---- API (all require Bearer except via the 401 guard) ----

  app.get('/api/me', (c) => {
    const user = bearerUser(c.req.header('Authorization'));
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return c.json({ id: user.sub, username: user.u, avatar: user.a ?? null });
  });

  app.get('/api/profiles', async (c) => {
    const user = bearerUser(c.req.header('Authorization'));
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const kind = c.req.query('kind') ?? '';
    if (!KIND_RE.test(kind)) {
      return c.json({ error: 'bad_kind' }, 400);
    }
    const rows = await db
      .select({
        id: userProfiles.id,
        kind: userProfiles.kind,
        name: userProfiles.name,
        code: userProfiles.code,
        updatedAt: userProfiles.updatedAt,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.discordId, user.sub),
          eq(userProfiles.kind, kind)
        )
      )
      .orderBy(desc(userProfiles.updatedAt));
    return c.json(rows);
  });

  app.post('/api/profiles', async (c) => {
    const user = bearerUser(c.req.header('Authorization'));
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = (await c.req.json().catch(() => null)) as {
      kind?: unknown;
      name?: unknown;
      code?: unknown;
    } | null;
    const kind = typeof body?.kind === 'string' ? body.kind : '';
    const name = typeof body?.name === 'string' ? body.name : '';
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!KIND_RE.test(kind)) {
      return c.json({ error: 'bad_kind' }, 400);
    }
    if (name.length < 1 || name.length > 80) {
      return c.json({ error: 'bad_name' }, 400);
    }
    if (code.length < 1 || code.length > 8192 || !CODE_RE.test(code)) {
      return c.json({ error: 'bad_code' }, 400);
    }

    // Cap rows per (user, kind) — but an upsert onto an EXISTING name never
    // grows the table, so only reject when this save would insert a new row.
    const existing = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.discordId, user.sub),
          eq(userProfiles.kind, kind),
          eq(userProfiles.name, name)
        )
      )
      .limit(1);
    if (existing.length === 0) {
      const countRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.discordId, user.sub),
            eq(userProfiles.kind, kind)
          )
        );
      if (Number(countRows[0]?.count ?? 0) >= PROFILE_CAP_PER_KIND) {
        return c.json({ error: 'limit_reached' }, 400);
      }
    }

    const [row] = await db
      .insert(userProfiles)
      .values({ discordId: user.sub, kind, name, code })
      .onConflictDoUpdate({
        target: [userProfiles.discordId, userProfiles.kind, userProfiles.name],
        set: { code, updatedAt: new Date() },
      })
      .returning({
        id: userProfiles.id,
        kind: userProfiles.kind,
        name: userProfiles.name,
        code: userProfiles.code,
        updatedAt: userProfiles.updatedAt,
      });
    return c.json(row);
  });

  // ---- Public share read (NO auth) ----
  // Only PUBLIC_KINDS rows are readable by id without a session (see
  // publicShare.ts — adding a kind there makes all its rows world-readable).
  // Non-allowlisted kinds answer 404 indistinguishably from missing rows, so
  // this endpoint can't be used to probe which ids exist. The response NEVER
  // includes discord_id.
  app.get('/api/profiles/:id/public', async (c) => {
    const id = c.req.param('id');
    if (!PUBLIC_PROFILE_ID_RE.test(id)) {
      return c.json({ error: 'not_found' }, 404);
    }
    const [row] = await db
      .select({
        id: userProfiles.id,
        kind: userProfiles.kind,
        name: userProfiles.name,
        code: userProfiles.code,
        updatedAt: userProfiles.updatedAt,
      })
      .from(userProfiles)
      .where(and(eq(userProfiles.id, id), eq(userProfiles.kind, PUBLIC_KINDS[0])))
      .limit(1);
    if (
      !row ||
      !PUBLIC_KINDS.includes(row.kind as (typeof PUBLIC_KINDS)[number])
    ) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json(row);
  });

  app.delete('/api/profiles/:id', async (c) => {
    const user = bearerUser(c.req.header('Authorization'));
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    // Scoped by discord_id: deleting someone else's row is a silent no-op,
    // which deliberately leaks nothing about whether the id exists.
    await db
      .delete(userProfiles)
      .where(
        and(
          eq(userProfiles.id, c.req.param('id')),
          eq(userProfiles.discordId, user.sub)
        )
      );
    return c.body(null, 204);
  });

  // Server-rendered share-card image API (/api/v1/img/*) — registered BEFORE
  // the API catch-all so its routes win.
  registerImgApi(app);

  // Unknown API/auth routes must NOT fall through to the SPA fallback —
  // they are real 404s.
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
  app.all('/auth/*', (c) => c.json({ error: 'not_found' }, 404));

  // ---- Static dist/ with SPA fallback ----
  // Unknown extension-less paths serve index.html (client router owns them).
  // Content-hashed assets under /assets/ are immutable forever; everything
  // else is no-cache so a new deploy is picked up immediately.
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return next();
    }
    const urlPath = new URL(c.req.url).pathname;
    const lastSegment = urlPath.split('/').pop() ?? '';
    const hasExtension = lastSegment.includes('.');

    const filePath = path.join(DIST, path.normalize(`/${urlPath}`));
    // path.normalize + join can still be escaped with enough `..` — refuse
    // anything that lands outside dist/.
    if (!filePath.startsWith(DIST + path.sep) && filePath !== DIST) {
      return c.text('Not found', 404);
    }

    if (hasExtension) {
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const body = await readFile(filePath);
        return c.body(body, 200, {
          'Content-Type':
            getMimeType(filePath) ?? 'application/octet-stream',
          'Cache-Control': urlPath.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        });
      }
      // Extension-ful 404: a real missing file, not an SPA route.
      return c.text('Not found', 404);
    }

    // SPA fallback: extension-less path → the client router decides. Share
    // URLs (/builder/<slug>?b=|id=, /team-builder?b=|id=) get their OG/Twitter
    // head tags rewritten to the content-addressed card image (ogInject.ts).
    const indexHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');
    const html = await injectShareMeta(indexHtml, new URL(c.req.url));
    return c.html(html, 200, { 'Cache-Control': 'no-cache' });
  });

  return app;
}

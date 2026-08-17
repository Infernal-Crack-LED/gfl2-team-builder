/**
 * Hono app factory — static dist/ hosting with SPA fallback, Discord OAuth,
 * the per-user saved-profiles API, the anonymous share mint, and the per-doll
 * recommendation defaults. Ported from the nikke-sim server shape. GAME data
 * stays client-side as build-imported JSON (conventions §7); the runtime API
 * serves only mutable rows: user profiles, share rows and the community rec
 * defaults.
 */
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { getMimeType } from 'hono/utils/mime';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getConnInfo } from '@hono/node-server/conninfo';
import { db } from '../db/index.js';
import { dollRecommendations, userProfiles } from '../db/schema.js';
import {
  BUILD_VERSION,
  decodeRecBuild,
  encodeRecBuild,
  shareProfileName,
  type RecBuild,
} from '../share/buildCode.js';
import {
  ANON_OWNER,
  ANON_ROW_CAP,
  anonExpiryCutoff,
  clientIpFromForwardedFor,
} from './anonShare.js';
import { cacheControlFor, etagFor, isNotModified } from './httpCache.js';
import { injectRootBody } from './htmlHead.js';
import { registerImgApi } from './imgApi.js';
import { noJsBodyFor } from './noJsBody.js';
import { injectShareMeta } from './ogInject.js';
import {
  injectBreadcrumbLd,
  injectPageMeta,
  redirectTargetFor,
  resolvePage,
} from './pageMeta.js';
import { PUBLIC_KINDS, PUBLIC_PROFILE_ID_RE } from './publicShare.js';
import { createRateLimiter } from './rateLimit.js';
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

// Umami analytics (self-hosted) — injected server-side so the URL/ID can
// change without a rebuild. Omit either to disable (e.g. dev).
const UMAMI_URL = process.env.UMAMI_URL ?? '';
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID ?? '';

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
const MAX_CODE_LEN = 8192;

/**
 * Anonymous mints per IP per hour. Generous next to real use — one build is
 * one mint no matter how many times you copy it, since the row is keyed by a
 * hash of the code — but low enough that filling ANON_ROW_CAP would take
 * hundreds of distinct addresses.
 */
const ANON_MINT_LIMIT = 60;
const ANON_MINT_WINDOW_MS = 60 * 60 * 1000;

const DIST = path.resolve('dist');

/** Inject the Umami analytics script into the HTML <head>, if configured.
 * Idempotent: never injects the tag twice. */
function injectUmami(html: string): string {
  if (!UMAMI_URL || !UMAMI_WEBSITE_ID) {
    return html;
  }
  const src = `${UMAMI_URL}/script.js`;
  if (html.includes(src)) {
    return html;
  }
  const tag = `<script defer src="${src}" data-website-id="${UMAMI_WEBSITE_ID}"></script>`;
  return html.replace('</head>', `  ${tag}\n  </head>`);
}

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

/**
 * Delete anonymous share rows past their retention window. Scoped to
 * ANON_OWNER, so a signed-in user's saves and share rows are never touched.
 * Idempotent — safe to run from every replica.
 */
export async function sweepExpiredAnonShares(): Promise<void> {
  await db
    .delete(userProfiles)
    .where(
      and(
        eq(userProfiles.discordId, ANON_OWNER),
        lt(userProfiles.updatedAt, anonExpiryCutoff(Date.now()))
      )
    );
}

export function createServer(): Hono {
  const app = new Hono();

  // Per-app so tests don't inherit another app's counters.
  const anonMintLimiter = createRateLimiter({
    limit: ANON_MINT_LIMIT,
    windowMs: ANON_MINT_WINDOW_MS,
  });

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
        and(eq(userProfiles.discordId, user.sub), eq(userProfiles.kind, kind))
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
    if (code.length < 1 || code.length > MAX_CODE_LEN || !CODE_RE.test(code)) {
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
          and(eq(userProfiles.discordId, user.sub), eq(userProfiles.kind, kind))
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
      .where(
        and(eq(userProfiles.id, id), eq(userProfiles.kind, PUBLIC_KINDS[0]))
      )
      .limit(1);
    if (
      !row ||
      !PUBLIC_KINDS.includes(row.kind as (typeof PUBLIC_KINDS)[number])
    ) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json(row);
  });

  // ---- Anonymous share mint (NO auth) ----
  // Logged-out users can hand out a short link too. The row is owned by the
  // ANON_OWNER sentinel and expires (see anonShare.ts for why the rules differ
  // from a signed-in share). Reads are unchanged: the id resolves through the
  // same public path as any other 'gfl2-share' row.
  app.post('/api/share', async (c) => {
    // Keyed on the forwarded client address, falling back to the socket — an
    // unauthenticated insert with no key at all is a disk-fill waiting to
    // happen. getConnInfo needs the node-server bindings, which a bare
    // fetch() in a test won't have.
    let ip = clientIpFromForwardedFor(c.req.header('X-Forwarded-For'));
    if (!ip) {
      try {
        ip = getConnInfo(c).remote.address ?? null;
      } catch {
        ip = null;
      }
    }
    if (!anonMintLimiter.allow(ip ?? 'unknown', Date.now())) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const body = (await c.req.json().catch(() => null)) as {
      code?: unknown;
    } | null;
    const code = typeof body?.code === 'string' ? body.code : '';
    if (code.length < 1 || code.length > MAX_CODE_LEN || !CODE_RE.test(code)) {
      return c.json({ error: 'bad_code' }, 400);
    }
    // Server-derived, never client-supplied: the name IS the dedup key, so
    // letting a caller choose it would let them overwrite someone else's row.
    const name = shareProfileName(code);

    const existing = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.discordId, ANON_OWNER),
          eq(userProfiles.kind, PUBLIC_KINDS[0]),
          eq(userProfiles.name, name)
        )
      )
      .limit(1);
    if (existing.length === 0) {
      // Only an INSERT can breach the cap; re-sharing an existing build is an
      // upsert onto its own row and always allowed.
      const countRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.discordId, ANON_OWNER),
            eq(userProfiles.kind, PUBLIC_KINDS[0])
          )
        );
      if (Number(countRows[0]?.count ?? 0) >= ANON_ROW_CAP) {
        return c.json({ error: 'capacity' }, 503);
      }
    }

    const [row] = await db
      .insert(userProfiles)
      .values({
        discordId: ANON_OWNER,
        kind: PUBLIC_KINDS[0],
        name,
        code,
      })
      .onConflictDoUpdate({
        target: [userProfiles.discordId, userProfiles.kind, userProfiles.name],
        // Same code (the name is its hash), so only the clock moves — which
        // is the point: re-sharing a build renews its three days.
        set: { updatedAt: new Date() },
      })
      .returning({ id: userProfiles.id });
    if (!row) {
      // Both arms of the upsert RETURNING a row is guaranteed by Postgres;
      // this only fires if that ever stops being true.
      return c.json({ error: 'share_failed' }, 500);
    }
    return c.json({ id: row.id });
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

  // Community recommendation defaults for the infographics rec card, one row
  // per doll (imported by src/bin/import-recommendations.ts). Served as a
  // REC CODE rather than raw fields: the client then reuses its total
  // decoder for validation, and a hand-edited DB row that breaks the shape
  // degrades to "no defaults" on both ends instead of a broken tool.
  app.get('/api/v1/rec-defaults/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
      return c.json({ error: 'not_found' }, 404);
    }
    const [row] = await db
      .select()
      .from(dollRecommendations)
      .where(eq(dollRecommendations.dollSlug, slug))
      .limit(1);
    if (!row) {
      return c.json({ error: 'not_found' }, 404);
    }
    const arr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string')
        : [];
    const payload: RecBuild = {
      v: BUILD_VERSION,
      card: 'rec',
      doll: slug,
      bp: arr(row.breakpoints),
      ws: arr(row.weaponIds),
      sets: arr(row.setNames),
      keys: arr(row.fixedKeyIds),
    };
    if (row.optimal) {
      payload.opt = row.optimal;
    }
    if (row.expansionKeyId) {
      payload.exp = row.expansionKeyId;
    }
    const ck = arr(row.commonKeyIds);
    if (ck.length > 0) {
      payload.ck = ck;
    }
    const stats = arr(row.statPrefs);
    if (stats.length > 0) {
      payload.stats = stats;
    }
    if (row.notes) {
      payload.notes = row.notes;
    }
    const code = encodeRecBuild(payload);
    if (!decodeRecBuild(code)) {
      // A malformed row (bad token, over-cap list) is a data bug, not a
      // client problem — hide it rather than serve an undecodable code.
      return c.json({ error: 'not_found' }, 404);
    }
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ code });
  });

  // Server-rendered share-card image API (/api/v1/img/*) — registered BEFORE
  // the API catch-all so its routes win.
  registerImgApi(app);

  // Unknown API/auth routes must NOT fall through to the SPA fallback —
  // they are real 404s.
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
  app.all('/auth/*', (c) => c.json({ error: 'not_found' }, 404));

  // ---- Static dist/ with SPA fallback ----
  // Unknown extension-less paths serve index.html (client router owns them),
  // with this URL's embed metadata and no-JS body injected. Content-hashed
  // assets are immutable forever; everything else is no-cache + an ETag so a
  // new deploy is picked up immediately without refetching unchanged art.
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return next();
    }
    const url = new URL(c.req.url);
    const urlPath = url.pathname;
    const lastSegment = urlPath.split('/').pop() ?? '';
    const hasExtension = lastSegment.includes('.');

    const filePath = path.join(DIST, path.normalize(`/${urlPath}`));
    // path.normalize + join can still be escaped with enough `..` — refuse
    // anything that lands outside dist/.
    if (!filePath.startsWith(DIST + path.sep) && filePath !== DIST) {
      return c.text('Not found', 404);
    }

    // 301 the non-canonical spellings (/teambuilder, /index.html, trailing
    // slash, mixed case) so link equity lands on the canonical URL rather than
    // only being hinted at by <link rel="canonical">. The query survives —
    // share links carry their payload there. Checked BEFORE the static branch
    // so /index.html redirects instead of being served as a file; asset paths
    // are exempt inside redirectTargetFor (case-sensitive on disk).
    const redirectTo = redirectTargetFor(urlPath);
    if (redirectTo !== null) {
      return c.redirect(redirectTo + url.search, 301);
    }

    if (hasExtension) {
      const stat = existsSync(filePath) ? statSync(filePath) : null;
      if (stat?.isFile()) {
        const etag = etagFor(stat);
        const cacheControl = cacheControlFor(urlPath);
        if (
          isNotModified(
            etag,
            stat.mtimeMs,
            c.req.header('if-none-match'),
            c.req.header('if-modified-since')
          )
        ) {
          // last-modified rides the 304 so an IMS-driven client can re-anchor
          // its next conditional request.
          return c.body(null, 304, {
            ETag: etag,
            'Cache-Control': cacheControl,
            'Last-Modified': stat.mtime.toUTCString(),
          });
        }
        const body = await readFile(filePath);
        return c.body(body, 200, {
          'Content-Type': getMimeType(filePath) ?? 'application/octet-stream',
          'Cache-Control': cacheControl,
          ETag: etag,
          'Last-Modified': stat.mtime.toUTCString(),
        });
      }
      // Extension-ful 404: a real missing file, not an SPA route.
      return c.text('Not found', 404);
    }

    // SPA fallback: extension-less path → the client router decides. Three
    // layers of injection, outermost last:
    //   1. per-URL page meta + breadcrumb + no-JS body (pageMeta/noJsBody) —
    //      unknown paths resolve to a hard 404 instead of a soft-200 shell.
    //   2. share-card meta for /builder/<slug>?b=|id= and /team-builder?b=|id=
    //      (ogInject.ts), which must WIN over the page image.
    //   3. Umami, injected server-side so the URL/ID can change without a
    //      rebuild.
    const page = resolvePage(url);
    const indexHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');
    let html = injectPageMeta(indexHtml, page);
    html = injectBreadcrumbLd(html, page);
    html = injectRootBody(html, noJsBodyFor(page));
    html = await injectShareMeta(html, url);
    html = injectUmami(html);
    return c.html(html, page.status, { 'Cache-Control': 'no-cache' });
  });

  return app;
}

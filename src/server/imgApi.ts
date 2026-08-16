/**
 * Image API — server-rendered share cards.
 *
 *   GET /api/v1/img/build.png?b=<code>   (or ?id=<public profile uuid>)
 *   GET /api/v1/img/team.png?b=<code>    (or ?id=<public profile uuid>)
 *   GET /api/v1/img/cache/<kind>.<hash>.png
 *
 * The render routes never return PNG bytes directly: they 302 to a
 * CONTENT-ADDRESSED cache URL (see src/infographics/cacheKey.ts for why —
 * Discord caches embed images by URL forever, so every handed-out URL must
 * be immutable). The 302 itself is `no-cache` so an updated renderer
 * (RENDERER_VERSION bump → new hash) is picked up immediately; the cache
 * object it points at is `immutable` forever.
 *
 * ?id= support IS implemented: the id addresses a public profile row
 * (kind 'gfl2-share', same rules as /api/profiles/:id/public) whose stored
 * code is expanded BEFORE hashing — cache keys address content, not rows.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userProfiles } from '../db/schema.js';
import {
  decodeAnyBuild,
  decodeDollBuild,
  decodeTeamBuild,
  type DollBuild,
  type TeamBuild,
} from '../share/buildCode.js';
import {
  CACHE_FILENAME_RE,
  renderCacheFilename,
  type RenderKind,
} from '../infographics/cacheKey.js';
import {
  renderBuildCardPng,
  renderTeamCardPng,
} from '../infographics/node/render.js';
import { loadPortrait } from '../infographics/node/portraits.js';
import { getDoll, getKey, getWeapon, keyDisplayName } from './gameData.js';
import { PUBLIC_KINDS, PUBLIC_PROFILE_ID_RE } from './publicShare.js';

const CACHE_DIR = path.resolve('render-cache');
const MAX_CODE_LEN = 4096;

class BadRequest extends Error {}

/** Resolve ?b= or ?id= to a decoded, data-validated card payload. */
async function resolvePayload(
  routeKind: RenderKind,
  b: string | undefined,
  id: string | undefined
): Promise<{ kind: RenderKind; build: DollBuild | TeamBuild }> {
  if (id !== undefined) {
    if (!PUBLIC_PROFILE_ID_RE.test(id)) {
      throw new BadRequest('invalid id');
    }
    const [row] = await db
      .select({ kind: userProfiles.kind, code: userProfiles.code })
      .from(userProfiles)
      .where(
        and(eq(userProfiles.id, id), eq(userProfiles.kind, PUBLIC_KINDS[0]))
      )
      .limit(1);
    if (
      !row ||
      !PUBLIC_KINDS.includes(row.kind as (typeof PUBLIC_KINDS)[number])
    ) {
      throw new BadRequest('invalid id');
    }
    const decoded = decodeAnyBuild(row.code);
    if (!decoded) {
      throw new BadRequest('invalid build code');
    }
    return decoded;
  }
  const code = b ?? '';
  if (code.length === 0 || code.length > MAX_CODE_LEN) {
    throw new BadRequest('invalid build code');
  }
  if (routeKind === 'build') {
    const build = decodeDollBuild(code);
    if (!build) {
      throw new BadRequest('invalid build code');
    }
    return { kind: 'build', build };
  }
  const team = decodeTeamBuild(code);
  if (!team) {
    throw new BadRequest('invalid build code');
  }
  return { kind: 'team', build: team };
}

/** Every slug/id the payload references must exist in the committed data —
 * the renderer degrades on missing STRINGS, but a reference to a doll that
 * does not exist is a junk link, answered 400 before any rendering. */
function validateBuild(build: DollBuild): void {
  if (!getDoll(build.doll)) {
    throw new BadRequest(`unknown doll: ${build.doll}`);
  }
  if (build.weapon !== null && !getWeapon(build.weapon)) {
    throw new BadRequest(`unknown weapon: ${build.weapon}`);
  }
  for (const k of build.keys) {
    if (!getKey(k)) {
      throw new BadRequest(`unknown key: ${k}`);
    }
  }
  if (build.exp != null && !getKey(build.exp)) {
    throw new BadRequest(`unknown key: ${build.exp}`);
  }
}

function validateTeam(team: TeamBuild): void {
  for (const slot of team.s) {
    if (!slot) {
      continue;
    }
    if (!getDoll(slot.d)) {
      throw new BadRequest(`unknown doll: ${slot.d}`);
    }
    if (typeof slot.w === 'string' && !getWeapon(slot.w)) {
      throw new BadRequest(`unknown weapon: ${slot.w}`);
    }
    for (const k of slot.k ?? []) {
      if (!getKey(k)) {
        throw new BadRequest(`unknown key: ${k}`);
      }
    }
  }
}

async function renderPayload(
  kind: RenderKind,
  build: DollBuild | TeamBuild
): Promise<Buffer> {
  if (kind === 'build') {
    const b = build as DollBuild;
    const doll = getDoll(b.doll); // validated before render
    const weapon = b.weapon !== null ? getWeapon(b.weapon) : undefined;
    const portrait = await loadPortrait(doll?.avatarUrl);
    const commonKeyNames = (b.ck ?? [])
      .map((id) => getKey(id))
      .filter((k) => k !== undefined)
      .map(keyDisplayName);
    const keyNames = b.keys
      .map((id) => getKey(id))
      .filter((k) => k !== undefined)
      .map(keyDisplayName);
    // Expansion key is stored separately (outside the fixed-key cap).
    if (b.exp) {
      const expKey = getKey(b.exp);
      if (expKey) {
        keyNames.push(keyDisplayName(expKey));
      }
    }
    return renderBuildCardPng({
      dollName: doll?.name ?? null,
      dollClass: doll?.class ?? null,
      dollPhase: doll?.phase ?? null,
      dollRarity: doll?.rarity ?? null,
      weaponName: weapon?.name ?? null,
      keyNames,
      vert: b.vert,
      refinement: b.cal ?? null,
      statPrefs: b.stats ?? [],
      commonKeyNames,
      portrait,
    });
  }
  const t = build as TeamBuild;
  const filled = t.s.filter((s) => s !== null);
  const slots = await Promise.all(
    filled.map(async (s) => {
      const doll = getDoll(s.d);
      const weapon = typeof s.w === 'string' ? getWeapon(s.w) : undefined;
      return {
        dollName: doll?.name ?? s.d,
        weaponName: weapon?.name ?? null,
        portrait: await loadPortrait(doll?.avatarUrl),
      };
    })
  );
  return renderTeamCardPng(slots);
}

/** Single-flight: concurrent misses for the same filename share ONE render. */
const inFlight = new Map<string, Promise<Buffer>>();

function renderSingleFlight(
  filename: string,
  render: () => Promise<Buffer>
): Promise<Buffer> {
  const existing = inFlight.get(filename);
  if (existing) {
    return existing;
  }
  const pending = render().finally(() => inFlight.delete(filename));
  inFlight.set(filename, pending);
  return pending;
}

/** tmp + rename so a concurrent reader never sees a partial PNG. */
async function writeAtomic(filename: string, png: Buffer): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = path.join(
    CACHE_DIR,
    `.${filename}.${randomBytes(6).toString('hex')}.tmp`
  );
  await writeFile(tmp, png);
  await rename(tmp, path.join(CACHE_DIR, filename));
}

export function registerImgApi(app: Hono): void {
  for (const routeKind of ['build', 'team'] as const) {
    app.get(`/api/v1/img/${routeKind}.png`, async (c) => {
      const b = c.req.query('b');
      const id = c.req.query('id');
      if (b !== undefined && id !== undefined) {
        return c.json({ error: 'invalid build code' }, 400);
      }
      let payload: { kind: RenderKind; build: DollBuild | TeamBuild };
      try {
        payload = await resolvePayload(routeKind, b, id);
        if (payload.kind === 'build') {
          validateBuild(payload.build as DollBuild);
        } else {
          validateTeam(payload.build as TeamBuild);
        }
      } catch (err) {
        if (err instanceof BadRequest) {
          return c.json({ error: 'invalid build code' }, 400);
        }
        throw err;
      }

      const filename = renderCacheFilename(payload.kind, payload.build);
      if (!existsSync(path.join(CACHE_DIR, filename))) {
        const png = await renderSingleFlight(filename, () =>
          renderPayload(payload.kind, payload.build)
        );
        if (!existsSync(path.join(CACHE_DIR, filename))) {
          await writeAtomic(filename, png);
        }
      }
      // The 302 itself is no-cache (only the cache OBJECT is immutable), so a
      // RENDERER_VERSION bump produces a new hash on the very next request.
      c.header('Cache-Control', 'no-cache');
      return c.redirect(`/api/v1/img/cache/${filename}`, 302);
    });
  }

  app.get('/api/v1/img/cache/:file', async (c) => {
    const file = c.req.param('file');
    // The regex guarantees no path traversal — only ever <kind>.<16hex>.png.
    if (!CACHE_FILENAME_RE.test(file)) {
      return c.json({ error: 'not_found' }, 404);
    }
    const filePath = path.join(CACHE_DIR, file);
    if (!existsSync(filePath)) {
      // Honest 404: no render-on-demand here — the hash must come from a
      // real render route, otherwise this endpoint would be an unbounded
      // render oracle.
      return c.json({ error: 'not_found' }, 404);
    }
    const body = await readFile(filePath);
    return c.body(body, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

  // Misses under the image API are real 404s, never SPA fallback.
  app.all('/api/v1/img/*', (c) => c.json({ error: 'not_found' }, 404));
}

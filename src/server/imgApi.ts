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
  decodeRecBuild,
  decodeTeamBuild,
  type DollBuild,
  type RecBuild,
  type TeamBuild,
} from '../share/buildCode.js';
import {
  CACHE_FILENAME_RE,
  renderCacheFilename,
  type RenderKind,
} from '../infographics/cacheKey.js';
import {
  renderBuildCardPng,
  renderRecCardPng,
  renderTeamCardPng,
  renderWeaponCardPng,
} from '../infographics/node/render.js';
import { loadArt, loadPortrait } from '../infographics/node/portraits.js';
import { commonKeySource, fixedKeySlot } from '../share/keyLabels.js';
import {
  getAttachmentSet,
  getDoll,
  getDollById,
  getKey,
  getWeapon,
  getWeaponBySlug,
  keyDisplayName,
  resolveMarkerText,
} from './gameData.js';
import { PUBLIC_KINDS, PUBLIC_PROFILE_ID_RE } from './publicShare.js';

const CACHE_DIR = path.resolve('render-cache');
const MAX_CODE_LEN = 4096;

class BadRequest extends Error {}

/** Resolve ?b= or ?id= to a decoded, data-validated card payload. */
async function resolvePayload(
  routeKind: RenderKind,
  b: string | undefined,
  id: string | undefined
): Promise<{ kind: RenderKind; build: DollBuild | TeamBuild | RecBuild }> {
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
  if (routeKind === 'rec') {
    const rec = decodeRecBuild(code);
    if (!rec) {
      throw new BadRequest('invalid build code');
    }
    return { kind: 'rec', build: rec };
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
  // Fixed AND common keys — validateTeam checks both per slot, and a doll
  // build must not be the looser endpoint of the pair.
  for (const k of [...build.keys, ...(build.ck ?? [])]) {
    if (!getKey(k)) {
      throw new BadRequest(`unknown key: ${k}`);
    }
  }
  if (build.exp != null && !getKey(build.exp)) {
    throw new BadRequest(`unknown key: ${build.exp}`);
  }
  if (build.set != null && !getAttachmentSet(build.set)) {
    throw new BadRequest(`unknown attachment set: ${build.set}`);
  }
}

function validateRec(rec: RecBuild): void {
  if (!getDoll(rec.doll)) {
    throw new BadRequest(`unknown doll: ${rec.doll}`);
  }
  for (const w of rec.ws) {
    if (!getWeapon(w)) {
      throw new BadRequest(`unknown weapon: ${w}`);
    }
  }
  for (const s of rec.sets) {
    if (!getAttachmentSet(s)) {
      throw new BadRequest(`unknown attachment set: ${s}`);
    }
  }
  for (const k of [...rec.keys, ...(rec.ck ?? [])]) {
    if (!getKey(k)) {
      throw new BadRequest(`unknown key: ${k}`);
    }
  }
  if (rec.exp != null && !getKey(rec.exp)) {
    throw new BadRequest(`unknown key: ${rec.exp}`);
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
    // Every key a slot references — fixed, expansion, and common — must
    // resolve, same contract as validateBuild.
    for (const k of [...(slot.k ?? []), ...(slot.ck ?? [])]) {
      if (!getKey(k)) {
        throw new BadRequest(`unknown key: ${k}`);
      }
    }
    if (slot.ex != null && !getKey(slot.ex)) {
      throw new BadRequest(`unknown key: ${slot.ex}`);
    }
    if (slot.as != null && !getAttachmentSet(slot.as)) {
      throw new BadRequest(`unknown attachment set: ${slot.as}`);
    }
  }
}

async function renderPayload(
  kind: RenderKind,
  build: DollBuild | TeamBuild | RecBuild
): Promise<Buffer> {
  if (kind === 'rec') {
    const r = build as RecBuild;
    const doll = getDoll(r.doll); // validated before render
    const [portrait, ...weaponImages] = await Promise.all([
      loadPortrait(doll?.avatarUrl),
      ...r.ws.map((id) => loadArt(getWeapon(id)?.imageUrl)),
    ]);
    // Same label resolution as the build card below — fixed keys as slot
    // numbers, common keys by source doll, expansion key as its short title —
    // EXCEPT the order: rec lists are priority-ordered, so no sorting here.
    const fixedKeySlots = r.keys
      .map((id) => getKey(id))
      .filter((k) => k !== undefined)
      .map(fixedKeySlot)
      .filter((n): n is number => n !== null);
    const commonKeySources = (r.ck ?? [])
      .map((id) => getKey(id))
      .filter((k) => k !== undefined)
      .map((k) => commonKeySource(k, getDollById(k.dollId)?.name ?? null));
    const expKey = r.exp ? getKey(r.exp) : undefined;
    return renderRecCardPng({
      dollName: doll?.name ?? null,
      dollClass: doll?.class ?? null,
      dollPhase: doll?.phase ?? null,
      dollRarity: doll?.rarity ?? null,
      official: r.src === 'sheet',
      breakpoints: r.bp,
      optimal: r.opt ?? null,
      weapons: r.ws.map((id, i) => ({
        name: getWeapon(id)?.name ?? id,
        image: weaponImages[i] ?? null,
      })),
      attachmentSets: r.sets,
      fixedKeySlots,
      expansionKeyName: expKey
        ? (expKey.keyTitle ?? keyDisplayName(expKey))
        : null,
      commonKeySources,
      statPrefs: r.stats ?? [],
      notes: r.notes ?? null,
      portrait,
    });
  }
  if (kind === 'build') {
    const b = build as DollBuild;
    const doll = getDoll(b.doll); // validated before render
    const weapon = b.weapon !== null ? getWeapon(b.weapon) : undefined;
    const [portrait, weaponImage] = await Promise.all([
      loadPortrait(doll?.avatarUrl),
      loadArt(weapon?.imageUrl),
    ]);
    // Common keys are named by the doll they come from; the generics (no
    // source doll) name themselves. See share/keyLabels.ts.
    const commonKeySources = (b.ck ?? [])
      .map((id) => getKey(id))
      .filter((k) => k !== undefined)
      .map((k) => commonKeySource(k, getDollById(k.dollId)?.name ?? null));
    // Fixed keys show as slot NUMBERS ("Fixed 1, 3, 5"); a key whose title
    // carries no parseable slot is dropped rather than shown untitled.
    const fixedKeySlots = b.keys
      .map((id) => getKey(id))
      .filter((k) => k !== undefined)
      .map(fixedKeySlot)
      .filter((n): n is number => n !== null)
      .sort((x, y) => x - y);
    // Expansion key is stored separately (outside the fixed-key cap).
    const expKey = b.exp ? getKey(b.exp) : undefined;
    return renderBuildCardPng({
      dollName: doll?.name ?? null,
      dollClass: doll?.class ?? null,
      dollPhase: doll?.phase ?? null,
      dollRarity: doll?.rarity ?? null,
      weaponName: weapon?.name ?? null,
      weaponImage,
      fixedKeySlots,
      commonKeySources,
      // keyTitle, not keyDisplayName: the row is already labelled "Expansion
      // Key", so the value must not repeat it.
      expansionKeyName: expKey
        ? (expKey.keyTitle ?? keyDisplayName(expKey))
        : null,
      vert: b.vert,
      refinement: b.cal ?? null,
      attachmentSet: b.set ?? null,
      statPrefs: b.stats ?? [],
      portrait,
    });
  }
  const t = build as TeamBuild;
  const filled = t.s.filter((s) => s !== null);
  const slots = await Promise.all(
    filled.map(async (s) => {
      const doll = getDoll(s.d);
      const weapon = typeof s.w === 'string' ? getWeapon(s.w) : undefined;
      // Fixed keys show as SLOT NUMBERS, not titles — that is how a squad's
      // key investment is read at a glance. A key whose title carries no
      // number simply contributes no chip.
      const fixedKeys = (s.k ?? [])
        .map((id) => getKey(id))
        .filter((k) => k !== undefined)
        .map(fixedKeySlot)
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
      // Common keys are named by their SOURCE doll ("Suomi", not the key's
      // own title); the stat-only generics have no source and name themselves.
      const commonKeys = (s.ck ?? [])
        .map((id) => getKey(id))
        .filter((k) => k !== undefined)
        .map((k) => commonKeySource(k, getDollById(k.dollId)?.name));
      // Short title for the expansion key: displayTitle prefixes every one of
      // them with "Expansion Key - ", which the card's own EXP label says.
      const expKey = s.ex != null ? getKey(s.ex) : undefined;
      const [portrait, weaponImage] = await Promise.all([
        loadPortrait(doll?.avatarUrl),
        loadArt(weapon?.imageUrl),
      ]);
      return {
        dollName: doll?.name ?? s.d,
        weaponName: weapon?.name ?? null,
        weaponImage,
        dollPhase: doll?.phase ?? null,
        refinement: s.cal ?? null,
        attachmentSet: s.as ?? null,
        vert: s.t ?? [],
        fixedKeys,
        expansionKey: expKey
          ? (expKey.keyTitle ?? keyDisplayName(expKey))
          : null,
        commonKeys,
        statPrefs: s.st ?? [],
        portrait,
      };
    })
  );
  return renderTeamCardPng(slots);
}

async function renderWeapon(slug: string): Promise<Buffer> {
  const weapon = getWeaponBySlug(slug); // validated before render
  const weaponImage = await loadArt(weapon?.imageUrl);
  const imprintDoll = weapon?.imprintDollId
    ? getDollById(weapon.imprintDollId)
    : undefined;
  const counterparts: string[] = [];
  if (weapon?.eliteCounterpart?.name) {
    counterparts.push(`Elite: ${weapon.eliteCounterpart.name}`);
  }
  if (weapon?.standardCounterpart?.name) {
    counterparts.push(`Standard: ${weapon.standardCounterpart.name}`);
  }
  if (weapon?.retiredCounterpart?.name) {
    counterparts.push(`Retired: ${weapon.retiredCounterpart.name}`);
  }
  return renderWeaponCardPng({
    name: weapon?.name ?? null,
    rarity: weapon?.rarity ?? null,
    weaponType: weapon?.weaponType ?? null,
    primaryAttribute: weapon?.primaryAttribute ?? null,
    primaryAttributeStat: weapon?.primaryAttributeStat ?? null,
    secondaryAttribute: weapon?.secondaryAttribute ?? null,
    secondaryAttributeStat: weapon?.secondaryAttributeStat ?? null,
    trait: resolveMarkerText(weapon?.trait ?? ''),
    effect: resolveMarkerText(weapon?.effect ?? ''),
    imprintDollName: imprintDoll?.name ?? null,
    imprintDescription: resolveMarkerText(weapon?.imprintDescription ?? ''),
    counterparts,
    regionTag: weapon?.regionTag ?? null,
    weaponImage,
  });
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
  for (const routeKind of ['build', 'team', 'rec'] as const) {
    app.get(`/api/v1/img/${routeKind}.png`, async (c) => {
      const b = c.req.query('b');
      const id = c.req.query('id');
      if (b !== undefined && id !== undefined) {
        return c.json({ error: 'invalid build code' }, 400);
      }
      let payload: {
        kind: RenderKind;
        build: DollBuild | TeamBuild | RecBuild;
      };
      try {
        payload = await resolvePayload(routeKind, b, id);
        if (payload.kind === 'build') {
          validateBuild(payload.build as DollBuild);
        } else if (payload.kind === 'rec') {
          validateRec(payload.build as RecBuild);
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

  app.get('/api/v1/img/weapon.png', async (c) => {
    const slug = c.req.query('slug') ?? '';
    if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
      return c.json({ error: 'invalid slug' }, 400);
    }
    const weapon = getWeaponBySlug(slug);
    if (!weapon) {
      return c.json({ error: 'not_found' }, 404);
    }
    const payload = { slug };
    const filename = renderCacheFilename('weapon', payload);
    if (!existsSync(path.join(CACHE_DIR, filename))) {
      const png = await renderSingleFlight(filename, () => renderWeapon(slug));
      if (!existsSync(path.join(CACHE_DIR, filename))) {
        await writeAtomic(filename, png);
      }
    }
    c.header('Cache-Control', 'no-cache');
    return c.redirect(`/api/v1/img/cache/${filename}`, 302);
  });

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

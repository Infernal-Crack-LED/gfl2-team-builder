#!/usr/bin/env node
/**
 * Migrate saved builds/teams (user_profiles rows of every kind EXCEPT
 * 'gfl2-share') from v2 codes with Dandegate UUIDs to v3 codes with the
 * datamine's UUIDv5 ids.
 *
 *   npm run migrate:profiles                                  # dry run
 *   npm run migrate:profiles -- --execute
 *   npm run migrate:profiles -- --old data --new ../out-app   # (defaults)
 *
 * IMPORTANT: `--old` must point at the DANDEGATE-ERA artifacts. Run this
 * BEFORE `seed:datamine --execute --export` overwrites data/*.json, or pass
 * a snapshot directory (e.g. `git show` the pre-cutover data/ into a temp
 * dir).
 *
 * Mapping is structural, never by-name-fuzzy:
 *   - doll slugs are stable across the cutover (same slugify of same names)
 *   - weapons: old id -> old slug -> new weapon with that slug
 *   - fixed keys: old id -> (old doll slug, slot N from "Fixed Key N - …")
 *     -> new doll's fixed key with level == N
 *   - common/expansion keys: title match (prefix-stripped) within the type,
 *     preferring the same doll's keys
 *   - synthetic generic key ids (00000000-0000-4000-8000-…) pass through
 *   - attachment set NAMES pass through
 * Anything unmappable is dropped from the build and REPORTED — the saved
 * build loads minus that item instead of not at all.
 *
 * Share links ('gfl2-share') are deliberately NOT migrated — they are
 * deleted by purge-dandegate.ts and users mint new ones.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userProfiles } from '../db/schema.js';
import {
  BUILD_VERSION,
  b64urlDecode,
  b64urlEncode,
  decodeDollBuild,
  decodeTeamBuild,
} from '../share/buildCode.js';

interface OldDoll {
  id: string;
  slug: string;
}
interface OldWeapon {
  id: string;
  name: string;
  slug: string;
  weaponType: string | null;
  rarity: string | null;
  primaryAttributeStat: number | null;
}
interface OldKey {
  id: string;
  displayTitle: string | null;
  keyType: string | null;
  dollId: string | null;
}
interface NewDoll {
  id: string;
  slug: string;
}
interface NewWeapon {
  id: string;
  name: string;
  slug: string;
  weaponType: string | null;
  rarity: string | null;
  primaryAttributeStat: number | null;
}
interface NewKey {
  id: string;
  displayTitle: string | null;
  keyType: string | null;
  level: number | null;
  dollId: string | null;
}

function loadJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as T;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const stripPrefix = (t: string) =>
  t.replace(/^(Fixed|Common|Expansion) Key\s*\d*\s*[-–]?\s*/i, '');

const GENERIC_ID_PREFIX = '00000000-0000-4000-8000-';

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1]
    ? (process.argv[i + 1] as string)
    : fallback;
}

function buildIdMap(oldDir: string, newDir: string) {
  const oldDolls = loadJson<{ dolls: OldDoll[] }>(oldDir, 'dolls.json').dolls;
  const oldWeapons = loadJson<{ weapons: OldWeapon[] }>(
    oldDir,
    'weapons.json'
  ).weapons;
  const oldKeys = loadJson<{ keys: OldKey[] }>(oldDir, 'keys.json').keys;
  const newDolls = loadJson<{ dolls: NewDoll[] }>(newDir, 'dolls.json').dolls;
  const newWeapons = loadJson<{ weapons: NewWeapon[] }>(
    newDir,
    'weapons.json'
  ).weapons;
  const newKeys = loadJson<{ keys: NewKey[] }>(newDir, 'keys.json').keys;

  // Weapons: slug first; the reference kept fan/pre-release names for ~40
  // weapons, so fall back to the structural triple (type, rarity, stat@60) —
  // the same reconciliation src/sheet/ids.ts used, applied only when the
  // triple is UNIQUE on both sides.
  const weaponMap = new Map<string, string>(); // old uuid -> new uuid
  const newWeaponBySlug = new Map(newWeapons.map((w) => [w.slug, w]));
  const triple = (w: OldWeapon | NewWeapon) =>
    `${w.weaponType}|${w.rarity}|${w.primaryAttributeStat}`;
  const newByTriple = new Map<string, NewWeapon[]>();
  for (const w of newWeapons) {
    const arr = newByTriple.get(triple(w)) ?? [];
    arr.push(w);
    newByTriple.set(triple(w), arr);
  }
  const oldTripleCounts = new Map<string, number>();
  for (const w of oldWeapons) {
    oldTripleCounts.set(triple(w), (oldTripleCounts.get(triple(w)) ?? 0) + 1);
  }
  // The datamine's verified rename table (normalized fan name -> game name),
  // for the ~15 weapons the old dataset kept under pre-release names.
  let aliases: Record<string, string> = {};
  try {
    aliases = loadJson<Record<string, string>>(newDir, 'weapon-aliases.json');
  } catch {
    // older out-app without the file: slug + triple matching still apply
  }
  const newByNormName = new Map(newWeapons.map((w) => [norm(w.name), w]));
  for (const w of oldWeapons) {
    const bySlug = newWeaponBySlug.get(w.slug);
    if (bySlug) {
      weaponMap.set(w.id, bySlug.id);
      continue;
    }
    const aliased = aliases[norm(w.name)];
    const byAlias = aliased ? newByNormName.get(aliased) : undefined;
    if (byAlias) {
      weaponMap.set(w.id, byAlias.id);
      continue;
    }
    const cands = newByTriple.get(triple(w)) ?? [];
    if (cands.length === 1 && oldTripleCounts.get(triple(w)) === 1) {
      weaponMap.set(w.id, (cands[0] as NewWeapon).id);
    }
  }

  const oldDollSlugById = new Map(oldDolls.map((d) => [d.id, d.slug]));
  const newDollIdBySlug = new Map(newDolls.map((d) => [d.slug, d.id]));
  const newKeysByDoll = new Map<string, NewKey[]>();
  for (const k of newKeys) {
    if (k.dollId) {
      const arr = newKeysByDoll.get(k.dollId) ?? [];
      arr.push(k);
      newKeysByDoll.set(k.dollId, arr);
    }
  }
  const newKeyByTypeTitle = new Map<string, NewKey>();
  for (const k of newKeys) {
    if (k.displayTitle) {
      newKeyByTypeTitle.set(
        `${k.keyType}|${norm(stripPrefix(k.displayTitle))}`,
        k
      );
    }
  }

  const keyMap = new Map<string, string>(); // old uuid -> new uuid
  for (const k of oldKeys) {
    const dollSlug = k.dollId ? oldDollSlugById.get(k.dollId) : undefined;
    const newDollId = dollSlug ? newDollIdBySlug.get(dollSlug) : undefined;
    const dollKeys = newDollId ? (newKeysByDoll.get(newDollId) ?? []) : [];
    let hit: NewKey | undefined;
    const slotMatch = /^Fixed Key\s+(\d)\b/i.exec(k.displayTitle ?? '');
    if (k.keyType === 'Fixed Key' && slotMatch) {
      hit = dollKeys.find(
        (nk) => nk.keyType === 'Fixed Key' && nk.level === Number(slotMatch[1])
      );
    }
    if (!hit && k.displayTitle) {
      const title = norm(stripPrefix(k.displayTitle));
      hit =
        dollKeys.find(
          (nk) =>
            nk.keyType === k.keyType &&
            norm(stripPrefix(nk.displayTitle ?? '')) === title
        ) ?? newKeyByTypeTitle.get(`${k.keyType}|${title}`);
    }
    if (!hit && k.keyType === 'Expansion Key' && dollKeys.length) {
      hit = dollKeys.find((nk) => nk.keyType === 'Expansion Key');
    }
    if (hit) {
      keyMap.set(k.id, hit.id);
    }
  }

  const dollSlugs = new Set(newDolls.map((d) => d.slug));
  return { weaponMap, keyMap, dollSlugs };
}

interface Stats {
  weapons: { ok: number; dropped: string[] };
  keys: { ok: number; dropped: string[] };
  dolls: { ok: number; missing: string[] };
}

function freshStats(): Stats {
  return {
    weapons: { ok: 0, dropped: [] },
    keys: { ok: 0, dropped: [] },
    dolls: { ok: 0, missing: [] },
  };
}

function mapWeapon(
  id: unknown,
  map: Map<string, string>,
  stats: Stats
): string | null {
  if (typeof id !== 'string' || !id) {
    return null;
  }
  const hit = map.get(id);
  if (hit) {
    stats.weapons.ok++;
    return hit;
  }
  stats.weapons.dropped.push(id);
  return null;
}

function mapKeys(
  ids: unknown,
  map: Map<string, string>,
  stats: Stats
): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string') {
      continue;
    }
    if (id.startsWith(GENERIC_ID_PREFIX)) {
      out.push(id); // synthetic generic key, app-defined, stable
      continue;
    }
    const hit = map.get(id);
    if (hit) {
      stats.keys.ok++;
      out.push(hit);
    } else {
      stats.keys.dropped.push(id);
    }
  }
  return out;
}

function mapKey(
  id: unknown,
  map: Map<string, string>,
  stats: Stats
): string | null {
  const arr = mapKeys(id == null ? [] : [id], map, stats);
  return arr[0] ?? null;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const oldDir = path.resolve(argValue('--old', 'data'));
  const newDir = path.resolve(argValue('--new', '../out-app'));
  const { weaponMap, keyMap, dollSlugs } = buildIdMap(oldDir, newDir);
  console.log(
    `id maps: ${weaponMap.size} weapons, ${keyMap.size} keys (old ${oldDir} -> new ${newDir})` +
      `${execute ? '' : '   (DRY RUN — nothing will be written)'}`
  );

  const rows = await db
    .select()
    .from(userProfiles)
    .where(ne(userProfiles.kind, 'gfl2-share'));

  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(b64urlDecode(row.code)) as Record<string, unknown>;
    } catch {
      console.log(
        `  ${row.id} (${row.kind} "${row.name}"): unreadable code — skipped`
      );
      skipped++;
      continue;
    }
    if (payload.v === BUILD_VERSION) {
      skipped++;
      continue; // already migrated
    }
    if (payload.v !== 2) {
      console.log(
        `  ${row.id} (${row.kind} "${row.name}"): unknown version ${payload.v} — skipped`
      );
      skipped++;
      continue;
    }

    const stats = freshStats();
    let next: Record<string, unknown>;

    if (typeof payload.doll === 'string') {
      // DollBuild
      if (!dollSlugs.has(payload.doll)) {
        stats.dolls.missing.push(payload.doll);
      }
      next = {
        ...payload,
        v: BUILD_VERSION,
        weapon: mapWeapon(payload.weapon, weaponMap, stats),
        keys: mapKeys(payload.keys, keyMap, stats),
        ck: mapKeys(payload.ck, keyMap, stats),
        exp: mapKey(payload.exp, keyMap, stats),
      };
    } else if (Array.isArray(payload.s)) {
      // TeamBuild
      const slots = payload.s.map((raw) => {
        if (!raw || typeof raw !== 'object') {
          return null;
        }
        const s = raw as Record<string, unknown>;
        if (typeof s.d === 'string' && !dollSlugs.has(s.d)) {
          stats.dolls.missing.push(s.d);
        }
        return {
          ...s,
          w: mapWeapon(s.w, weaponMap, stats),
          k: mapKeys(s.k, keyMap, stats),
          ck: mapKeys(s.ck, keyMap, stats),
          ex: mapKey(s.ex, keyMap, stats),
        };
      });
      next = { ...payload, v: BUILD_VERSION, s: slots };
    } else {
      console.log(
        `  ${row.id} (${row.kind} "${row.name}"): unrecognized payload — skipped`
      );
      skipped++;
      continue;
    }

    const code = b64urlEncode(JSON.stringify(next));
    // round-trip through the real decoders as a sanity gate
    const valid =
      typeof next.doll === 'string'
        ? decodeDollBuild(code)
        : decodeTeamBuild(code);
    const problems = [
      ...stats.weapons.dropped.map((x) => `weapon ${x}`),
      ...stats.keys.dropped.map((x) => `key ${x}`),
      ...stats.dolls.missing.map((x) => `doll ${x}`),
    ];
    console.log(
      `  ${row.id} (${row.kind} "${row.name}"): ` +
        `${stats.weapons.ok} weapons + ${stats.keys.ok} keys mapped` +
        (problems.length ? `; DROPPED: ${problems.join(', ')}` : '') +
        (valid ? '' : '  !! v3 decode failed — will NOT write')
    );
    if (!valid) {
      skipped++;
      continue;
    }
    if (execute) {
      await db
        .update(userProfiles)
        .set({ code, updatedAt: new Date() })
        .where(eq(userProfiles.id, row.id));
    }
    migrated++;
  }

  console.log(
    `\n${execute ? 'Migrated' : 'Would migrate'} ${migrated} rows; skipped ${skipped}.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

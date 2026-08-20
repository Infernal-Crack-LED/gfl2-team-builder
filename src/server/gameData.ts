/**
 * Server-side access to the committed game-data artifacts (data/*.json).
 * Loaded ONCE at server boot (module init) — they are build inputs, not
 * runtime state, exactly as the web bundle treats them. The server never
 * talks to the game-data DB tables at request time.
 *
 * Only the fields the image API / OG injection need are typed; everything
 * else passes through as unknown.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripHtml } from '../share/html.js';
import { FACET_GROUPS, facetsFor, type Facet } from '../share/facets.js';
import {
  indexNamedRows,
  markersToText,
  type MarkerKind,
} from '../share/markers.js';

/** One kit slot on a doll (Basic Attack, Passive, Skill 1–3). */
export interface DollSkillEntry {
  name: string | null;
  skillType: string | null;
  description: string | null;
  skillTags: string[] | null;
}

export interface DollEntry {
  id: string;
  name: string;
  slug: string;
  class: string | null;
  phase: string | null;
  rarity: string | null;
  avatarUrl: string | null;
  // Fields below are read by the no-JS page bodies (noJsBody.ts) — the same
  // rows the React pages render, so a crawler and a visitor read one dataset.
  ammoTypes: string[] | null;
  weaponImprintType: string | null;
  movement: number | null;
  stabilityGauge: number | null;
  regionTag: string | null;
  preview: boolean | null;
  bio: string | null;
  skills: DollSkillEntry[] | null;
  /** The signature weapon this doll imprints — named on her builder page. */
  weaponImprint?: {
    id: string;
    name: string | null;
    trait: string | null;
    effect: string | null;
  } | null;
}

export interface WeaponEntry {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  rarity: string | null;
  weaponType: string | null;
  primaryAttribute: string | null;
  primaryAttributeStat: number | string | null;
  secondaryAttribute: string | null;
  secondaryAttributeStat: number | string | null;
  trait: string | null;
  effect: string | null;
  imprintDollId: string | null;
  imprintDescription: string | null;
  eliteCounterpart: { name: string } | null;
  standardCounterpart: { name: string } | null;
  retiredCounterpart: { name: string } | null;
  regionTag: string | null;
  preview: boolean | null;
}

/** Effect dictionary row — resolves `[effect:<uuid>]` markers to a name. */
export interface EffectEntry {
  id: string;
  effectName: string | null;
}

/** Attachment set bonus — keyed by NAME (see db/schema.ts attachmentSets). */
export interface AttachmentSetEntry {
  name: string;
  piecesRequired: number;
  description: string;
}

/** One stat line on a key ("Attack Boost", "2%"). */
export interface KeyAttribute {
  name: string | null;
  value: string | number | null;
}

export interface KeyEntry {
  id: string;
  keyTitle: string | null;
  displayTitle: string | null;
  dollId: string | null;
  /** Fixed keys: the slot number (1–6). */
  level?: number | null;
  // Fields below are read by the no-JS /keys body (noJsBody.ts).
  keyType?: string | null;
  attributes?: KeyAttribute[] | null;
  effect?: string | null;
}

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.resolve('data', file), 'utf8')) as T;
}

const dollsFile = loadJson<{ dolls: DollEntry[]; syncedAt?: string }>(
  'dolls.json'
);
const weaponsFile = loadJson<{ weapons: WeaponEntry[]; syncedAt?: string }>(
  'weapons.json'
);
const keysFile = loadJson<{ keys: KeyEntry[]; syncedAt?: string }>('keys.json');
const effectsFile = loadJson<{ effects: EffectEntry[] }>('effects.json');
const setsFile = loadJson<{ attachmentSets: AttachmentSetEntry[] }>(
  'attachment-sets.json'
);

const dollBySlug = new Map(dollsFile.dolls.map((d) => [d.slug, d]));
const dollById = new Map(dollsFile.dolls.map((d) => [d.id, d]));
const weaponById = new Map(weaponsFile.weapons.map((w) => [w.id, w]));
const weaponBySlug = new Map(weaponsFile.weapons.map((w) => [w.slug, w]));
const effectNameById = new Map(
  effectsFile.effects.map((e) => [e.id, e.effectName])
);
// Synthetic generic keys retired — the datamine ships the real pool.
const keyById = new Map<string, KeyEntry>(
  keysFile.keys.map((k) => [k.id, k] as const)
);

const setByName = new Map(setsFile.attachmentSets.map((s) => [s.name, s]));

export function getDoll(slug: string): DollEntry | undefined {
  return dollBySlug.get(slug);
}

/** By id, not slug — keys reference their source doll by id. */
export function getDollById(id: string | null): DollEntry | undefined {
  return id === null ? undefined : dollById.get(id);
}

export function getWeapon(id: string): WeaponEntry | undefined {
  return weaponById.get(id);
}

export function getWeaponBySlug(slug: string): WeaponEntry | undefined {
  return weaponBySlug.get(slug);
}

/** Every doll/weapon row — the crawl surfaces (sitemap, no-JS index bodies). */
export function allDolls(): readonly DollEntry[] {
  return dollsFile.dolls;
}

export function allWeapons(): readonly WeaponEntry[] {
  return weaponsFile.weapons;
}

export function allKeys(): readonly KeyEntry[] {
  return keysFile.keys;
}

/**
 * The date the committed game data was last synced, as `YYYY-MM-DD` — the
 * `<lastmod>` the sitemap reports for every data-derived page.
 *
 * Derived from the artifacts themselves, never from the clock: the sitemap has
 * a drift test that compares the committed file byte-for-byte against a fresh
 * render, and a `new Date()` here would make that test fail every midnight.
 * Google ignores lastmod site-wide once it catches a site reporting one it
 * doesn't believe, so this reports only what actually changed the data.
 */
export function dataSyncedAt(): string | null {
  const stamps = [
    dollsFile.syncedAt,
    weaponsFile.syncedAt,
    keysFile.syncedAt,
  ].filter((s): s is string => typeof s === 'string' && s !== '');
  if (stamps.length === 0) {
    return null;
  }
  const latest = stamps.sort().at(-1) ?? '';
  const date = latest.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

// --- Facets -----------------------------------------------------------------

/**
 * Every facet page the site serves, built from the committed rows so the
 * taxonomy can never name a category the data no longer has. Computed once at
 * boot: the row sets are build inputs, not runtime state.
 */
const ALL_FACETS: Facet[] = FACET_GROUPS.flatMap((group) =>
  facetsFor(
    group,
    (group.entity === 'doll'
      ? dollsFile.dolls
      : weaponsFile.weapons) as unknown as Record<string, unknown>[]
  )
);

const facetByPath = new Map(ALL_FACETS.map((f) => [f.path, f]));

export function allFacets(): readonly Facet[] {
  return ALL_FACETS;
}

/** The facet for a `/characters/class/sentinel`-shaped path, if it is one. */
export function getFacet(path: string): Facet | undefined {
  return facetByPath.get(path);
}

/** Facets of one group, for the links a catalogue page lists. */
export function facetsInGroup(key: string): Facet[] {
  return ALL_FACETS.filter((f) => f.group.key === key);
}

/** The rows a facet page lists, in name order. */
export function facetMembers(facet: Facet): (DollEntry | WeaponEntry)[] {
  const rows =
    facet.group.entity === 'doll'
      ? (dollsFile.dolls as (DollEntry | WeaponEntry)[])
      : (weaponsFile.weapons as (DollEntry | WeaponEntry)[]);
  return rows
    .filter(
      (r) =>
        (r as unknown as Record<string, unknown>)[facet.group.field] ===
        facet.value
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every fixed key that belongs to one doll, in slot order. */
export function fixedKeysForDoll(dollId: string): KeyEntry[] {
  return keysFile.keys
    .filter((k) => k.dollId === dollId && k.keyType === 'Fixed Key')
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
}

// --- `[<kind>:<id>]` marker resolution ------------------------------------
// The index mirrors web/src/data.ts one source at a time — doll skills, doll
// summons, those summons' skills, and the upgraded copies vertebrae carry (they
// have their own ids, and text refers to them by those ids). Both sides read
// the same data/*.json and the same grammar from share/markers.ts, so the
// no-JS body a crawler gets says what the hydrated page says.

const summonNameById = new Map<string, string>();
const skillNameById = new Map<string, string>();
const summonSkillNameById = new Map<string, string>();

for (const doll of dollsFile.dolls as unknown as Record<string, unknown>[]) {
  indexNamedRows(skillNameById, doll.skills);
  for (const summon of indexNamedRows(summonNameById, doll.summons)) {
    indexNamedRows(summonSkillNameById, summon.skills);
  }
  const vertebrae = Array.isArray(doll.vertebrae)
    ? (doll.vertebrae as Record<string, unknown>[])
    : [];
  for (const vert of vertebrae) {
    indexNamedRows(skillNameById, vert.skillsLevel2);
    indexNamedRows(skillNameById, vert.skillsLevel3);
    for (const summon of [
      ...indexNamedRows(summonNameById, vert.summonsLevel2),
      ...indexNamedRows(summonNameById, vert.summonsLevel3),
    ]) {
      indexNamedRows(summonSkillNameById, summon.skills);
    }
  }
}

/** Display name for a marker id, or null when the id is unknown. */
function markerName(kind: MarkerKind, id: string): string | null {
  switch (kind) {
    case 'effect':
      return effectNameById.get(id) ?? null;
    case 'summon':
      return summonNameById.get(id) ?? null;
    case 'dollSkill':
      return skillNameById.get(id) ?? null;
    case 'skillsummon':
      return summonSkillNameById.get(id) ?? null;
    case 'key': {
      // NOT keyDisplayName(): that falls back to the raw id, which would put a
      // bare uuid in the no-JS body where the client shows "unlisted key".
      // Returning null lets share/markers.ts name the miss on both sides.
      const key = keyById.get(id);
      return key?.displayTitle ?? key?.keyTitle ?? null;
    }
  }
}

/**
 * Resolve every marker kind in game text to its name, inline. An id that isn't
 * in the dataset degrades to the shared fallback ("unlisted effect", or the
 * humanized slug) — never to a raw marker, and never to nothing: dropping it
 * would leave the crawler a sentence with a hole where the visitor reads a name.
 */
export function resolveMarkerText(text: string): string {
  // Strip first: game text now carries colour spans (rendered by the web's
  // RichText); plain-text surfaces — canvas cards, crawler bodies — must
  // never show literal tags.
  return markersToText(stripHtml(text) ?? '', markerName);
}

export function getKey(id: string): KeyEntry | undefined {
  return keyById.get(id);
}

/** By NAME — attachment sets have no ids, upstream or here. */
export function getAttachmentSet(name: string): AttachmentSetEntry | undefined {
  return setByName.get(name);
}

/** Display name for a key row — displayTitle carries the full label. */
export function keyDisplayName(k: KeyEntry): string {
  return k.displayTitle ?? k.keyTitle ?? k.id;
}

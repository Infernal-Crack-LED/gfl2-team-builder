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
import { GENERIC_COMMON_KEYS } from '../share/genericKeys.js';

export interface DollEntry {
  id: string;
  name: string;
  slug: string;
  class: string | null;
  phase: string | null;
  rarity: string | null;
  avatarUrl: string | null;
}

export interface WeaponEntry {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
}

/** Attachment set bonus — keyed by NAME (see db/schema.ts attachmentSets). */
export interface AttachmentSetEntry {
  name: string;
  piecesRequired: number;
  description: string;
}

export interface KeyEntry {
  id: string;
  keyTitle: string | null;
  displayTitle: string | null;
  dollId: string | null;
}

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.resolve('data', file), 'utf8')) as T;
}

const dollsFile = loadJson<{ dolls: DollEntry[] }>('dolls.json');
const weaponsFile = loadJson<{ weapons: WeaponEntry[] }>('weapons.json');
const keysFile = loadJson<{ keys: KeyEntry[] }>('keys.json');
const setsFile = loadJson<{ attachmentSets: AttachmentSetEntry[] }>(
  'attachment-sets.json'
);

const dollBySlug = new Map(dollsFile.dolls.map((d) => [d.slug, d]));
const dollById = new Map(dollsFile.dolls.map((d) => [d.id, d]));
const weaponById = new Map(weaponsFile.weapons.map((w) => [w.id, w]));
// Generic common keys live in code (Dandegate doesn't carry them) — merged so
// share codes referencing them validate and resolve on the image API.
const keyById = new Map<string, KeyEntry>([
  ...keysFile.keys.map((k) => [k.id, k] as const),
  ...GENERIC_COMMON_KEYS.map((k) => [k.id, k] as const),
]);

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

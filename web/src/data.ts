/**
 * Typed data layer — imports the committed JSON artifacts produced by
 * `npm run sync` and exports typed arrays, slug/id lookups, and the
 * [effect:<uuid>] marker resolver. The web app NEVER fetches game data
 * at runtime; everything flows through this module.
 *
 * JSON import uses a two-step cast (`as unknown as T`) because Vite's
 * JSON import types are loose. This is the one sanctioned `as any` site.
 */

import dollsJson from '../../data/dolls.json';
import weaponsJson from '../../data/weapons.json';
import keysJson from '../../data/keys.json';
import effectsJson from '../../data/effects.json';

// --- Type definitions ---

export interface Skill {
  name: string | null;
  skillType: string | null;
  description: string | null;
  descriptionLevel2: string | null;
  descriptionLevel3: string | null;
  descriptionLevel4: string | null;
  ammoTypes: string[] | null;
  ammoTypesLevel2: string[] | null;
  ammoTypesLevel3: string[] | null;
  ammoTypesLevel4: string[] | null;
  skillTags: string[] | null;
  skillTagsLevel2: string[] | null;
  skillTagsLevel3: string[] | null;
  skillTagsLevel4: string[] | null;
  stabilityDamage: number | string | null;
  cooldown: number | string | null;
  rangeValue: number | string | null;
  effectiveArea: string | null;
  [key: string]: unknown;
}

export interface KeyAttribute {
  name: string;
  value: string;
}

export interface Doll {
  id: string;
  slug: string;
  name: string;
  class: string | null;
  phase: string | null;
  rarity: string | null;
  ammoTypes: string[] | null;
  weaponImprintType: string | null;
  weaponImprint: Record<string, unknown> | null;
  avatarUrl: string | null;
  dollImages: Record<string, unknown>[];
  searchTags: string[];
  gunDataId: number | null;
  regionTag: string | null;
  preview: boolean | null;
  skills: Skill[];
  vertebrae: Record<string, unknown>[];
  remoldingPattern: Record<string, unknown> | null;
  movement: number | null;
  stabilityGauge: number | null;
  summons: Record<string, unknown>[];
  bio: string | null;
}

export interface Weapon {
  id: string;
  slug: string;
  name: string;
  rarity: string | null;
  weaponType: string | null;
  primaryAttribute: string | null;
  primaryAttributeStat: number | null;
  secondaryAttribute: string | null;
  secondaryAttributeStat: string | null;
  trait: string | null;
  effect: string | null;
  imprintDollId: string | null;
  imprintDescription: string | null;
  imageUrl: string | null;
  eliteCounterpart: Record<string, unknown> | null;
  standardCounterpart: Record<string, unknown> | null;
  retiredCounterpart: Record<string, unknown> | null;
  gunWeaponDataId: number | null;
  regionTag: string | null;
  preview: boolean | null;
}

export interface Key {
  id: string;
  keyTitle: string | null;
  displayTitle: string | null;
  keyType: string | null;
  level: number | null;
  attributes: KeyAttribute[] | null;
  effect: string | null;
  materials: Record<string, unknown> | null;
  dollId: string | null;
  imageUrl: string | null;
  regionTag: string | null;
  searchTags: string[];
}

export interface Effect {
  id: string;
  effectName: string | null;
  effectDetails: string | null;
  effectTags: string[];
  dollId: string | null;
  regionTag: string | null;
  preview: boolean | null;
}

// File-level wrapper shapes (the JSON files carry a syncedAt timestamp)
interface DollsFile {
  syncedAt: string;
  dolls: Doll[];
}
interface WeaponsFile {
  syncedAt: string;
  weapons: Weapon[];
}
interface KeysFile {
  syncedAt: string;
  keys: Key[];
}
interface EffectsFile {
  syncedAt: string;
  effects: Effect[];
}

// --- Loaded data ---

const dollsData = dollsJson as unknown as DollsFile;
const weaponsData = weaponsJson as unknown as WeaponsFile;
const keysData = keysJson as unknown as KeysFile;
const effectsData = effectsJson as unknown as EffectsFile;

export const allDolls: Doll[] = dollsData.dolls;
export const allWeapons: Weapon[] = weaponsData.weapons;
export const allKeys: Key[] = keysData.keys;
export const allEffects: Effect[] = effectsData.effects;

// --- Lookups ---

/** id → Doll */
const dollById = new Map<string, Doll>();
/** slug → Doll */
const dollBySlug = new Map<string, Doll>();
for (const d of allDolls) {
  dollById.set(d.id, d);
  dollBySlug.set(d.slug, d);
}

/** id → Weapon */
const weaponById = new Map<string, Weapon>();
/** slug → Weapon */
const weaponBySlug = new Map<string, Weapon>();
for (const w of allWeapons) {
  weaponById.set(w.id, w);
  weaponBySlug.set(w.slug, w);
}

/** id → Effect */
const effectById = new Map<string, Effect>();
for (const e of allEffects) {
  effectById.set(e.id, e);
}

export function getDollBySlug(slug: string): Doll | undefined {
  return dollBySlug.get(slug);
}

export function getDollById(id: string): Doll | undefined {
  return dollById.get(id);
}

export function getWeaponBySlug(slug: string): Weapon | undefined {
  return weaponBySlug.get(slug);
}

export function getWeaponById(id: string): Weapon | undefined {
  return weaponById.get(id);
}

/** All keys belonging to a given doll (by dollId). */
export function getKeysForDoll(dollId: string): Key[] {
  return allKeys.filter((k) => k.dollId === dollId);
}

/** All effects exclusively linked to a given doll (by dollId). */
export function getEffectsForDoll(dollId: string): Effect[] {
  return allEffects.filter((e) => e.dollId === dollId);
}

/** The weapon that imprints on a given doll (by dollId). */
export function getWeaponForDoll(dollId: string): Weapon | undefined {
  return allWeapons.find((w) => w.imprintDollId === dollId);
}

// --- Effect marker resolver ---

/**
 * Resolve `[effect:<uuid>]` markers in skill/weapon text into effect names.
 * Returns an array of text segments — plain strings and `{ id, name }` links —
 * so the renderer can wrap effect references in `<span title>` or `<a>` tags.
 *
 * The marker format is `[effect:UUID]` where UUID is the dandegate effect id.
 * Markers that don't resolve (unknown UUID) are kept as-is so nothing vanishes.
 */
export type TextSegment =
  | string
  | { id: string; name: string };

export function resolveEffectMarkers(text: string | null): TextSegment[] {
  if (!text) {
    return [];
  }
  const parts: TextSegment[] = [];
  const re = /\[effect:([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const rawId = match[1]!;
    // Doll-variant markers use `[effect:UUID|doll:slug]` — only the UUID
    // part keys into the effects table.
    const id = rawId.split('|')[0]!;
    const effect = effectById.get(id);
    if (effect?.effectName) {
      parts.push({ id, name: effect.effectName });
    } else {
      // Unknown effect — keep the raw marker so it's visible, not silently dropped
      parts.push(match[0]);
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// --- Filter option constants ---

export const CLASS_OPTIONS = [
  { id: 'bulwark', label: 'Bulwark' },
  { id: 'vanguard', label: 'Vanguard' },
  { id: 'support', label: 'Support' },
  { id: 'sentinel', label: 'Sentinel' },
] as const;

export const PHASE_OPTIONS = [
  { id: 'physical', label: 'Physical' },
  { id: 'burn', label: 'Burn' },
  { id: 'hydro', label: 'Hydro' },
  { id: 'electric', label: 'Electric' },
  { id: 'freeze', label: 'Freeze' },
  { id: 'corrosion', label: 'Corrosion' },
  { id: 'omni', label: 'Omni' },
] as const;

// Option ids MUST be the lowercased data values — the filters match by exact
// equality against `(doll.field ?? '').toLowerCase()`. Short codes here
// silently break the row (every selection filters to zero results).
export const AMMO_OPTIONS = [
  { id: 'light ammo', label: 'Light' },
  { id: 'medium ammo', label: 'Medium' },
  { id: 'heavy ammo', label: 'Heavy' },
  { id: 'shotgun ammo', label: 'Shotgun' },
  { id: 'melee', label: 'Melee' },
] as const;

export const WEAPON_TYPE_OPTIONS = [
  { id: 'assault rifle', label: 'AR' },
  { id: 'submachine gun', label: 'SMG' },
  { id: 'shotgun', label: 'SG' },
  { id: 'machine gun', label: 'MG' },
  { id: 'sniper rifle', label: 'RF' },
  { id: 'handgun', label: 'HG' },
  { id: 'blade', label: 'Blade' },
] as const;

export const RARITY_OPTIONS = [
  { id: 'elite', label: 'Elite' },
  { id: 'standard', label: 'Standard' },
] as const;

/** Game-phase accent colors for card tinting / badges. */
export const PHASE_COLORS: Record<string, string> = {
  Physical: '#b0b7c3',
  Burn: '#d92d38',
  Hydro: '#0075f8',
  Electric: '#bc1eb1',
  Freeze: '#00c8e0',
  Corrosion: '#00e554',
  Omni: '#e0b04b',
};

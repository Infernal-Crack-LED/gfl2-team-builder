/**
 * Typed data layer — imports the committed JSON artifacts produced by
 * `npm run sync` and exports typed arrays, slug/id lookups, readers for the
 * blobs the sync pipeline stores verbatim, and the `[<kind>:<uuid>]` marker
 * resolver. The web app NEVER fetches game data at runtime; everything flows
 * through this module.
 *
 * JSON import uses a two-step cast (`as unknown as T`) because Vite's
 * JSON import types are loose. This is the one sanctioned `as any` site.
 */

import dollsJson from '../../data/dolls.json';
import weaponsJson from '../../data/weapons.json';
import keysJson from '../../data/keys.json';
import effectsJson from '../../data/effects.json';
import attachmentSetsJson from '../../data/attachment-sets.json';
import {
  parseEffectDetails,
  stripHtml,
  type EffectDetails,
} from '../../src/share/html';
export type { EffectDetails, EffectUpgrade } from '../../src/share/html';
import { GENERIC_COMMON_KEYS } from '../../src/share/genericKeys';
import {
  indexNamedRows,
  splitMarkers,
  type MarkerKind,
} from '../../src/share/markers';
/**
 * Rewrites Dandegate CDN URLs to our own mirror under /game-assets. Render
 * game art through <GameIcon> rather than calling this directly — it adds the
 * fallback for art synced since the last `npm run icons`.
 */
export { localAssetUrl as assetUrl } from '../../src/share/assets';

// --- Type definitions ---

export interface Skill {
  name: string | null;
  skillType: string | null;
  /**
   * Dandegate CDN skill icon. Not sourced from iopwiki: its GFL2 doll pages
   * render a shared `Skill backup.png` placeholder for all but a handful of
   * skills, whereas Dandegate carries art for every one.
   */
  imageUrl: string | null;
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

/**
 * One vertebra (fortification segment V1–V6). The sync pipeline passes
 * `doll.vertebrae` through raw — it arrives as an API row carrying a nested
 * copy of the doll, timestamps, and Tiptap HTML — so the shape below is what
 * `getVertebraeForDoll` distills out of it.
 */
export interface Vertebra {
  id: string;
  /**
   * Fortification segment, 1–6 (rendered as V1…V6). Also the vertebra's
   * identity in share codes, so rows without one are dropped entirely.
   */
  segment: number;
  /** Skill level this vertebra raises the named skill to. */
  level: number | null;
  /** e.g. "Frosted Echo Lv.2" */
  name: string | null;
  /** Plain text, `[<kind>:<uuid>]` markers intact. */
  effect: string | null;
  imageUrl: string | null;
}

/** One imago stage of a remolding pattern (Embryo → Blossom). */
export interface Imagoform {
  id: string;
  stage: string | null;
  /** Core level the stage unlocks at (1, 10, 20, 30, 45, 60). */
  coreLevel: number | null;
  /** Plain text, `[effect:<uuid>]` markers intact. */
  effect: string | null;
  /** Cumulative class factors required, in fixed display order. */
  factors: { label: string; value: number }[];
}

/** Doll level → flat stat bonus granted by the remolding pattern. */
export interface StatBoost {
  level: number;
  stats: { label: string; value: number }[];
}

export interface RemoldingPattern {
  dollCore: string | null;
  /** Core slots by class, in fixed display order; zero-count slots included. */
  coreSlots: { label: string; value: number }[];
  statBoosts: StatBoost[];
  imagoforms: Imagoform[];
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

/**
 * An attachment set bonus. Keyed by NAME — the wiki has no ids for these and
 * neither does our table (db/schema.ts), so share codes carry the name.
 */
export interface AttachmentSet {
  name: string;
  piecesRequired: number;
  description: string;
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
interface AttachmentSetsFile {
  syncedAt: string;
  attachmentSets: AttachmentSet[];
}

// --- Loaded data ---

const dollsData = dollsJson as unknown as DollsFile;
const weaponsData = weaponsJson as unknown as WeaponsFile;
const keysData = keysJson as unknown as KeysFile;
const effectsData = effectsJson as unknown as EffectsFile;
const attachmentSetsData = attachmentSetsJson as unknown as AttachmentSetsFile;

export const allDolls: Doll[] = dollsData.dolls;
export const allWeapons: Weapon[] = weaponsData.weapons;
// Generic common keys are maintained in code (Dandegate doesn't carry them),
// merged here so a re-sync never drops them from the builder's picker.
export const allKeys: Key[] = [...keysData.keys, ...GENERIC_COMMON_KEYS];
export const allEffects: Effect[] = effectsData.effects;
/** Attachment set bonuses, alphabetical — the builder's set dropdown. */
export const allAttachmentSets: AttachmentSet[] =
  attachmentSetsData.attachmentSets
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

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

/** id → Key */
const keyById = new Map<string, Key>();
for (const k of allKeys) {
  keyById.set(k.id, k);
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

export function getKeyById(id: string): Key | undefined {
  return keyById.get(id);
}

/** By NAME — attachment sets have no ids, upstream or here. */
export function getAttachmentSet(name: string): AttachmentSet | undefined {
  return allAttachmentSets.find((s) => s.name === name);
}

export function getEffectById(id: string): Effect | undefined {
  return effectById.get(id);
}

/** All keys belonging to a given doll (by dollId). */
export function getKeysForDoll(dollId: string): Key[] {
  return allKeys.filter((k) => k.dollId === dollId);
}

/** All common keys in the dataset (every doll can equip any of them). */
export function getAllCommonKeys(): Key[] {
  return allKeys.filter((k) => k.keyType === 'Common Key');
}

/**
 * The three key types the Keys page browses, in display order. Affinity keys
 * are deliberately absent: they are an affinity-level reward with a flat stat
 * line, not a build choice, so listing them would bury the keys that are.
 */
export const KEY_TYPE_OPTIONS = [
  { id: 'Fixed Key', label: 'Fixed' },
  { id: 'Expansion Key', label: 'Expansion' },
  { id: 'Common Key', label: 'Common' },
] as const;

export type BrowsableKeyType = (typeof KEY_TYPE_OPTIONS)[number]['id'];

const BROWSABLE_KEY_TYPES = new Set<string>(KEY_TYPE_OPTIONS.map((o) => o.id));

/** Every key the Keys page can show — i.e. everything except affinity keys. */
export const browsableKeys: Key[] = allKeys.filter(
  (k) => k.keyType != null && BROWSABLE_KEY_TYPES.has(k.keyType)
);

/** Distinct attribute names across the browsable keys, alphabetical. */
export const KEY_ATTRIBUTE_OPTIONS: { id: string; label: string }[] = [
  ...new Set(
    browsableKeys.flatMap((k) => (k.attributes ?? []).map((a) => a.name))
  ),
]
  .sort((a, b) => a.localeCompare(b))
  .map((name) => ({ id: name.toLowerCase(), label: name }));

/** All effects exclusively linked to a given doll (by dollId). */
export function getEffectsForDoll(dollId: string): Effect[] {
  return allEffects.filter((e) => e.dollId === dollId);
}

/**
 * An effect's description, split into its base text and V-level rewrites.
 * `effectDetails` is a JSON blob for roughly a quarter of effects, so this is
 * the only supported way to read it — see parseEffectDetails.
 */
export function getEffectDetails(effect: Effect): EffectDetails {
  return parseEffectDetails(effect.effectDetails);
}

// --- Raw-blob accessors ---
// `vertebrae` and `remoldingPattern` are the two fields the sync pipeline
// stores verbatim (nested doll copies, timestamps, Tiptap HTML and all).
// These readers pull out the fields worth showing and strip the HTML, so no
// page has to reach into `Record<string, unknown>` — or dump JSON at the user.

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Stat keys in display order; anything else in the blob is passed through. */
const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
};
const STAT_ORDER = Object.keys(STAT_LABELS);

/**
 * The doll's vertebrae, ordered by segment (V1 → V6). Effect HTML is stripped
 * to plain text; `[effect:<uuid>]` markers survive for the caller to resolve.
 */
export function getVertebraeForDoll(doll: Doll): Vertebra[] {
  return (doll.vertebrae ?? [])
    .map((raw) => {
      const segment = num(raw.segment);
      if (segment == null || !Number.isInteger(segment)) {
        return null;
      }
      return {
        id: str(raw.id) ?? `${doll.id}-v${segment}`,
        segment,
        level: num(raw.level),
        name: str(raw.vertebraeName),
        effect: stripHtml(str(raw.effect)),
        imageUrl: str(raw.imageUrl),
      };
    })
    .filter((v): v is Vertebra => v !== null)
    .sort((a, b) => a.segment - b.segment);
}

/**
 * The doll's remolding pattern — core, slot counts, level-60 stat boosts, and
 * the six imago stages ordered by core level. Returns null when the doll has
 * no pattern (or an empty one).
 */
export function getRemoldingPattern(doll: Doll): RemoldingPattern | null {
  const raw = doll.remoldingPattern;
  if (!raw) {
    return null;
  }

  const slots = (raw.coreSlots ?? {}) as Record<string, unknown>;
  const coreSlots = CLASS_OPTIONS.map((c) => ({
    label: c.label,
    value: num(slots[c.id]) ?? 0,
  }));

  const boosts = (raw.statBoosts ?? {}) as Record<string, unknown>;
  const statBoosts: StatBoost[] = Object.entries(boosts)
    .map(([level, stats]) => ({
      level: Number(level),
      stats: Object.entries((stats ?? {}) as Record<string, unknown>)
        .map(([key, value]) => ({
          label: STAT_LABELS[key] ?? key.toUpperCase(),
          value: num(value) ?? 0,
        }))
        .sort((a, b) => statRank(a.label) - statRank(b.label)),
    }))
    .filter((b) => Number.isFinite(b.level) && b.stats.length > 0)
    .sort((a, b) => a.level - b.level);

  const imagoforms: Imagoform[] = (
    (raw.imagoforms ?? []) as Record<string, unknown>[]
  )
    .map((form, i) => ({
      id: str(form.id) ?? `${doll.id}-imago-${i}`,
      stage: str(form.stage),
      coreLevel: num(form.coreLevel),
      effect: stripHtml(str(form.effect)),
      // Zero-cost classes are dropped — every pattern leaves at least one at 0
      // and listing them is noise.
      factors: CLASS_OPTIONS.map((c) => ({
        label: c.label,
        value: num(form[`${c.id}Factors`]) ?? 0,
      })).filter((f) => f.value > 0),
    }))
    .sort((a, b) => (a.coreLevel ?? 99) - (b.coreLevel ?? 99));

  if (
    !raw.dollCore &&
    statBoosts.length === 0 &&
    imagoforms.length === 0 &&
    coreSlots.every((s) => s.value === 0)
  ) {
    return null;
  }

  return { dollCore: str(raw.dollCore), coreSlots, statBoosts, imagoforms };
}

/** Sort index for a stat label; unknown stats sort after the known ones. */
function statRank(label: string): number {
  const i = STAT_ORDER.findIndex((k) => STAT_LABELS[k] === label);
  return i === -1 ? STAT_ORDER.length : i;
}

/**
 * dollId → the weapon that imprints on her. First match wins, keeping the
 * semantics of the `allWeapons.find()` this index replaced: if a sync ever
 * emitted two weapons imprinting the same doll, the answer shouldn't quietly
 * change with the lookup strategy.
 */
const weaponByImprintDollId = new Map<string, Weapon>();
for (const w of allWeapons) {
  if (w.imprintDollId && !weaponByImprintDollId.has(w.imprintDollId)) {
    weaponByImprintDollId.set(w.imprintDollId, w);
  }
}

/** The weapon that imprints on a given doll (by dollId). */
export function getWeaponForDoll(dollId: string): Weapon | undefined {
  return weaponByImprintDollId.get(dollId);
}

/**
 * A doll's weapon type ("Machine Gun", "Handgun", …).
 *
 * `doll.weaponImprintType` is null for EVERY doll Dandegate serves, so
 * reading it directly — as the filter row and the doll header used to — meant
 * the weapon-type filter matched nothing at all and the header icon never
 * rendered. The authoritative source is the type of the weapon that imprints
 * on her, which every doll has; the raw field stays first in case a later
 * sync starts populating it.
 */
export function dollWeaponType(doll: Doll): string | null {
  return (
    doll.weaponImprintType ?? getWeaponForDoll(doll.id)?.weaponType ?? null
  );
}

// --- Marker resolver ---

/**
 * Marker kinds that appear in game text — the grammar and the unresolved-name
 * fallback live in `src/share/markers.ts` so the server's no-JS bodies resolve
 * markers exactly the way this page does.
 */
export type { MarkerKind };

/**
 * Resolve `[<kind>:<uuid>]` markers in skill/weapon/vertebra text into names.
 * Returns an array of text segments — plain strings and reference objects —
 * so the renderer can wrap references in `<span title>` or `<a>`.
 *
 * A reference always carries a readable `name`, even when the id misses:
 * a raw marker in the middle of a sentence is the one thing we never emit.
 * `resolved: false` says the name is a best effort, so the renderer can
 * present it without the confident styling a real lookup earns.
 */
export interface TextRef {
  kind: MarkerKind;
  id: string;
  name: string;
  resolved: boolean;
}

export type TextSegment = string | TextRef;

/** id → display name, per marker kind. Built once below. */
const summonNameById = new Map<string, string>();
const skillNameById = new Map<string, string>();
const summonSkillNameById = new Map<string, string>();

for (const doll of allDolls) {
  indexNamedRows(skillNameById, doll.skills);
  for (const summon of indexNamedRows(summonNameById, doll.summons)) {
    indexNamedRows(summonSkillNameById, summon.skills);
  }
  // Vertebrae carry the upgraded copies of skills and summons — those upgraded
  // rows have their own ids, and text refers to them by those ids.
  for (const vert of doll.vertebrae ?? []) {
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

/** Look up a marker's display name, or null when the id is unknown. */
function markerName(kind: MarkerKind, id: string): string | null {
  switch (kind) {
    case 'effect':
      return effectById.get(id)?.effectName ?? null;
    case 'summon':
      return summonNameById.get(id) ?? null;
    case 'dollSkill':
      return skillNameById.get(id) ?? null;
    case 'skillsummon':
      return summonSkillNameById.get(id) ?? null;
    case 'key': {
      const key = allKeys.find((k) => k.id === id);
      return key?.displayTitle ?? key?.keyTitle ?? null;
    }
  }
}

/**
 * Split game text into plain strings and marker refs. The grammar, the
 * `|doll:<slug>` variant handling and the unresolved-name fallback come from
 * `src/share/markers.ts`; only the id→name lookup is local to the client.
 */
export function resolveEffectMarkers(text: string | null): TextSegment[] {
  return splitMarkers(text, markerName);
}

// --- Filter option constants ---

/**
 * Icons live in web/public/gfl2-icons/, sourced from iopwiki by
 * `npm run icons` (see src/sync/wikiIcons.ts for the GFL2-only catalog).
 *
 * `colored` marks an icon that carries its own hue — the accent-filled "on"
 * state inverts monochrome icons to dark, which would destroy a colored one,
 * so those opt out via the `data-colored` attribute.
 */
export interface FilterOption {
  id: string;
  label: string;
  icon?: string;
  colored?: boolean;
}

const ICON = (name: string) => `/gfl2-icons/${name}.png`;

export const CLASS_OPTIONS: readonly FilterOption[] = [
  { id: 'bulwark', label: 'Bulwark', icon: ICON('class-bulwark') },
  { id: 'vanguard', label: 'Vanguard', icon: ICON('class-vanguard') },
  { id: 'support', label: 'Support', icon: ICON('class-support') },
  { id: 'sentinel', label: 'Sentinel', icon: ICON('class-sentinel') },
];

export const PHASE_OPTIONS: readonly FilterOption[] = [
  { id: 'physical', label: 'Physical', icon: ICON('phase-physical') },
  { id: 'burn', label: 'Burn', icon: ICON('phase-burn'), colored: true },
  { id: 'hydro', label: 'Hydro', icon: ICON('phase-hydro'), colored: true },
  {
    id: 'electric',
    label: 'Electric',
    icon: ICON('phase-electric'),
    colored: true,
  },
  { id: 'freeze', label: 'Freeze', icon: ICON('phase-freeze'), colored: true },
  {
    id: 'corrosion',
    label: 'Corrosion',
    icon: ICON('phase-corrosion'),
    colored: true,
  },
  { id: 'omni', label: 'Omni', icon: ICON('phase-omni'), colored: true },
];

// Option ids MUST be the lowercased data values — the filters match by exact
// equality against `(doll.field ?? '').toLowerCase()`. Short codes here
// silently break the row (every selection filters to zero results).
export const AMMO_OPTIONS: readonly FilterOption[] = [
  { id: 'light ammo', label: 'Light', icon: ICON('ammo-light') },
  { id: 'medium ammo', label: 'Medium', icon: ICON('ammo-medium') },
  { id: 'heavy ammo', label: 'Heavy', icon: ICON('ammo-heavy') },
  { id: 'shotgun ammo', label: 'Shotgun', icon: ICON('ammo-shotgun') },
  { id: 'melee', label: 'Melee', icon: ICON('ammo-melee') },
];

// GFL2 has no distinct weapon-type art — iopwiki's own doll template aliases
// each weapon type onto its ammo icon, and so do we. The label carries the
// distinction the icon can't (SMG and HG both fire light ammo).
export const WEAPON_TYPE_OPTIONS: readonly FilterOption[] = [
  { id: 'assault rifle', label: 'AR', icon: ICON('ammo-medium') },
  { id: 'submachine gun', label: 'SMG', icon: ICON('ammo-light') },
  { id: 'shotgun', label: 'SG', icon: ICON('ammo-shotgun') },
  { id: 'machine gun', label: 'MG', icon: ICON('ammo-heavy') },
  { id: 'sniper rifle', label: 'RF', icon: ICON('ammo-heavy') },
  { id: 'handgun', label: 'HG', icon: ICON('ammo-light') },
  { id: 'blade', label: 'Blade', icon: ICON('ammo-melee') },
];

/**
 * Imago factors — the per-class currency the Remolding Core spends. Not a
 * filter row; these exist so the remolding section can label its costs with
 * the same icons the game and the wiki use. Distinct art from CLASS_OPTIONS.
 */
export const IMAGO_OPTIONS: readonly FilterOption[] = [
  { id: 'bulwark', label: 'Bulwark', icon: ICON('imago-bulwark') },
  { id: 'vanguard', label: 'Vanguard', icon: ICON('imago-vanguard') },
  { id: 'support', label: 'Support', icon: ICON('imago-support') },
  { id: 'sentinel', label: 'Sentinel', icon: ICON('imago-sentinel') },
];

// Rarity stays text-only: the wiki renders it as a colored block, not an icon.
export const RARITY_OPTIONS: readonly FilterOption[] = [
  { id: 'elite', label: 'Elite' },
  { id: 'standard', label: 'Standard' },
];

/** Look up a filter option's icon by row + raw data value (case-insensitive). */
function iconLookup(
  options: readonly FilterOption[]
): (value: string | null | undefined) => FilterOption | undefined {
  const byId = new Map(options.map((o) => [o.id, o]));
  return (value) =>
    value == null ? undefined : byId.get(value.toLowerCase().trim());
}

export const classOption = iconLookup(CLASS_OPTIONS);
export const imagoOption = iconLookup(IMAGO_OPTIONS);
export const phaseOption = iconLookup(PHASE_OPTIONS);
export const ammoOption = iconLookup(AMMO_OPTIONS);
export const weaponTypeOption = iconLookup(WEAPON_TYPE_OPTIONS);

/** Stats available for preference ordering in the builder. */
export const STAT_PREF_OPTIONS = [
  'ATK',
  'ATK%',
  'DEF',
  'DEF%',
  'HP',
  'HP%',
  'Crit Rate',
  'Crit DMG',
] as const;

/**
 * What a fresh build opens on. The overwhelmingly common ask is a damage
 * spread, so the builder starts there rather than on an empty list nobody
 * fills in before sharing — reorder or clear it and the card follows.
 */
export const DEFAULT_STAT_PREFS: string[] = [
  'ATK%',
  'ATK',
  'Crit Rate',
  'Crit DMG',
];

/** Weapon refinement levels (R1–R6). */
export const REFINEMENT_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Game-phase accent colors for card tinting / badges. MUST stay in sync with
 * PHASE_COLORS in src/infographics/core/theme.ts — the HTML card previews and
 * the server-rendered PNGs tint the same card from these two copies.
 */
export const PHASE_COLORS: Record<string, string> = {
  Physical: '#b0b7c3',
  Burn: '#d92d38',
  Hydro: '#0075f8',
  Electric: '#e0b04b',
  Freeze: '#00c8e0',
  Corrosion: '#00e554',
  Omni: '#bc1eb1',
};

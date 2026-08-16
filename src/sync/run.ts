/**
 * Data sync — fetches dolls (list + detail), weapons, keys, and effects
 * from Dandegate, plus attachment set bonuses from iopwiki. Normalizes
 * (strips HTML, parses double-encoded JSON) and upserts into Postgres.
 * Records every run in `gfl2_sync_runs`.
 *
 * Run with `npm run sync`.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  attachmentSets,
  dolls,
  effects,
  gfl2SyncRuns,
  keys,
  weapons,
} from '../db/schema.js';
import {
  client,
  type DollDetail,
  type EffectEntry,
  type KeyEntry,
  type WeaponEntry,
} from './client.js';
import { parseJsonField, parseOptionalInt, stripHtml } from './html.js';
import { DATA_DIR, exportJson } from './export.js';
import { deriveEffectMatrix } from '../derive/effectMatrix.js';
import { deriveEffectTags } from '../derive/effectTags.js';
import { fetchAttachmentSets, type WikiAttachmentSet } from './wiki.js';

export interface SyncSummary {
  status: 'ok' | 'partial' | 'error';
  dolls: number;
  weapons: number;
  keys: number;
  effects: number;
  attachmentSets: number;
  errors: string[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wrap a fetch so a single failure degrades the run to partial, not abort. */
async function guarded<T>(
  label: string,
  errors: string[],
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${(err as Error).message}`);
    return fallback;
  }
}

// --- Normalizers ---

function normalizeDoll(d: DollDetail) {
  return {
    id: d.id,
    name: d.name,
    class: d.class,
    phase: d.phase,
    rarity: d.rarity,
    ammoTypes: parseJsonField<string>(d.ammoTypes),
    weaponImprintType: d.weaponImprintType,
    weaponImprint: d.weaponImprint as Record<string, unknown> | null,
    avatarUrl: d.avatarUrl,
    dollImages: (d.dollImages ?? []) as Record<string, unknown>[],
    searchTags: d.searchTags ?? [],
    gunDataId: d.gunDataId ?? null,
    regionTag: d.regionTag,
    preview: d.preview ?? false,
    skills: normalizeSkills(d.skills),
    vertebrae: (d.vertebrae ?? []) as Record<string, unknown>[],
    remoldingPattern: d.remoldingPattern as Record<string, unknown> | null,
    movement: d.movement ?? null,
    stabilityGauge: d.stabilityGauge ?? null,
    summons: (d.summons ?? []) as Record<string, unknown>[],
    bio: d.effects ?? null,
    apiUpdatedAt: d.updatedAt ? new Date(d.updatedAt) : null,
  };
}

function normalizeSkills(rawSkills: unknown[]): Record<string, unknown>[] {
  return (rawSkills ?? []).map((s) => {
    const skill = s as Record<string, unknown>;
    return {
      ...skill,
      description: stripHtml(skill.description as string),
      descriptionLevel2: stripHtml(skill.descriptionLevel2 as string),
      descriptionLevel3: stripHtml(skill.descriptionLevel3 as string),
      descriptionLevel4: stripHtml(skill.descriptionLevel4 as string),
      ammoTypes: parseJsonField<string>(skill.ammoTypes),
      ammoTypesLevel2: parseJsonField<string>(skill.ammoTypesLevel2),
      ammoTypesLevel3: parseJsonField<string>(skill.ammoTypesLevel3),
      ammoTypesLevel4: parseJsonField<string>(skill.ammoTypesLevel4),
      skillTags: parseJsonField<string>(skill.skillTags),
      skillTagsLevel2: parseJsonField<string>(skill.skillTagsLevel2),
      skillTagsLevel3: parseJsonField<string>(skill.skillTagsLevel3),
      skillTagsLevel4: parseJsonField<string>(skill.skillTagsLevel4),
      keyUpgradesData: parseJsonField<unknown>(skill.keyUpgradesData),
    };
  });
}

function normalizeWeapon(w: WeaponEntry) {
  return {
    id: w.id,
    name: w.name,
    rarity: w.rarity,
    weaponType: w.weaponType,
    primaryAttribute: w.primaryAttribute,
    primaryAttributeStat: w.primaryAttributeStat ?? null,
    secondaryAttribute: w.secondaryAttribute,
    secondaryAttributeStat: w.secondaryAttributeStat,
    trait: stripHtml(w.trait),
    effect: stripHtml(w.effect),
    imprintDollId: w.imprintCharacterId,
    imprintDescription: stripHtml(w.imprintDescription),
    imageUrl: w.imageUrl,
    eliteCounterpart: w.eliteCounterpart as Record<string, unknown> | null,
    standardCounterpart: w.standardCounterpart as Record<
      string,
      unknown
    > | null,
    retiredCounterpart: w.retiredCounterpart as Record<string, unknown> | null,
    gunWeaponDataId: w.gunWeaponDataId,
    regionTag: w.regionTag,
    preview: w.preview ?? false,
    apiUpdatedAt: w.updatedAt ? new Date(w.updatedAt) : null,
  };
}

function normalizeKey(k: KeyEntry) {
  const attrs: { name: string; value: string }[] = [];
  if (k.attributeName1) {
    attrs.push({ name: k.attributeName1, value: k.attributeValue1 ?? '' });
  }
  if (k.attributeName2) {
    attrs.push({ name: k.attributeName2, value: k.attributeValue2 ?? '' });
  }
  if (k.attributeName3) {
    attrs.push({ name: k.attributeName3, value: k.attributeValue3 ?? '' });
  }

  return {
    id: k.id,
    keyTitle: k.keyTitle,
    displayTitle: k.displayTitle,
    keyType: k.keyType,
    level: parseOptionalInt(k.level),
    attributes: attrs.length > 0 ? attrs : null,
    effect: stripHtml(k.effect),
    materials:
      k.materialsType != null
        ? { type: k.materialsType, data: k.materialsData }
        : null,
    dollId: k.dollId,
    imageUrl: k.imageUrl,
    regionTag: k.regionTag,
    searchTags: k.searchTags ?? [],
    apiUpdatedAt: k.updatedAt ? new Date(k.updatedAt) : null,
  };
}

function normalizeEffect(e: EffectEntry) {
  return {
    id: e.id,
    effectName: e.effectName,
    effectDetails: stripHtml(e.effectDetails),
    effectTags: e.effectTags ?? [],
    dollId: e.dollId,
    regionTag: e.regionTag,
    preview: e.preview ?? false,
    apiUpdatedAt: e.updatedAt ? new Date(e.updatedAt) : null,
  };
}

// --- Upsert helpers ---

async function upsertDolls(
  rows: ReturnType<typeof normalizeDoll>[]
): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    await db
      .insert(dolls)
      .values(batch)
      .onConflictDoUpdate({
        target: dolls.id,
        set: {
          name: sql`excluded.name`,
          class: sql`excluded.class`,
          phase: sql`excluded.phase`,
          rarity: sql`excluded.rarity`,
          ammoTypes: sql`excluded.ammo_types`,
          weaponImprintType: sql`excluded.weapon_imprint_type`,
          weaponImprint: sql`excluded.weapon_imprint`,
          avatarUrl: sql`excluded.avatar_url`,
          dollImages: sql`excluded.doll_images`,
          searchTags: sql`excluded.search_tags`,
          gunDataId: sql`excluded.gun_data_id`,
          regionTag: sql`excluded.region_tag`,
          preview: sql`excluded.preview`,
          skills: sql`excluded.skills`,
          vertebrae: sql`excluded.vertebrae`,
          remoldingPattern: sql`excluded.remolding_pattern`,
          movement: sql`excluded.movement`,
          stabilityGauge: sql`excluded.stability_gauge`,
          summons: sql`excluded.summons`,
          bio: sql`excluded.bio`,
          apiUpdatedAt: sql`excluded.api_updated_at`,
          syncedAt: sql`now()`,
        },
      });
  }
}

async function upsertWeapons(
  rows: ReturnType<typeof normalizeWeapon>[]
): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    await db
      .insert(weapons)
      .values(batch)
      .onConflictDoUpdate({
        target: weapons.id,
        set: {
          name: sql`excluded.name`,
          rarity: sql`excluded.rarity`,
          weaponType: sql`excluded.weapon_type`,
          primaryAttribute: sql`excluded.primary_attribute`,
          primaryAttributeStat: sql`excluded.primary_attribute_stat`,
          secondaryAttribute: sql`excluded.secondary_attribute`,
          secondaryAttributeStat: sql`excluded.secondary_attribute_stat`,
          trait: sql`excluded.trait`,
          effect: sql`excluded.effect`,
          imprintDollId: sql`excluded.imprint_doll_id`,
          imprintDescription: sql`excluded.imprint_description`,
          imageUrl: sql`excluded.image_url`,
          eliteCounterpart: sql`excluded.elite_counterpart`,
          standardCounterpart: sql`excluded.standard_counterpart`,
          retiredCounterpart: sql`excluded.retired_counterpart`,
          gunWeaponDataId: sql`excluded.gun_weapon_data_id`,
          regionTag: sql`excluded.region_tag`,
          preview: sql`excluded.preview`,
          apiUpdatedAt: sql`excluded.api_updated_at`,
          syncedAt: sql`now()`,
        },
      });
  }
}

async function upsertKeys(
  rows: ReturnType<typeof normalizeKey>[]
): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    await db
      .insert(keys)
      .values(batch)
      .onConflictDoUpdate({
        target: keys.id,
        set: {
          keyTitle: sql`excluded.key_title`,
          displayTitle: sql`excluded.display_title`,
          keyType: sql`excluded.key_type`,
          level: sql`excluded.level`,
          attributes: sql`excluded.attributes`,
          effect: sql`excluded.effect`,
          materials: sql`excluded.materials`,
          dollId: sql`excluded.doll_id`,
          imageUrl: sql`excluded.image_url`,
          regionTag: sql`excluded.region_tag`,
          searchTags: sql`excluded.search_tags`,
          apiUpdatedAt: sql`excluded.api_updated_at`,
          syncedAt: sql`now()`,
        },
      });
  }
}

async function upsertEffects(
  rows: ReturnType<typeof normalizeEffect>[]
): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    await db
      .insert(effects)
      .values(batch)
      .onConflictDoUpdate({
        target: effects.id,
        set: {
          effectName: sql`excluded.effect_name`,
          effectDetails: sql`excluded.effect_details`,
          effectTags: sql`excluded.effect_tags`,
          dollId: sql`excluded.doll_id`,
          regionTag: sql`excluded.region_tag`,
          preview: sql`excluded.preview`,
          apiUpdatedAt: sql`excluded.api_updated_at`,
          syncedAt: sql`now()`,
        },
      });
  }
}

async function upsertAttachmentSets(rows: WikiAttachmentSet[]): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    await db
      .insert(attachmentSets)
      .values(batch)
      .onConflictDoUpdate({
        target: attachmentSets.name,
        set: {
          piecesRequired: sql`excluded.pieces_required`,
          description: sql`excluded.description`,
          syncedAt: sql`now()`,
        },
      });
  }
}

// --- Main sync ---

export async function runSync(trigger?: string): Promise<SyncSummary> {
  const startedAt = new Date();
  const errors: string[] = [];

  console.log('Fetching dolls list...');
  const dollList = await guarded(
    'dolls-list',
    errors,
    () => client.fetchDolls(),
    []
  );

  console.log(`Fetching ${dollList.length} doll details...`);
  const dollDetails: DollDetail[] = [];
  for (const doll of dollList) {
    const detail = await guarded<DollDetail | null>(
      `doll:${doll.name}`,
      errors,
      () => client.fetchDollDetail(doll.name),
      null
    );
    if (detail) {
      dollDetails.push(detail);
    }
    await sleep(50);
  }

  console.log('Fetching weapons, keys, effects, attachment sets...');
  const [weaponList, keyList, effectList, attachmentSetList] =
    await Promise.all([
      guarded('weapons', errors, () => client.fetchWeapons(), []),
      guarded('keys', errors, () => client.fetchKeys(), []),
      guarded('effects', errors, () => client.fetchEffects(), []),
      guarded('attachment-sets', errors, () => fetchAttachmentSets(), []),
    ]);

  console.log('Normalizing...');
  const normalizedDolls = dollDetails.map(normalizeDoll);
  const normalizedWeapons = weaponList.map(normalizeWeapon);
  const normalizedKeys = keyList.map(normalizeKey);
  const normalizedEffects = effectList.map(normalizeEffect);

  console.log(
    `Upserting: ${normalizedDolls.length} dolls, ${normalizedWeapons.length} weapons, ${normalizedKeys.length} keys, ${normalizedEffects.length} effects, ${attachmentSetList.length} attachment sets`
  );

  await guarded(
    'upsert-dolls',
    errors,
    () => upsertDolls(normalizedDolls),
    undefined
  );
  await guarded(
    'upsert-weapons',
    errors,
    () => upsertWeapons(normalizedWeapons),
    undefined
  );
  await guarded(
    'upsert-keys',
    errors,
    () => upsertKeys(normalizedKeys),
    undefined
  );
  await guarded(
    'upsert-effects',
    errors,
    () => upsertEffects(normalizedEffects),
    undefined
  );
  await guarded(
    'upsert-attachment-sets',
    errors,
    () => upsertAttachmentSets(attachmentSetList),
    undefined
  );

  // Export committed JSON artifacts for the web app (build-time imports)
  await guarded('export-json', errors, () => exportJson(), undefined);

  // Derive the effect matrix and effect tags from the exported artifacts
  await guarded(
    'derive-effect-matrix',
    errors,
    async () => {
      await deriveEffectMatrix(DATA_DIR);
      await deriveEffectTags(DATA_DIR);
    },
    undefined
  );

  const status: SyncSummary['status'] = errors.length
    ? normalizedDolls.length > 0 || normalizedWeapons.length > 0
      ? 'partial'
      : 'error'
    : 'ok';

  const sources = {
    counts: {
      dolls: normalizedDolls.length,
      weapons: normalizedWeapons.length,
      keys: normalizedKeys.length,
      effects: normalizedEffects.length,
      attachmentSets: attachmentSetList.length,
    },
    errors,
  };

  await db.insert(gfl2SyncRuns).values({
    startedAt,
    finishedAt: new Date(),
    status,
    trigger: trigger ?? null,
    sources,
  });

  return {
    status,
    dolls: normalizedDolls.length,
    weapons: normalizedWeapons.length,
    keys: normalizedKeys.length,
    effects: normalizedEffects.length,
    attachmentSets: attachmentSetList.length,
    errors,
  };
}

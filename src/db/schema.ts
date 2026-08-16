import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Dolls (characters) — merged from the list endpoint + per-doll detail.
 * `id` is the dandegate UUID; `regionTag` distinguishes en/cn releases.
 */
export const dolls = pgTable('dolls', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  class: text('class'),
  phase: text('phase'),
  rarity: text('rarity'),
  ammoTypes: jsonb('ammo_types'),
  weaponImprintType: text('weapon_imprint_type'),
  weaponImprint: jsonb('weapon_imprint'),
  avatarUrl: text('avatar_url'),
  dollImages: jsonb('doll_images'),
  searchTags: text('search_tags').array(),
  gunDataId: integer('gun_data_id'),
  regionTag: text('region_tag'),
  preview: boolean('preview'),
  skills: jsonb('skills'),
  vertebrae: jsonb('vertebrae'),
  remoldingPattern: jsonb('remolding_pattern'),
  movement: integer('movement'),
  stabilityGauge: integer('stability_gauge'),
  summons: jsonb('summons'),
  bio: text('bio'),
  apiUpdatedAt: timestamp('api_updated_at'),
  syncedAt: timestamp('synced_at').defaultNow(),
});

/**
 * Weapons — each row is one weapon variant. Counterpart links point at other
 * weapon rows by UUID.
 */
export const weapons = pgTable('weapons', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  rarity: text('rarity'),
  weaponType: text('weapon_type'),
  primaryAttribute: text('primary_attribute'),
  primaryAttributeStat: integer('primary_attribute_stat'),
  secondaryAttribute: text('secondary_attribute'),
  secondaryAttributeStat: text('secondary_attribute_stat'),
  trait: text('trait'),
  effect: text('effect'),
  imprintDollId: uuid('imprint_doll_id'),
  imprintDescription: text('imprint_description'),
  imageUrl: text('image_url'),
  eliteCounterpart: jsonb('elite_counterpart'),
  standardCounterpart: jsonb('standard_counterpart'),
  retiredCounterpart: jsonb('retired_counterpart'),
  gunWeaponDataId: integer('gun_weapon_data_id'),
  regionTag: text('region_tag'),
  preview: boolean('preview'),
  apiUpdatedAt: timestamp('api_updated_at'),
  syncedAt: timestamp('synced_at').defaultNow(),
});

/**
 * Keys — attribute bonuses tied to a doll. `attributes` is a normalized array
 * of {name, value} pairs.
 */
export const keys = pgTable('keys', {
  id: uuid('id').primaryKey(),
  keyTitle: text('key_title'),
  displayTitle: text('display_title'),
  keyType: text('key_type'),
  level: integer('level'),
  attributes: jsonb('attributes'),
  effect: text('effect'),
  materials: jsonb('materials'),
  dollId: uuid('doll_id'),
  imageUrl: text('image_url'),
  regionTag: text('region_tag'),
  searchTags: text('search_tags').array(),
  apiUpdatedAt: timestamp('api_updated_at'),
  syncedAt: timestamp('synced_at').defaultNow(),
});

/**
 * Effects — buffs/debuffs. Exclusive effects are linked to a doll via
 * `dollId`; generic effects have null.
 */
export const effects = pgTable('effects', {
  id: uuid('id').primaryKey(),
  effectName: text('effect_name'),
  effectDetails: text('effect_details'),
  effectTags: text('effect_tags').array(),
  dollId: uuid('doll_id'),
  regionTag: text('region_tag'),
  preview: boolean('preview'),
  apiUpdatedAt: timestamp('api_updated_at'),
  syncedAt: timestamp('synced_at').defaultNow(),
});

/**
 * Attachment set bonuses — scraped from iopwiki. `name` is the primary key
 * (set names are unique on the wiki page).
 */
export const attachmentSets = pgTable('attachment_sets', {
  name: text('name').primaryKey(),
  piecesRequired: integer('pieces_required').notNull(),
  description: text('description').notNull(),
  syncedAt: timestamp('synced_at').defaultNow(),
});

/**
 * Sync audit log — one row per `npm run sync` invocation. `sources` carries
 * counts per entity type plus any errors encountered.
 */
export const gfl2SyncRuns = pgTable('gfl2_sync_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at').notNull(),
  finishedAt: timestamp('finished_at'),
  status: text('status').notNull(),
  trigger: text('trigger'),
  sources: jsonb('sources'),
});

/**
 * User profiles — saved client blobs (e.g. team-builder squads) keyed by
 * Discord user + kind + name. `code` is an opaque base64url payload; the DB
 * never interprets it. The (discordId, kind, name) unique index backs the
 * save-by-name upsert in src/server/app.ts.
 */
export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    discordId: text('discord_id').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('user_profiles_discord_id_idx').on(t.discordId),
    uniqueIndex('user_profiles_discord_id_kind_name_uq').on(
      t.discordId,
      t.kind,
      t.name
    ),
  ]
);

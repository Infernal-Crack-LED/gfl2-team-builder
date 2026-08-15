CREATE TABLE "dolls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"class" text,
	"phase" text,
	"rarity" text,
	"ammo_types" jsonb,
	"weapon_imprint_type" text,
	"weapon_imprint" jsonb,
	"avatar_url" text,
	"doll_images" jsonb,
	"search_tags" text[],
	"gun_data_id" integer,
	"region_tag" text,
	"preview" boolean,
	"skills" jsonb,
	"vertebrae" jsonb,
	"remolding_pattern" jsonb,
	"movement" integer,
	"stability_gauge" integer,
	"summons" jsonb,
	"bio" text,
	"api_updated_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "effects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"effect_name" text,
	"effect_details" text,
	"effect_tags" text[],
	"doll_id" uuid,
	"region_tag" text,
	"preview" boolean,
	"api_updated_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gfl2_sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"status" text NOT NULL,
	"trigger" text,
	"sources" jsonb
);
--> statement-breakpoint
CREATE TABLE "keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key_title" text,
	"display_title" text,
	"key_type" text,
	"level" integer,
	"attributes" jsonb,
	"effect" text,
	"materials" jsonb,
	"doll_id" uuid,
	"image_url" text,
	"region_tag" text,
	"search_tags" text[],
	"api_updated_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "weapons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rarity" text,
	"weapon_type" text,
	"primary_attribute" text,
	"primary_attribute_stat" integer,
	"secondary_attribute" text,
	"secondary_attribute_stat" text,
	"trait" text,
	"effect" text,
	"imprint_doll_id" uuid,
	"imprint_description" text,
	"image_url" text,
	"elite_counterpart" jsonb,
	"standard_counterpart" jsonb,
	"retired_counterpart" jsonb,
	"gun_weapon_data_id" integer,
	"region_tag" text,
	"preview" boolean,
	"api_updated_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);

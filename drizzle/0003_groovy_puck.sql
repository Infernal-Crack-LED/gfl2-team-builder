CREATE TABLE "doll_recommendations" (
	"doll_slug" text PRIMARY KEY NOT NULL,
	"breakpoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"optimal" text,
	"weapon_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"set_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fixed_key_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expansion_key_id" text,
	"common_key_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stat_prefs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"source" text DEFAULT 'sheet' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

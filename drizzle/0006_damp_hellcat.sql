CREATE TABLE "doll_gunsmoke_guides" (
	"doll_slug" text PRIMARY KEY NOT NULL,
	"class_tab" text,
	"fixed_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_keys" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rotations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'sheet' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

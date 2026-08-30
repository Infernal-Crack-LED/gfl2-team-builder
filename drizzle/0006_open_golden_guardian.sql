CREATE TABLE "platoon_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platoon_id" uuid NOT NULL,
	"discord_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platoons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"sheet_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_dolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"doll_slug" text NOT NULL,
	"vertebrae" integer,
	"power" integer,
	"level" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_players" (
	"discord_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"player_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "platoon_members_platoon_discord_uq" ON "platoon_members" USING btree ("platoon_id","discord_id");--> statement-breakpoint
CREATE INDEX "platoon_members_discord_id_idx" ON "platoon_members" USING btree ("discord_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platoons_guild_id_name_uq" ON "platoons" USING btree ("guild_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_dolls_discord_slug_uq" ON "roster_dolls" USING btree ("discord_id","doll_slug");--> statement-breakpoint
CREATE INDEX "roster_dolls_discord_id_idx" ON "roster_dolls" USING btree ("discord_id");
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_profiles_discord_id_idx" ON "user_profiles" USING btree ("discord_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_discord_id_kind_name_uq" ON "user_profiles" USING btree ("discord_id","kind","name");
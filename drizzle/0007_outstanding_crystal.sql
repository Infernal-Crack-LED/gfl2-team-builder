DROP INDEX "platoons_guild_id_name_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "platoons_guild_id_name_uq" ON "platoons" USING btree ("guild_id",lower("name"));
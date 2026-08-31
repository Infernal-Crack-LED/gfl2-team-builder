-- IF NOT EXISTS: an earlier numbering of this migration (0007, pre-merge of
-- the platoon-roster branch) already added these columns on the live DB; the
-- renumbered file must re-apply harmlessly there.
ALTER TABLE "keys" ADD COLUMN IF NOT EXISTS "display_slot" integer;--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN IF NOT EXISTS "unlock_level" integer;

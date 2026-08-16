CREATE TABLE "attachment_sets" (
	"name" text PRIMARY KEY NOT NULL,
	"pieces_required" integer NOT NULL,
	"description" text NOT NULL,
	"synced_at" timestamp DEFAULT now()
);

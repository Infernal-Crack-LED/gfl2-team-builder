CREATE TABLE "infographics" (
	"id" text PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"moment_id" text,
	"title" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

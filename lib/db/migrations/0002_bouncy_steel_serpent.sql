CREATE TABLE "component_stats" (
	"slug" text PRIMARY KEY NOT NULL,
	"favorite_count" integer DEFAULT 0 NOT NULL,
	"install_count" integer DEFAULT 0 NOT NULL,
	"copy_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Enable RLS with no policy → deny-all to anon/authenticated over PostgREST.
-- All access is server-side via the privileged Drizzle connection (bypasses RLS),
-- matching the deny-all pattern established for the other public tables in 0001.
ALTER TABLE "component_stats" ENABLE ROW LEVEL SECURITY;

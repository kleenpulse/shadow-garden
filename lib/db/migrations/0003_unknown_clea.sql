CREATE TABLE "component_views" (
	"slug" text NOT NULL,
	"visitor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_views_slug_visitor_id_pk" PRIMARY KEY("slug","visitor_id")
);
--> statement-breakpoint
-- Enable RLS with no policy → deny-all to anon/authenticated over PostgREST.
-- All access is server-side via the privileged Drizzle connection (bypasses RLS),
-- matching the deny-all pattern established for the other public tables.
ALTER TABLE "component_views" ENABLE ROW LEVEL SECURITY;

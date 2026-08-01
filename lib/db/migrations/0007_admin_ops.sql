-- Admin operations: the operations console's gate columns and its audit ledger.
--
-- Authored HERE because this repo is the sole DDL owner. The admin console
-- (admin_shadow-garden) carries a byte-identical read-model copy of schema.ts
-- and runs no migrations of its own — its drift check enforces that copy.
--
-- `role` and `banned*` sit on profiles rather than in a side table: they are
-- per-account facts the gate reads on every single request, and a join for a
-- boolean on the hot authorization path is not worth the normalization.
--
-- Deliberately NOT here: the operator's role='admin' grant. It would match zero
-- rows (the account does not exist yet) and fail silently. Grant it by hand
-- after creating the operator in the Supabase dashboard.

CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "banned_reason" text;--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_action_target_idx" ON "admin_audit" USING btree ("action","target","created_at");--> statement-breakpoint

-- RLS deny-all, mirroring 0001_auth_link_and_rls.sql and 0005. Drizzle cannot
-- express this. RLS enabled with no policy denies the anon/authenticated roles
-- direct PostgREST access by default; both apps reach this table through the
-- privileged server-side connection, which bypasses RLS.
--
-- Without this line the operator's entire action log — every ban, every reason
-- string, every payload — is world-readable over PostgREST with nothing but the
-- publishable key that ships in the browser bundle.
ALTER TABLE "admin_audit" ENABLE ROW LEVEL SECURITY;

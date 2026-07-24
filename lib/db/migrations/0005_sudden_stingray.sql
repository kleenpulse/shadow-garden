CREATE TYPE "public"."feedback_type" AS ENUM('bug', 'idea', 'other');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"visitor_id" text,
	"email" text,
	"type" "feedback_type" DEFAULT 'bug' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"page" text,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
-- RLS deny-all (mirrors 0001_auth_link_and_rls.sql): RLS on + no policy denies the
-- anon/authenticated roles direct PostgREST access. All feedback access flows through
-- the privileged server-side Drizzle connection, which bypasses RLS.
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;
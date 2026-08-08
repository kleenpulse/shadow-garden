CREATE TYPE "public"."feedback_type" AS ENUM('bug', 'idea', 'other');--> statement-breakpoint
CREATE TABLE "component_stats" (
	"slug" text PRIMARY KEY NOT NULL,
	"favorite_count" integer DEFAULT 0 NOT NULL,
	"install_count" integer DEFAULT 0 NOT NULL,
	"copy_count" integer DEFAULT 0 NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_views" (
	"slug" text NOT NULL,
	"visitor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_views_slug_visitor_id_pk" PRIMARY KEY("slug","visitor_id")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");
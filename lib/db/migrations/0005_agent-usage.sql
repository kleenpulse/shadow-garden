CREATE TABLE "agent_usage" (
	"day" date NOT NULL,
	"visitor" text NOT NULL,
	"questions" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "agent_usage_day_visitor_pk" PRIMARY KEY("day","visitor")
);
--> statement-breakpoint
ALTER TABLE "agent_usage" ENABLE ROW LEVEL SECURITY;
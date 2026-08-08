CREATE TABLE "favorites" (
	"slug" text NOT NULL,
	"visitor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_slug_visitor_id_pk" PRIMARY KEY("slug","visitor_id")
);

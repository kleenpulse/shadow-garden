import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// The database is anonymous engagement tracking only — no accounts, no
// billing. Identity, where a row needs one, is the per-browser `sg_vid`
// cookie minted by the API routes.
//
// Every table carries `.enableRLS()` with NO policies: all access goes through
// the server's DATABASE_URL connection (table owner, bypasses RLS), and
// RLS-on/no-policy denies the Supabase REST API outright — the public anon key
// can neither read nor write these tables. Declared here so a freshly migrated
// table can never ship "UNRESTRICTED" again.

// What a feedback submission is about. Stable domain → native pg enum.
// Adding a value later needs an ALTER TYPE migration.
export const feedbackType = pgEnum("feedback_type", ["bug", "idea", "other"]);

// Per-component engagement ledger, keyed by the registry `slug` (no FK — the
// code-side registry is the catalog of record; this table only holds counters).
// Rows are created lazily on first event via upsert. Counts are best-effort
// social-proof signals, incremented anonymously.
export const componentStats = pgTable("component_stats", {
	slug: text("slug").primaryKey(),
	favoriteCount: integer("favorite_count").default(0).notNull(),
	installCount: integer("install_count").default(0).notNull(),
	copyCount: integer("copy_count").default(0).notNull(), // raw-source copy
	promptCount: integer("prompt_count").default(0).notNull(), // AI integration brief copied
	viewCount: integer("view_count").default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
}).enableRLS();

// Per-visitor favorites ledger — one row per (component, visitor), keyed by the
// per-browser `sg_vid` cookie. The browser's localStorage store stays the UI's
// source of truth; this ledger is the tracking mirror, and it makes
// component_stats.favorite_count exact: the count moves only when a pair is
// actually inserted or deleted here, so toggle-spam cannot inflate it.
export const favorites = pgTable(
	"favorites",
	{
		slug: text("slug").notNull(),
		visitorId: text("visitor_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.slug, t.visitorId] })],
).enableRLS();

// Dedup ledger for VIEW counts — one row per (component, viewer). `visitor_id`
// is the per-browser `sg_vid` cookie. A view bumps component_stats.view_count
// only when a brand-new pair is inserted here, so refreshes and re-navigation
// never inflate the count. Composite PK gives uniqueness for free.
export const componentViews = pgTable(
	"component_views",
	{
		slug: text("slug").notNull(),
		visitorId: text("visitor_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.slug, t.visitorId] })],
).enableRLS();

// User-submitted feedback + bug reports. Fully anonymous: `visitor_id` (the
// sg_vid cookie) attributes submissions and backs the per-identity submit
// throttle; `email` is an optional reply channel the submitter volunteers.
// `context` holds best-effort device/browser/locale/geo telemetry captured at
// submit time. Operators triage `status` from the admin console.
export const feedback = pgTable(
	"feedback",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		visitorId: text("visitor_id"),
		email: text("email"),
		type: feedbackType("type").notNull().default("bug"),
		status: text("status").notNull().default("new"), // 'new' | 'triaged' | 'resolved'
		subject: text("subject"),
		message: text("message").notNull(),
		page: text("page"),
		context: jsonb("context"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("feedback_created_idx").on(t.createdAt),
		index("feedback_status_idx").on(t.status),
	],
).enableRLS();

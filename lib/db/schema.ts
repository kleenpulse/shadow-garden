import {
	boolean,
	date,
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
import { relations } from "drizzle-orm";

// Engagement tracking stays anonymous (per-browser `sg_vid` cookie minted by
// the API routes); accounts exist only for billing — `profiles` mirrors the
// Supabase auth uid and `entitlements` holds the Pro purchase state.
//
// Supabase owns `auth.users` (in the `auth` schema, not Drizzle-managed). Drizzle
// manages the `public` schema only. `profiles.id` mirrors the auth uid; the actual
// FK to auth.users(id) + the insert trigger are added in a hand-written SQL
// migration, since Drizzle can't reference a table in a schema it doesn't own.
//
// Every table carries `.enableRLS()` with NO policies: all access goes through
// the server's DATABASE_URL connection (table owner, bypasses RLS), and
// RLS-on/no-policy denies the Supabase REST API outright — the public anon key
// can neither read nor write these tables. Declared here so a freshly migrated
// table can never ship "UNRESTRICTED" again.

export const entitlementType = pgEnum("entitlement_type", [
	"subscription",
	"lifetime",
]);

export const entitlementStatus = pgEnum("entitlement_status", [
	"active",
	"canceled",
	"revoked",
	"past_due",
	"expired",
	"incomplete",
]);

// What a feedback submission is about. Stable domain → native pg enum.
// Adding a value later needs an ALTER TYPE migration.
export const feedbackType = pgEnum("feedback_type", ["bug", "idea", "other"]);

export const profiles = pgTable("profiles", {
	id: uuid("id").primaryKey(), // == auth.users(id); FK added via SQL migration
	email: text("email"),
	displayName: text("display_name"),
	// Set the first time we send the welcome email. The auth callback claims it
	// with a conditional UPDATE (WHERE ... IS NULL) so the welcome fires exactly
	// once even though the callback runs on every login.
	welcomeEmailSentAt: timestamp("welcome_email_sent_at", { withTimezone: true }),
	// Admin gate — read by the operations console on every gated request. Nothing
	// in the customer app writes it; it is granted by hand in SQL. 'user' | 'admin'.
	role: text("role").notNull().default("user"),
	// Kill Switch — the durable ban record. auth.users.banned_until blocks token
	// REFRESH at the auth server, so an already-issued access token survives until
	// it expires; these columns are what an app-side gate re-checks in the meantime.
	banned: boolean("banned").notNull().default(false),
	bannedAt: timestamp("banned_at", { withTimezone: true }),
	bannedReason: text("banned_reason"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
}).enableRLS();

// Single row per user — the resolved source of truth for the `pro` flag. `pro` is
// DERIVED, never stored: status='active' AND (current_period_end IS NULL OR > now()).
export const entitlements = pgTable("entitlements", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.notNull()
		.unique()
		.references(() => profiles.id, { onDelete: "cascade" }),
	type: entitlementType("type").notNull(),
	status: entitlementStatus("status").notNull(),
	polarCustomerId: text("polar_customer_id"),
	polarSubscriptionId: text("polar_subscription_id"), // subscription only
	polarOrderId: text("polar_order_id"), // lifetime only
	polarProductId: text("polar_product_id"),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }), // NULL == lifetime
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
}).enableRLS();

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

// Daily counters for the assistant's free tier (app/api/agent/llm), where the
// site's own OpenRouter key answers a visitor who has not connected a model.
// One row per (UTC day, visitor), plus one row per day whose visitor is "*" for
// the site-wide cap. `visitor` is a SHA-256 of the day, the client IP and a
// server secret (lib/agent/free-tier-server.ts): no IP is stored, and a hash
// cannot be linked from one day to the next. `questions` counts chat messages
// the visitor sent; `calls` counts model calls, several per question.
export const agentUsage = pgTable(
	"agent_usage",
	{
		day: date("day").notNull(),
		visitor: text("visitor").notNull(),
		questions: integer("questions").notNull().default(0),
		calls: integer("calls").notNull().default(0),
	},
	(t) => [primaryKey({ columns: [t.day, t.visitor] })],
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

export const profilesRelations = relations(profiles, ({ one }) => ({
	entitlement: one(entitlements, {
		fields: [profiles.id],
		references: [entitlements.userId],
	}),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
	profile: one(profiles, {
		fields: [entitlements.userId],
		references: [profiles.id],
	}),
}));

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Supabase owns `auth.users` (in the `auth` schema, not Drizzle-managed). Drizzle
// manages the `public` schema only. `profiles.id` mirrors the auth uid; the actual
// FK to auth.users(id) + the insert trigger are added in a hand-written SQL migration
// (Phase 1), since Drizzle can't reference a table in a schema it doesn't own.

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

// What a feedback submission is about. Stable domain → native pg enum (mirrors the
// entitlement enums). Adding a value later needs an ALTER TYPE migration.
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
});

// Append-only ledger of every guarded mutation an operator performs. Written by
// the admin console (admin_shadow-garden); nothing in the customer app touches it.
// It lives in this schema because this repo is the sole DDL owner — the console
// carries a read-model copy and runs no migrations of its own.
//
// `target` has no FK: it holds a user id OR a component slug OR a literal like
// 'voice-brief', and the ledger must outlive the account it describes.
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(), // 'ban' | 'unban' | 'grant_pro' | 'revoke_pro' | ...
    target: text("target").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // recentAudit(): ORDER BY created_at DESC LIMIT n.
    index("admin_audit_created_idx").on(t.createdAt),
    // The expiring-notice cron's per-user dedup probe walks action + target
    // within a date window before deciding whether to send.
    index("admin_audit_action_target_idx").on(t.action, t.target, t.createdAt),
  ],
);

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
});

// Phase 5. Cross-device favorites; anonymous favorites stay in localStorage.
export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("favorites_user_slug_unq").on(t.userId, t.slug),
    index("favorites_user_idx").on(t.userId),
  ],
);

// Per-component engagement ledger, keyed by the registry `slug` (no FK — the
// code-side registry is the catalog of record; this table only holds counters).
// Rows are created lazily on first event via upsert. `pro` gating is irrelevant
// here: counts are best-effort social-proof signals, incremented anonymously.
export const componentStats = pgTable("component_stats", {
  slug: text("slug").primaryKey(),
  favoriteCount: integer("favorite_count").default(0).notNull(),
  installCount: integer("install_count").default(0).notNull(),
  copyCount: integer("copy_count").default(0).notNull(), // raw-source copy (Pro intent)
  promptCount: integer("prompt_count").default(0).notNull(), // AI integration brief copied
  viewCount: integer("view_count").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Dedup ledger for VIEW counts — one row per (component, viewer). `visitor_id` is the
// signed-in user id when available, else a per-browser `sg_vid` cookie. A view bumps
// component_stats.view_count only when a brand-new pair is inserted here, so refreshes
// and re-navigation never inflate the count. Composite PK gives uniqueness for free.
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
);

// User-submitted feedback + bug reports from the customer app. Anonymous-friendly:
// `user_id` is nullable and SET NULL on account deletion (reports outlive accounts);
// `visitor_id` (the sg_vid cookie) attributes anonymous submissions and backs the
// per-identity submit throttle. `context` holds best-effort device/browser/locale/geo
// telemetry captured at submit time. Operators triage `status` from the admin console.
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
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
    index("feedback_user_idx").on(t.userId),
  ],
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  entitlement: one(entitlements, {
    fields: [profiles.id],
    references: [entitlements.userId],
  }),
  favorites: many(favorites),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  profile: one(profiles, {
    fields: [entitlements.userId],
    references: [profiles.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  profile: one(profiles, {
    fields: [favorites.userId],
    references: [profiles.id],
  }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  profile: one(profiles, {
    fields: [feedback.userId],
    references: [profiles.id],
  }),
}));

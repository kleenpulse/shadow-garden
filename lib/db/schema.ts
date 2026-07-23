import {
  boolean,
  index,
  integer,
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

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // == auth.users(id); FK added via SQL migration
  email: text("email"),
  displayName: text("display_name"),
  // Set the first time we send the welcome email. The auth callback claims it
  // with a conditional UPDATE (WHERE ... IS NULL) so the welcome fires exactly
  // once even though the callback runs on every login.
  welcomeEmailSentAt: timestamp("welcome_email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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

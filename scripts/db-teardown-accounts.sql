-- One-time teardown: removes every account/billing object from a database that
-- ran the old schema (profiles, entitlements, admin_audit, per-user favorites),
-- leaving only the anonymous tracking tables (component_stats, component_views,
-- feedback). Run once against the Supabase project (SQL editor or psql on
-- DIRECT_URL) BEFORE running the new 0000_baseline migration bookkeeping.
--
-- Destructive and irreversible — take a backup first if any of this data matters.

BEGIN;

-- The signup trigger that mirrored auth.users into public.profiles.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- The surviving feedback table drops its account column first — its FK to
-- profiles must go before profiles can. DROP COLUMN takes the FK with it.
ALTER TABLE IF EXISTS public.feedback DROP COLUMN IF EXISTS user_id;
DROP INDEX IF EXISTS public.feedback_user_idx;

-- Per-user favorites die with accounts; favorites live in the browser now and
-- the aggregate count lives in component_stats.favorite_count.
DROP TABLE IF EXISTS public.favorites;

-- Billing + identity + ops ledger. entitlements first (FK → profiles).
DROP TABLE IF EXISTS public.entitlements;
DROP TABLE IF EXISTS public.admin_audit;
DROP TABLE IF EXISTS public.profiles;

DROP TYPE IF EXISTS public.entitlement_status;
DROP TYPE IF EXISTS public.entitlement_type;

COMMIT;

-- Afterwards, reset drizzle's migration bookkeeping so the new baseline is
-- recorded as applied without re-creating the surviving tables:
--   TRUNCATE drizzle.__drizzle_migrations;
-- then run `bun run db:migrate` once (it will no-op on the existing tables only
-- if they already match the baseline — on a mismatch, prefer `db:push`).
